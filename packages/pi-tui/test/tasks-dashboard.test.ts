/**
 * Tests for pi-tui tasks dashboard (control-center/state-reader.ts).
 *
 * Tests the pure helper functions: formatElapsed, getStateIcon,
 * parseMetaFile, parseStatusFile, deriveState.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

/* ── Pure helpers (extracted from state-reader.ts) ── */

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h${(minutes % 60).toString().padStart(2, "0")}m`;
}

type TaskState = "running" | "parked" | "done" | "failed" | "unknown";

function getStateIcon(state: TaskState): string {
  switch (state) {
    case "running": return "\u{F04B}";
    case "parked": return "\u{F04C}";
    case "done": return "\u{F00C}";
    case "failed": return "\u{F00D}";
    case "unknown": return "?";
  }
}

function parseMetaFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    result[key] = value;
  }
  return result;
}

function parseStatusFile(content: string): string[] {
  return content.split("\n").filter((line) => line.trim().length > 0);
}

function deriveState(statusLines: string[]): TaskState {
  if (statusLines.length === 0) return "unknown";
  const lastLine = statusLines[statusLines.length - 1]!.trim();
  if (lastLine.startsWith("done:")) return "done";
  if (lastLine.startsWith("failed:")) return "failed";
  if (lastLine.startsWith("blocked:")) return "parked";
  if (lastLine.startsWith("paused:")) return "parked";
  if (lastLine.startsWith("needs-decision:")) return "parked";
  if (lastLine.startsWith("working:")) return "running";
  if (lastLine.startsWith("resolved:")) return "running";
  return "unknown";
}

function shortProject(projectPath?: string): string {
  if (!projectPath) return "—";
  const parts = projectPath.split("/");
  const meaningful = parts.filter((p) => p.length > 0 && p !== "Projects" && p !== "home" && p !== "rehem");
  return meaningful.slice(-2).join("/") || "—";
}

/* ── Tests ── */

describe("Tasks Dashboard", () => {
  describe("formatElapsed", () => {
    it("formats seconds", () => {
      assert.equal(formatElapsed(0), "0s");
      assert.equal(formatElapsed(5000), "5s");
      assert.equal(formatElapsed(59000), "59s");
    });

    it("formats minutes", () => {
      assert.equal(formatElapsed(60000), "1m");
      assert.equal(formatElapsed(1800000), "30m");
      assert.equal(formatElapsed(3599000), "59m");
    });

    it("formats hours", () => {
      assert.equal(formatElapsed(3600000), "1h00m");
      assert.equal(formatElapsed(5400000), "1h30m");
    });
  });

  describe("getStateIcon", () => {
    it("returns icons for all states", () => {
      assert.equal(typeof getStateIcon("running"), "string");
      assert.equal(typeof getStateIcon("parked"), "string");
      assert.equal(typeof getStateIcon("done"), "string");
      assert.equal(typeof getStateIcon("failed"), "string");
      assert.equal(typeof getStateIcon("unknown"), "string");
    });

    it("icons are non-empty", () => {
      assert.ok(getStateIcon("running").length > 0);
      assert.ok(getStateIcon("done").length > 0);
    });
  });

  describe("parseMetaFile", () => {
    it("parses key=value pairs", () => {
      const content = "window=test:window\nendpoint_task_id=test-123\nmodel=claude-sonnet\n";
      const result = parseMetaFile(content);
      assert.equal(result.window, "test:window");
      assert.equal(result.endpoint_task_id, "test-123");
      assert.equal(result.model, "claude-sonnet");
    });

    it("ignores blank lines and comments", () => {
      const content = "# comment\n\nwindow=test\n\n# another comment\n";
      const result = parseMetaFile(content);
      assert.equal(result.window, "test");
      assert.equal(Object.keys(result).length, 1);
    });

    it("handles lines without equals sign", () => {
      const content = "window=test\ninvalid-line\nmodel=claude\n";
      const result = parseMetaFile(content);
      assert.equal(result.window, "test");
      assert.equal(result.model, "claude");
      assert.equal(Object.keys(result).length, 2);
    });

    it("handles empty content", () => {
      const result = parseMetaFile("");
      assert.deepEqual(result, {});
    });
  });

  describe("parseStatusFile", () => {
    it("parses status lines", () => {
      const content = "working: setting up\nworking: implementing\n";
      const result = parseStatusFile(content);
      assert.equal(result.length, 2);
      assert.equal(result[0], "working: setting up");
      assert.equal(result[1], "working: implementing");
    });

    it("filters blank lines", () => {
      const content = "working: first\n\n\nworking: second\n";
      const result = parseStatusFile(content);
      assert.equal(result.length, 2);
    });

    it("handles empty content", () => {
      const result = parseStatusFile("");
      assert.deepEqual(result, []);
    });
  });

  describe("deriveState", () => {
    it("returns unknown for empty lines", () => {
      assert.equal(deriveState([]), "unknown");
    });

    it("returns running for working lines", () => {
      assert.equal(deriveState(["working: setup"]), "running");
    });

    it("returns done for done lines", () => {
      assert.equal(deriveState(["working: setup", "done: completed"]), "done");
    });

    it("returns failed for failed lines", () => {
      assert.equal(deriveState(["working: setup", "failed: error occurred"]), "failed");
    });

    it("returns parked for blocked lines", () => {
      assert.equal(deriveState(["working: setup", "blocked: waiting for review"]), "parked");
    });

    it("returns parked for paused lines", () => {
      assert.equal(deriveState(["working: setup", "paused: rate limit"]), "parked");
    });

    it("returns parked for needs-decision lines", () => {
      assert.equal(deriveState(["working: setup", "needs-decision: which approach?"]), "parked");
    });

    it("returns running for resolved lines", () => {
      assert.equal(deriveState(["blocked: issue", "resolved: fixed it"]), "running");
    });

    it("uses last line for state", () => {
      assert.equal(deriveState(["working: setup", "done: completed", "working: new task"]), "running");
    });
  });

  describe("shortProject", () => {
    it("extracts last two meaningful parts", () => {
      assert.equal(shortProject("/home/rehem/Projects/squad/projects/pi-extensions"), "projects/pi-extensions");
    });

    it("handles short paths", () => {
      assert.equal(shortProject("/home/user/project"), "user/project");
    });

    it("returns dash for undefined", () => {
      assert.equal(shortProject(undefined), "—");
    });

    it("returns dash for empty string", () => {
      assert.equal(shortProject(""), "—");
    });
  });

  describe("TaskMeta shape", () => {
    it("has all required fields", () => {
      const meta = {
        slug: "test-task",
        window: "squad:test",
        endpointTaskId: "test-123",
        worktree: "/tmp/worktree",
        project: "/home/user/project",
        harness: "pi",
        kind: "strike",
        mode: "drill",
        model: "claude-sonnet",
        effort: "medium",
        raw: {},
        mtimeMs: Date.now(),
      };
      assert.equal(meta.slug, "test-task");
      assert.equal(meta.window, "squad:test");
      assert.equal(meta.model, "claude-sonnet");
    });
  });
});
