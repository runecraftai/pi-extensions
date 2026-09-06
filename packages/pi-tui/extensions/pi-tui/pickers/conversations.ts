/**
 * Conversations picker — list recent Pi sessions with model info.
 *
 * Reads session directories via SessionManager.list(), shows title, model,
 * directory, last activity time, and approximate size. Supports search and
 * resume via native Pi session mechanism.
 */

import type { ExtensionContext, SessionInfo, Theme } from "@earendil-works/pi-coding-agent";
import {
  Box,
  Key,
  matchesKey,
  SelectList,
  type SelectItem,
  type TUI,
  Text,
  truncateToWidth,
} from "@earendil-works/pi-tui";

/* ── Types ── */

export interface ConversationEntry {
  id: string;
  name: string;
  cwd: string;
  model: string;
  created: Date;
  modified: Date;
  messageCount: number;
  firstMessage: string;
  isCurrentSession: boolean;
  /** Approximate file size in bytes */
  sizeBytes?: number;
}

/* ── Copy ── */

const COPY = {
  title: "Conversations",
  hint: "↑/↓: navigate · Enter: resume · type to search · Esc/q: close",
  noSessions: "No sessions found",
  currentMarker: "*",
  unknownModel: "—",
  empty: "(empty)",
};

/* ── Helpers ── */

export function relativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatSize(bytes?: number): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Extract model from session info if available in name or metadata. */
function extractModel(info: SessionInfo): string {
  // SessionInfo doesn't directly expose model, but we can parse it from
  // session name patterns or provide a placeholder
  return COPY.unknownModel;
}

/** Detect current session by matching session ID or file path. */
function isCurrentSession(info: SessionInfo): boolean {
  const sessionId = process.env.PI_SESSION_ID;
  const sessionFile = process.env.PI_SESSION_FILE;
  if (sessionId && info.id === sessionId) return true;
  if (sessionFile && info.path === sessionFile) return true;
  return false;
}

/* ── Load sessions ── */

export async function loadConversations(ctx: ExtensionContext): Promise<ConversationEntry[]> {
  try {
    const cwd = ctx.cwd;
    const sessionManager = ctx.sessionManager;
    const sessionDir = sessionManager.getSessionDir();
    const { SessionManager } = await import("@earendil-works/pi-coding-agent");
    const sessions = await SessionManager.list(cwd, sessionDir);
    return sessions.map((info) => ({
      id: info.id,
      name: info.name || info.firstMessage?.slice(0, 50) || COPY.empty,
      cwd: info.cwd || cwd,
      model: extractModel(info),
      created: info.created,
      modified: info.modified,
      messageCount: info.messageCount,
      firstMessage: info.firstMessage || "",
      isCurrentSession: isCurrentSession(info),
    }));
  } catch {
    return [];
  }
}

/* ── Conversations UI component ── */

class ConversationsUi {
  private selectList: SelectList;
  private readonly container: Box;
  private readonly theme: Theme;
  private readonly conversations: ConversationEntry[];
  private readonly onClose: () => void;
  private readonly onSelect: (entry: ConversationEntry) => void;
  private cachedWidth: number | undefined;
  private cachedLines: string[] | undefined;

  constructor(
    theme: Theme,
    conversations: ConversationEntry[],
    onClose: () => void,
    onSelect: (entry: ConversationEntry) => void,
  ) {
    this.theme = theme;
    this.conversations = conversations;
    this.onClose = onClose;
    this.onSelect = onSelect;
    this.container = new Box(1, 1, (s: string) => theme.bg("customMessageBg", s));
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
    this.container.addChild(new Text(this.theme.bold(this.theme.fg("accent", COPY.title)), 1, 0));
    this.container.addChild(new Text(this.theme.fg("dim", COPY.hint), 1, 0));

    if (this.conversations.length === 0) {
      this.container.addChild(new Text(this.theme.fg("dim", COPY.noSessions), 1, 0));
      return;
    }

    const items: SelectItem[] = this.conversations.map((conv) => {
      const marker = conv.isCurrentSession ? COPY.currentMarker : " ";
      const model = conv.model !== COPY.unknownModel
        ? this.theme.fg("dim", conv.model)
        : this.theme.fg("muted", conv.model);
      const cwd = truncateToWidth(conv.cwd, 30, "…");
      const time = relativeTime(conv.modified);
      const label = `${marker} ${conv.name}`;
      const description = `${model}  ${cwd}  ${time}`;
      return {
        value: conv.id,
        label,
        description,
      };
    });

    this.selectList = new SelectList(items, Math.min(items.length, 15), {
      selectedPrefix: (t) => this.theme.fg("accent", t),
      selectedText: (t) => this.theme.fg("accent", t),
      description: (t) => this.theme.fg("dim", t),
      scrollInfo: (t) => this.theme.fg("dim", t),
      noMatch: (t) => this.theme.fg("warning", t),
    });

    this.selectList.onSelectionChange = () => {};
    this.selectList.onSelect = (item) => {
      const conv = this.conversations.find((c) => c.id === item.value);
      if (conv) this.onSelect(conv);
    };
    this.selectList.onCancel = () => {
      this.onClose();
    };

    this.container.addChild(this.selectList);
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || data === "q") {
      this.onClose();
      return;
    }
    if (matchesKey(data, Key.enter)) {
      const selected = this.selectList.getSelectedItem();
      if (selected) {
        const conv = this.conversations.find((c) => c.id === selected.value);
        if (conv) this.onSelect(conv);
      }
      return;
    }
    this.selectList.handleInput?.(data);
    this.invalidate();
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

/* ── Public API ── */

/**
 * Open the conversations picker overlay.
 * Returns the selected conversation entry, or undefined if cancelled.
 */
export async function openConversationsPicker(
  ctx: ExtensionContext,
): Promise<ConversationEntry | undefined> {
  if (!ctx.hasUI) return undefined;

  const conversations = await loadConversations(ctx);

  let resolve: (value: ConversationEntry | undefined) => void;
  const result = new Promise<ConversationEntry | undefined>((r) => { resolve = r; });

  await ctx.ui.custom<ConversationEntry | undefined>((tui: TUI, theme, _kb, done) => {
    const ui = new ConversationsUi(
      theme,
      conversations,
      () => {
        done(undefined);
        resolve(undefined);
      },
      (entry) => {
        done(entry);
        resolve(entry);
      },
    );

    return {
      render: (w: number) => ui.render(w),
      invalidate: () => ui.invalidate(),
      handleInput: (data: string) => {
        ui.handleInput(data);
        tui.requestRender();
      },
    };
  }, { overlay: true });

  return result;
}
