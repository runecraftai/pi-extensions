/**
 * Conversations picker — lists recent Pi sessions from the session directory.
 *
 * Columns: title/first message, directory, last activity date, model, approximate size.
 * Text search (title, first message, directory). Sort by recent activity.
 * Highlight current session via PI_SESSION_ID/PI_SESSION_FILE.
 * Enter shows the resume command instruction.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import {
  Container,
  Input,
  Key,
  matchesKey,
  SelectList,
  type SelectItem,
  Spacer,
  Text,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";

/* ── Session metadata ── */

export interface SessionInfo {
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

    const header = JSON.parse(lines[0]!) as {
      type?: string;
      id?: string;
      timestamp?: string;
      cwd?: string;
    };
    if (header.type !== "session" || !header.id) return null;

    let title = "Untitled";
    let cwd = header.cwd ?? "";
    let model = "";
    let displayName: string | undefined;
    let lastActivity = header.timestamp ? new Date(header.timestamp).getTime() : 0;

    for (let i = 1; i < lines.length; i++) {
      try {
        const entry = JSON.parse(lines[i]!) as {
          type?: string;
          message?: { role?: string; content?: string | Array<{ type?: string; text?: string }> };
          modelId?: string;
          timestamp?: string;
          name?: string;
        };

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

        if (
          entry.type === "message" &&
          entry.message?.role === "user" &&
          title === "Untitled"
        ) {
          const content = entry.message.content;
          if (typeof content === "string") {
            title = content;
          } else if (Array.isArray(content)) {
            const textBlock = content.find((b) => b.type === "text");
            if (textBlock?.text) title = textBlock.text;
          }
        }
      } catch {
        // Skip malformed lines
      }
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

export function listSessions(): SessionInfo[] {
  const currentSessionFile = process.env.PI_SESSION_FILE;
  const sessionsDir = join(getAgentDir(), "sessions");
  const results: SessionInfo[] = [];

  try {
    const dirs = readdirSync(sessionsDir);
    for (const dir of dirs) {
      const dirPath = join(sessionsDir, dir);
      try {
        const stat = statSync(dirPath);
        if (!stat.isDirectory()) continue;
        const files = readdirSync(dirPath);
        for (const file of files) {
          if (!file.endsWith(".jsonl")) continue;
          const filePath = join(dirPath, file);
          const info = parseSessionFile(filePath, currentSessionFile);
          if (info) results.push(info);
        }
      } catch {
        // Skip unreadable dirs
      }
    }
  } catch {
    // Sessions dir doesn't exist or not readable
  }

  results.sort((a, b) => b.lastActivity - a.lastActivity);
  return results;
}

/* ── Formatting helpers ── */

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const now = Date.now();
  const diffMs = now - ms;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function sessionToItem(s: SessionInfo): SelectItem {
  const prefix = s.isCurrent ? "● " : "  ";
  const cwdShort = s.cwd.replace(/^\/home\/[^/]+/, "~");
  const label = `${prefix}${s.title.slice(0, 50)}`;
  const description = [
    cwdShort,
    s.model,
    formatDate(s.lastActivity),
    formatSize(s.size),
  ].filter(Boolean).join(" · ");
  return { value: s.filePath, label, description };
}

/* ── Conversations Picker UI ── */

export interface ConversationsPickerResult {
  type: "select" | "cancel";
  sessionFile?: string;
  sessionInfo?: SessionInfo;
}

class ConversationsPickerUi {
  private sessions: SessionInfo[];
  private filteredSessions: SessionInfo[];
  private selectList: SelectList;
  private readonly container: Container;
  private readonly theme: Theme;
  private readonly done: (result: ConversationsPickerResult) => void;
  private searching = false;
  private searchQuery = "";
  private cachedWidth: number | undefined;
  private cachedLines: string[] | undefined;

  constructor(
    theme: Theme,
    sessions: SessionInfo[],
    done: (result: ConversationsPickerResult) => void,
  ) {
    this.theme = theme;
    this.sessions = sessions;
    this.filteredSessions = sessions;
    this.done = done;
    this.container = new Container();
    this.selectList = new SelectList([], 10, {
      selectedPrefix: (t) => theme.fg("accent", t),
      selectedText: (t) => theme.fg("accent", t),
      description: (t) => theme.fg("muted", t),
      scrollInfo: (t) => theme.fg("dim", t),
      noMatch: (t) => theme.fg("warning", t),
    });
    this.rebuild();
  }

  private rebuild(): void {
    this.container.clear();
    this.container.addChild(
      new Text(this.theme.fg("accent", this.theme.bold("Conversations")), 1, 0),
    );

    // Search bar
    const searchPrefix = this.theme.fg("dim", "🔍 ");
    const searchText = this.searching
      ? `${searchPrefix}${this.searchQuery}_`
      : this.searchQuery
        ? `${searchPrefix}${this.searchQuery}`
        : `${this.theme.fg("dim", "Press / to search")}`;
    this.container.addChild(new Text(searchText, 1, 0));
    this.container.addChild(new Spacer(1));

    const items = this.filteredSessions.map(sessionToItem);
    if (items.length === 0) {
      this.container.addChild(new Text(this.theme.fg("dim", "No sessions found"), 1, 0));
    } else {
      this.selectList = new SelectList(items, Math.min(items.length, 12), {
        selectedPrefix: (t) => this.theme.fg("accent", t),
        selectedText: (t) => this.theme.fg("accent", t),
        description: (t) => this.theme.fg("muted", t),
        scrollInfo: (t) => this.theme.fg("dim", t),
        noMatch: (t) => this.theme.fg("warning", t),
      });

      this.selectList.onSelect = (item) => {
        const session = this.filteredSessions.find((s) => s.filePath === item.value);
        this.done({ type: "select", sessionFile: item.value, sessionInfo: session });
      };
      this.selectList.onCancel = () => this.done({ type: "cancel" });
      this.container.addChild(this.selectList);
    }

    this.container.addChild(
      new Text(this.theme.fg("dim", "↑↓ navigate · enter resume · / search · esc close"), 1, 0),
    );
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  private filterSessions(): void {
    const query = this.searchQuery.toLowerCase();
    if (!query) {
      this.filteredSessions = this.sessions;
    } else {
      this.filteredSessions = this.sessions.filter(
        (s) =>
          s.title.toLowerCase().includes(query) ||
          s.cwd.toLowerCase().includes(query) ||
          s.model.toLowerCase().includes(query),
      );
    }
    this.rebuild();
  }

  handleInput(data: string): void {
    if (this.searching) {
      if (matchesKey(data, Key.escape)) {
        this.searching = false;
        this.searchQuery = "";
        this.filterSessions();
        return;
      }
      if (matchesKey(data, Key.enter)) {
        this.searching = false;
        this.rebuild();
        return;
      }
      if (data === "\x7f" || data === "\b") {
        // Backspace
        this.searchQuery = this.searchQuery.slice(0, -1);
        this.filterSessions();
        return;
      }
      if (data.length === 1 && data.charCodeAt(0) >= 32) {
        this.searchQuery += data;
        this.filterSessions();
        return;
      }
      return;
    }

    // Normal mode
    if (data === "/") {
      this.searching = true;
      this.searchQuery = "";
      this.rebuild();
      return;
    }
    if (matchesKey(data, Key.escape) || data === "q") {
      this.done({ type: "cancel" });
      return;
    }
    this.selectList.handleInput?.(data);
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
    this.cachedWidth = width;
    this.cachedLines = this.container.render(width);
    return this.cachedLines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
    this.container.invalidate();
  }
}

export function openConversationsPicker(
  ctx: ExtensionContext,
  theme: Theme,
): Promise<ConversationsPickerResult> {
  const sessions = listSessions();
  return ctx.ui.custom<ConversationsPickerResult>((tui, pickerTheme, _kb, done) => {
    const ui = new ConversationsPickerUi(pickerTheme, sessions, done);
    return {
      render: (w) => ui.render(w),
      invalidate: () => ui.invalidate(),
      handleInput: (data) => {
        ui.handleInput(data);
        tui.requestRender();
      },
    };
  }, { overlay: true });
}
