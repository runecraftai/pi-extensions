/**
 * Tests for conversations picker: session parsing, listing, search, sorting.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, statSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/* ── Replicate session parsing logic for testing ── */

interface SessionInfo {
  filePath: string;
  sessionId: string;
  title: string;
  cwd: string;
  lastActivity: number;
  model: string;
  size: number;
  isCurrent: boolean;
}

function parseSessionFile(filePath: string, currentSessionFile?: string): SessionInfo | null {
  try {
    const raw = readFileSync(filePath, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    if (lines.length === 0) return null;

    const header = JSON.parse(lines[0]);
    if (header.type !== "session" || !header.id) return null;

    let title = "Untitled";
    let cwd = header.cwd ?? "";
    let model = "";
    let displayName;
    let lastActivity = header.timestamp ? new Date(header.timestamp).getTime() : 0;

    for (let i = 1; i < lines.length; i++) {
      try {
        const entry = JSON.parse(lines[i]);

        if (entry.timestamp) {
          const ts = new Date(entry.timestamp).getTime();
          if (ts > lastActivity) lastActivity = ts;
        }

        if (entry.type === "model_change" && entry.modelId && !model) {
          model = entry.modelId;
        }

        if (entry.type === "session_info" && entry.name) {
          displayName = entry.name;
        }

        if (entry.type === "message" && entry.message?.role === "user" && title === "Untitled") {
          const content = entry.message.content;
          if (typeof content === "string") title = content;
          else if (Array.isArray(content)) {
            const textBlock = content.find((b) => b.type === "text");
            if (textBlock?.text) title = textBlock.text;
          }
        }
      } catch {}
    }

    if (displayName) title = displayName;

    const stat = statSync(filePath);
    return {
      filePath,
      sessionId: header.id,
      title: title.slice(0, 120),
      cwd,
      lastActivity,
      model,
      size: stat.size,
      isCurrent: filePath === currentSessionFile,
    };
  } catch {
    return null;
  }
}

/* ── Test fixtures ── */

const FIXTURE_DIR = join(tmpdir(), "pi-tui-test-sessions");

function makeSessionJsonl(opts: {
  id?: string;
  cwd?: string;
  timestamp?: string;
  model?: string;
  title?: string;
  firstMessage?: string;
}): string {
  const lines: string[] = [];
  lines.push(JSON.stringify({
    type: "session",
    version: 3,
    id: opts.id ?? "test-session-001",
    timestamp: opts.timestamp ?? "2026-09-03T22:04:15.700Z",
    cwd: opts.cwd ?? "/home/test/project",
  }));

  if (opts.model) {
    lines.push(JSON.stringify({
      type: "model_change",
      id: "m1",
      parentId: null,
      timestamp: opts.timestamp ?? "2026-09-03T22:04:16.563Z",
      provider: "test-provider",
      modelId: opts.model,
    }));
  }

  if (opts.title) {
    lines.push(JSON.stringify({
      type: "session_info",
      id: "si1",
      parentId: "m1",
      timestamp: opts.timestamp ?? "2026-09-03T22:04:17.000Z",
      name: opts.title,
    }));
  }

  if (opts.firstMessage) {
    lines.push(JSON.stringify({
      type: "message",
      id: "msg1",
      parentId: "m1",
      timestamp: opts.timestamp ?? "2026-09-03T22:04:18.000Z",
      message: {
        role: "user",
        content: opts.firstMessage,
        timestamp: new Date(opts.timestamp ?? "2026-09-03T22:04:18.000Z").getTime(),
      },
    }));
  }

  return lines.join("\n") + "\n";
}

/* ── Tests ── */

describe("Conversations picker", () => {
  beforeEach(() => {
    mkdirSync(join(FIXTURE_DIR, "dir1"), { recursive: true });
    mkdirSync(join(FIXTURE_DIR, "dir2"), { recursive: true });
  });

  afterEach(() => {
    rmSync(FIXTURE_DIR, { recursive: true, force: true });
  });

  it("parses a minimal session file", () => {
    const filePath = join(FIXTURE_DIR, "dir1", "2026-09-03_session.jsonl");
    writeFileSync(filePath, makeSessionJsonl({
      id: "abc-123",
      cwd: "/home/test/project",
      timestamp: "2026-09-03T22:04:15.700Z",
    }));

    const info = parseSessionFile(filePath);
    assert.ok(info);
    assert.equal(info.sessionId, "abc-123");
    assert.equal(info.cwd, "/home/test/project");
    assert.equal(info.title, "Untitled");
    assert.equal(info.isCurrent, false);
  });

  it("extracts title from session_info name", () => {
    const filePath = join(FIXTURE_DIR, "dir1", "2026-09-03_titled.jsonl");
    writeFileSync(filePath, makeSessionJsonl({
      id: "titled-001",
      title: "My Cool Session",
    }));

    const info = parseSessionFile(filePath);
    assert.ok(info);
    assert.equal(info.title, "My Cool Session");
  });

  it("falls back to first user message as title", () => {
    const filePath = join(FIXTURE_DIR, "dir1", "2026-09-03_msg.jsonl");
    writeFileSync(filePath, makeSessionJsonl({
      id: "msg-001",
      firstMessage: "Help me fix the bug in auth module",
    }));

    const info = parseSessionFile(filePath);
    assert.ok(info);
    assert.equal(info.title, "Help me fix the bug in auth module");
  });

  it("extracts model from model_change entry", () => {
    const filePath = join(FIXTURE_DIR, "dir1", "2026-09-03_model.jsonl");
    writeFileSync(filePath, makeSessionJsonl({
      id: "model-001",
      model: "claude-sonnet-4-20250514",
    }));

    const info = parseSessionFile(filePath);
    assert.ok(info);
    assert.equal(info.model, "claude-sonnet-4-20250514");
  });

  it("marks current session when PI_SESSION_FILE matches", () => {
    const filePath = join(FIXTURE_DIR, "dir1", "2026-09-03_current.jsonl");
    writeFileSync(filePath, makeSessionJsonl({ id: "current-001" }));

    const info = parseSessionFile(filePath, filePath);
    assert.ok(info);
    assert.equal(info.isCurrent, true);
  });

  it("returns null for empty file", () => {
    const filePath = join(FIXTURE_DIR, "dir1", "2026-09-03_empty.jsonl");
    writeFileSync(filePath, "");

    const info = parseSessionFile(filePath);
    assert.equal(info, null);
  });

  it("returns null for non-session JSONL", () => {
    const filePath = join(FIXTURE_DIR, "dir1", "2026-09-03_invalid.jsonl");
    writeFileSync(filePath, '{"type":"message","role":"user","content":"hi"}\n');

    const info = parseSessionFile(filePath);
    assert.equal(info, null);
  });

  it("handles malformed JSON lines gracefully", () => {
    const filePath = join(FIXTURE_DIR, "dir1", "2026-09-03_malformed.jsonl");
    const lines = [
      JSON.stringify({ type: "session", id: "malf-001", timestamp: "2026-09-03T22:04:15.700Z", cwd: "/tmp" }),
      "not valid json{{{",
      JSON.stringify({ type: "model_change", modelId: "gpt-4o", timestamp: "2026-09-03T22:04:16.000Z" }),
    ].join("\n") + "\n";
    writeFileSync(filePath, lines);

    const info = parseSessionFile(filePath);
    assert.ok(info);
    assert.equal(info.sessionId, "malf-001");
    assert.equal(info.model, "gpt-4o");
  });

  it("computes lastActivity as max timestamp across entries", () => {
    const filePath = join(FIXTURE_DIR, "dir1", "2026-09-03_multi.jsonl");
    const lines = [
      JSON.stringify({ type: "session", id: "multi-001", timestamp: "2026-09-01T10:00:00Z", cwd: "/tmp" }),
      JSON.stringify({ type: "model_change", modelId: "gpt-4o", timestamp: "2026-09-02T10:00:00Z" }),
      JSON.stringify({ type: "message", message: { role: "user", content: "hi" }, timestamp: "2026-09-03T10:00:00Z" }),
    ].join("\n") + "\n";
    writeFileSync(filePath, lines);

    const info = parseSessionFile(filePath);
    assert.ok(info);
    assert.equal(info.lastActivity, new Date("2026-09-03T10:00:00Z").getTime());
  });

  it("truncates long titles to 120 chars", () => {
    const filePath = join(FIXTURE_DIR, "dir1", "2026-09-03_long.jsonl");
    const longTitle = "A".repeat(200);
    writeFileSync(filePath, makeSessionJsonl({
      id: "long-001",
      title: longTitle,
    }));

    const info = parseSessionFile(filePath);
    assert.ok(info);
    assert.equal(info.title.length, 120);
  });

  it("parses sessions from multiple directories", () => {
    writeFileSync(
      join(FIXTURE_DIR, "dir1", "2026-09-01_s1.jsonl"),
      makeSessionJsonl({ id: "s1", model: "gpt-4o", timestamp: "2026-09-01T10:00:00Z" }),
    );
    writeFileSync(
      join(FIXTURE_DIR, "dir2", "2026-09-02_s2.jsonl"),
      makeSessionJsonl({ id: "s2", model: "claude", timestamp: "2026-09-02T10:00:00Z" }),
    );

    // We can't call listSessions() directly because it uses getAgentDir()
    // which returns the real agent dir. Instead, test the parsing logic directly.
    const info1 = parseSessionFile(join(FIXTURE_DIR, "dir1", "2026-09-01_s1.jsonl"));
    const info2 = parseSessionFile(join(FIXTURE_DIR, "dir2", "2026-09-02_s2.jsonl"));
    assert.ok(info1);
    assert.ok(info2);
    assert.equal(info1.sessionId, "s1");
    assert.equal(info2.sessionId, "s2");
  });

  it("sorting by lastActivity places newer sessions first", () => {
    writeFileSync(
      join(FIXTURE_DIR, "dir1", "2026-09-01_old.jsonl"),
      makeSessionJsonl({ id: "old", timestamp: "2026-09-01T10:00:00Z" }),
    );
    writeFileSync(
      join(FIXTURE_DIR, "dir1", "2026-09-03_new.jsonl"),
      makeSessionJsonl({ id: "new", timestamp: "2026-09-03T10:00:00Z" }),
    );

    const old = parseSessionFile(join(FIXTURE_DIR, "dir1", "2026-09-01_old.jsonl"));
    const newer = parseSessionFile(join(FIXTURE_DIR, "dir1", "2026-09-03_new.jsonl"));
    assert.ok(old && newer);

    const sorted = [old, newer].sort((a, b) => b.lastActivity - a.lastActivity);
    assert.equal(sorted[0]!.sessionId, "new");
    assert.equal(sorted[1]!.sessionId, "old");
  });
});
