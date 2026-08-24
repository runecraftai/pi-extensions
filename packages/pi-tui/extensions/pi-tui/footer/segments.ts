/**
 * Individual segment renderers for the footer.
 *
 * Each segment is a function that returns a string for its slot.
 * Segments are composed by the footer's layout engine using priority-based fitting.
 */

import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ExtensionContext, Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import {
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import type { FooterConfig } from "../config.ts";
import type { GitStatus } from "./git.ts";
import { renderContextBar, renderContextCompact } from "./context-bar.ts";

/* ── Usage totals ── */

export interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  latestCacheHitRate: number | undefined;
}

/* ── Icon glyphs ── */

export interface IconGlyphs {
  cwd: string;
  git: string;
  working: string;
  done: string;
  context: string;
  model: string;
  thinking: string;
  input: string;
  output: string;
  cacheHit: string;
  cost: string;
  extensions: string;
  ahead: string;
  behind: string;
  diverged: string;
  conflicted: string;
  stashed: string;
  modified: string;
  staged: string;
  untracked: string;
  renamed: string;
  deleted: string;
}

const NERD_GLYPHS: IconGlyphs = {
  cwd: "\u{F115}",    //
  git: "\u{E0A0}",    //
  working: "\u{F110}", //
  done: "\u{F00C}",   //
  context: "\u{F544}", //
  model: "\u{E612}",   //
  thinking: "\u{F0E4}", //
  input: "\u{EB9B}",   //
  output: "\u{EB99}",  //
  cacheHit: "\u{F07C}", //
  cost: "\u{F0D6}",    //
  extensions: "\u{E726}", //
  ahead: "\u2191",
  behind: "\u2193",
  diverged: "\u21D5",
  conflicted: "=",
  stashed: "$",
  modified: "!",
  staged: "+",
  untracked: "?",
  renamed: "\u00BB",
  deleted: "\u2718",
};

const ASCII_GLYPHS: IconGlyphs = {
  cwd: "@",
  git: "*",
  working: "o",
  done: "+",
  context: "#",
  model: "M",
  thinking: "~",
  input: "^",
  output: "v",
  cacheHit: "c",
  cost: "$",
  extensions: "&",
  ahead: "^",
  behind: "v",
  diverged: "^v",
  conflicted: "=",
  stashed: "S",
  modified: "!",
  staged: "A",
  untracked: "?",
  renamed: "r",
  deleted: "x",
};

const NERD_FONT_TERMINALS = new Set([
  "iTerm.app",
  "Ghostty",
  "WezTerm",
  "kitty",
  "rio",
  "tabby",
  "WindowsTerminal",
  "vscode",
]);

function detectNerdFont(): boolean {
  const termProgram = process.env.TERM_PROGRAM;
  if (termProgram && NERD_FONT_TERMINALS.has(termProgram)) return true;
  const lcTerminal = process.env.LC_TERMINAL;
  if (lcTerminal && NERD_FONT_TERMINALS.has(lcTerminal)) return true;
  if (process.env.TERM === "xterm-kitty") return true;
  if (process.env.WT_SESSION) return true;
  if (process.env.TERM_PROGRAM === "vscode") return true;
  return false;
}

export function resolveGlyphs(iconMode: string): IconGlyphs {
  if (iconMode === "nerd") return NERD_GLYPHS;
  if (iconMode === "ascii") return ASCII_GLYPHS;
  return detectNerdFont() ? NERD_GLYPHS : ASCII_GLYPHS;
}

/* ── Helpers ── */

export function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b_[^\x07]*\x07/g, "");
}

export function formatCwd(cwd: string): string {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return cwd;
  const resolvedCwd = resolve(cwd);
  const resolvedHome = resolve(home);
  const rel = relative(resolvedHome, resolvedCwd);
  const insideHome =
    rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
  if (!insideHome) return cwd;
  return rel === "" ? "~" : `~${sep}${rel}`;
}

export function basenamePath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

export function truncateBranch(branch: string, maxLen: number): string {
  if (branch.length <= maxLen) return branch;
  if (maxLen <= 3) return "...".slice(0, maxLen);
  return `${branch.slice(0, maxLen - 3)}...`;
}

export function truncatePath(path: string, maxLen: number): string {
  if (path.length <= maxLen) return path;
  if (maxLen <= 3) return "...".slice(0, maxLen);
  const sepChar = path.includes("/") ? "/" : "\\";
  const parts = path.split(/[\\/]/);
  if (parts.length <= 2) return path.slice(0, maxLen - 3) + "...";
  const tail: string[] = [];
  let tailLen = 0;
  for (let i = parts.length - 1; i >= 1; i--) {
    const seg = parts[i]!;
    if (tailLen + seg.length + 4 > maxLen) break;
    tail.unshift(seg);
    tailLen += seg.length + 1;
  }
  const head = parts[0]!;
  const result = `${head}${sepChar}...${sepChar}${tail.join(sepChar)}`;
  return result.length > maxLen ? result.slice(0, maxLen - 3) + "..." : result;
}

export function fmtTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  if (n < 10_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${Math.round(n / 1_000_000)}M`;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m ${s}s`;
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);
  return `${h}h ${m}m ${s}s`;
}

export function formatProviderLabel(provider: string | undefined): string {
  if (!provider) return "Unknown";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

export function providerColor(provider: string): ThemeColor {
  switch (provider.toLowerCase()) {
    case "anthropic": return "accent";
    case "openai":
    case "openai-codex": return "success";
    case "google":
    case "google-vertex": return "warning";
    case "amazon-bedrock": return "thinkingHigh";
    case "github-copilot": return "mdLink";
    case "deepseek": return "thinkingLow";
    case "xai":
    case "groq": return "error";
    default: return "muted";
  }
}

export function effortColor(level: string | undefined): ThemeColor {
  switch (level) {
    case "minimal": return "thinkingMinimal";
    case "low": return "thinkingLow";
    case "medium": return "thinkingMedium";
    case "high": return "thinkingHigh";
    case "xhigh": return "thinkingXhigh";
    default: return "thinkingMedium";
  }
}

export function stressColor(value: number, warn = 70, danger = 90): ThemeColor {
  if (value >= danger) return "error";
  if (value >= warn) return "warning";
  return "accent";
}

export function cacheHitColor(value: number): ThemeColor {
  if (value < 30) return "error";
  if (value < 70) return "warning";
  return "success";
}

export function sanitizeStatus(text: string): string {
  return stripAnsi(text)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

export function alignRight(
  left: string,
  right: string,
  width: number,
  theme: Theme,
): string {
  const rightW = visibleWidth(right);
  if (rightW > width) {
    right = truncateToWidth(right, width, theme.fg("dim", "..."));
  }
  const leftW = visibleWidth(left);
  const rightW2 = visibleWidth(right);
  const pad = width - leftW - rightW2;
  if (pad >= 1) {
    return left + " ".repeat(pad) + right;
  }
  const availableForLeft = Math.max(0, width - rightW2 - 1);
  const truncatedLeft =
    availableForLeft > 0
      ? truncateToWidth(left, availableForLeft, theme.fg("dim", "..."))
      : "";
  return truncatedLeft ? truncatedLeft + " " + right : right;
}

/* ── Prioritized segment fitting ── */

export interface PrioritizedSegment {
  text: string;
  priority: number;
  compactText?: string;
  truncate?: (text: string, maxWidth: number, ellipsis: string) => string;
}

/**
 * Pack segments into maxWidth: compact first, then drop lowest-priority.
 */
export function fitSegmentsByPriority(
  segs: readonly PrioritizedSegment[],
  maxW: number,
  ellipsis = "...",
): string[] {
  const items = segs.map((s) => ({
    text: s.text,
    compactText: s.compactText,
    priority: s.priority,
    truncate: s.truncate,
    w: visibleWidth(s.text),
  }));

  const totalW = () => {
    const active = items.filter((it) => it.text !== "");
    return active.reduce((a, it) => a + it.w, 0) + Math.max(0, active.length - 1);
  };

  // Compact before sacrificing any segment content
  if (totalW() > maxW) {
    for (const item of items) {
      if (!item.compactText || visibleWidth(item.compactText) >= item.w) continue;
      item.text = item.compactText;
      item.w = visibleWidth(item.text);
      if (totalW() <= maxW) break;
    }
  }

  while (totalW() > maxW) {
    let target = -1;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const targetItem = target >= 0 ? items[target] : undefined;
      if (
        item?.text !== "" &&
        (target === -1 || (item && targetItem && item.priority < targetItem.priority))
      ) {
        target = i;
      }
    }
    if (target === -1) break;
    const targetItem = items[target];
    if (!targetItem) break;
    const others = items.filter(
      (_, i) => i !== target && items[i]?.text !== "",
    );
    const otherW =
      others.reduce((a, it) => a + it.w, 0) + Math.max(0, others.length - 1);
    const avail = maxW - otherW - (others.length > 0 ? 1 : 0);
    if (avail <= visibleWidth(ellipsis)) {
      targetItem.text = "";
      targetItem.w = 0;
    } else if (avail < targetItem.w) {
      const truncateFn = targetItem.truncate;
      targetItem.text = truncateFn
        ? truncateFn(targetItem.text, avail, ellipsis)
        : truncateToWidth(targetItem.text, avail, ellipsis);
      targetItem.w = visibleWidth(targetItem.text);
    } else {
      break;
    }
  }

  return items.filter((it) => it.text !== "").map((it) => it.text);
}

/* ── Segment renderers ── */

export interface SegmentContext {
  theme: Theme;
  ctx: ExtensionContext;
  config: FooterConfig;
  glyphs: IconGlyphs;
  git: GitStatus;
  cwd: string;
  width: number;
  state: {
    workingSince: number | undefined;
    lastDoneIn: number | undefined;
  };
  totals: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost: number;
    latestCacheHitRate: number | undefined;
  };
  modelMeta: {
    provider: string;
    model: string;
    effort: string | undefined;
  };
}

/** CWD — current working directory with smart path truncation. */
export function renderCwd(seg: SegmentContext): string {
  const { theme, glyphs, cwd, width } = seg;
  const maxCwd = Math.min(30, Math.max(10, Math.floor(width * 0.4)));
  const formatted = formatCwd(cwd);
  const cwdPrefix = `${theme.fg("mdLink", glyphs.cwd)} `;
  const accent = (text: string) => theme.fg("accent", text);
  return `${cwdPrefix}${accent(truncatePath(formatted, maxCwd))}`;
}

/** CWD compact form: basename only. */
export function renderCwdCompact(seg: SegmentContext): string {
  const { theme, glyphs, cwd, width } = seg;
  const maxCwd = Math.min(30, Math.max(10, Math.floor(width * 0.4)));
  const formatted = formatCwd(cwd);
  const cwdPrefix = `${theme.fg("mdLink", glyphs.cwd)} `;
  const accent = (text: string) => theme.fg("accent", text);
  return `${cwdPrefix}${accent(truncatePath(basenamePath(formatted), maxCwd))}`;
}

/** Git — branch name + status indicators. */
export function renderGit(seg: SegmentContext): string {
  const { theme, git, glyphs, config } = seg;
  const parts: string[] = [];

  if (config.git.showBranch) {
    if (git.branch) {
      parts.push(theme.fg("mdLink", glyphs.git));
      parts.push(theme.fg("mdLink", truncateBranch(git.branch, 20)));
    } else if (git.commit?.detached) {
      parts.push(theme.fg("warning", glyphs.git));
      parts.push(theme.fg("warning", "HEAD"));
      if (git.commit.oid) {
        const shortHash = git.commit.oid.slice(0, 7);
        const tag = git.commit.tag ? ` ${git.commit.tag}` : "";
        parts.push(theme.fg("dim", `${shortHash}${tag}`));
      }
    }
  }

  if (config.git.showStatus) {
    const statusIcons: string[] = [];
    const addStatus = (count: number, glyph: string, color: ThemeColor) => {
      if (count > 0) statusIcons.push(theme.fg(color, `${glyph}${count}`));
    };
    addStatus(git.conflicted, glyphs.conflicted, "error");
    addStatus(git.deleted, glyphs.deleted, "error");
    addStatus(git.modified, glyphs.modified, "warning");
    addStatus(git.renamed, glyphs.renamed, "warning");
    addStatus(git.staged, glyphs.staged, "success");
    addStatus(git.untracked, glyphs.untracked, "muted");
    addStatus(git.stashed, glyphs.stashed, "muted");

    if (git.ahead > 0 && git.behind > 0) {
      statusIcons.push(
        theme.fg("warning", `${glyphs.diverged}${git.ahead}/${git.behind}`),
      );
    } else if (git.ahead > 0) {
      statusIcons.push(theme.fg("success", `${glyphs.ahead}${git.ahead}`));
    } else if (git.behind > 0) {
      statusIcons.push(theme.fg("warning", `${glyphs.behind}${git.behind}`));
    }

    const statusBlock = statusIcons.join(" ");
    if (statusBlock) {
      parts.push(`${theme.fg("dim", "[")}${statusBlock}${theme.fg("dim", "]")}`);
    }
  }

  return parts.join(" ");
}

/** Context bar — visual context usage bar with zone dividers. */
export function renderContextBarSegment(seg: SegmentContext): string {
  const { theme, ctx, config, glyphs, width } = seg;
  const contextUsage = ctx.getContextUsage();
  const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
  if (contextWindow <= 0) return "";

  const contextPct = contextUsage?.percent ?? 0;
  const contextTokens = contextUsage?.tokens ?? 0;

  const pctText = theme.fg(stressColor(contextPct), `${contextPct.toFixed(1)}%`);
  const ctxText = `${theme.fg("text", fmtTokens(contextTokens))}${theme.fg("dim", "/")}${theme.fg("text", fmtTokens(contextWindow))}`;
  const contextIcon = theme.fg(stressColor(contextPct), glyphs.context);
  const reserved = visibleWidth(contextIcon) + visibleWidth(pctText) + visibleWidth(ctxText) + 5 + 2;
  const barWidth = Math.max(4, Math.min(12, width - reserved));

  return renderContextBar(theme, contextPct, contextTokens, contextWindow, barWidth);
}

/** Context compact — icon + percentage only. */
export function renderContextCompactSegment(seg: SegmentContext): string {
  const { theme, ctx, glyphs } = seg;
  const contextUsage = ctx.getContextUsage();
  const contextPct = contextUsage?.percent ?? 0;
  return renderContextCompact(theme, contextPct);
}

/** Context percentage — text only. */
export function renderContextPct(seg: SegmentContext): string {
  const { theme, ctx } = seg;
  const contextUsage = ctx.getContextUsage();
  const contextPct = contextUsage?.percent ?? 0;
  const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
  if (contextWindow <= 0) return "";
  return theme.fg(stressColor(contextPct), `${contextPct.toFixed(1)}%`);
}

/** Tokens — input/output token counts. */
export function renderTokens(seg: SegmentContext): string {
  const { theme, glyphs, totals, config } = seg;
  const parts: string[] = [];
  if (config.tokens.showInput) {
    parts.push(theme.fg("accent", `${glyphs.input} ${fmtTokens(totals.input)}`));
  }
  if (config.tokens.showOutput) {
    parts.push(theme.fg("success", `${glyphs.output} ${fmtTokens(totals.output)}`));
  }
  if (config.tokens.showCache) {
    const hasCacheTokens = totals.cacheRead > 0 || totals.cacheWrite > 0;
    if (hasCacheTokens && totals.latestCacheHitRate !== undefined) {
      parts.push(
        theme.fg(
          cacheHitColor(totals.latestCacheHitRate),
          `${glyphs.cacheHit} ${totals.latestCacheHitRate.toFixed(1)}%`,
        ),
      );
    }
  }
  return parts.join(` ${theme.fg("dim", "|")} `);
}

/** Cost — session cost display. */
export function renderCost(seg: SegmentContext): string {
  const { theme, glyphs, totals } = seg;
  return theme.fg("warning", `${glyphs.cost} $${totals.cost.toFixed(3)}`);
}

/** Extension status passthrough. */
export function renderExtStatus(
  seg: SegmentContext,
  extensionStatuses: ReadonlyMap<string, string>,
): string[] {
  const { theme, glyphs, width } = seg;
  const statuses = Array.from(extensionStatuses.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, text]) => sanitizeStatus(text))
    .filter((text) => text.length > 0);
  if (statuses.length === 0) return [];

  const separator = ` ${theme.fg("dim", "|")} `;

  // Simple line wrapping for long status lines
  const result: string[] = [];
  const prefix = `${theme.fg("mdLink", glyphs.extensions)} `;
  let current = "";
  for (const status of statuses) {
    const test = current ? `${current}${separator}${theme.fg("muted", status)}` : `${prefix}${theme.fg("muted", status)}`;
    if (visibleWidth(test) > width && current) {
      result.push(current);
      current = `${prefix}${theme.fg("muted", status)}`;
    } else {
      current = test;
    }
  }
  if (current) result.push(current);
  return result;
}

/** Model — current model name with provider. */
export function renderModel(seg: SegmentContext): string {
  const { theme, glyphs, modelMeta, ctx } = seg;
  const parts: string[] = [];
  parts.push(theme.fg("mdLink", glyphs.model));
  if (modelMeta.provider && modelMeta.provider !== "Unknown") {
    parts.push(theme.fg(providerColor(ctx.model?.provider ?? "none"), modelMeta.provider));
  }
  parts.push(theme.fg("text", modelMeta.model));
  return parts.join(theme.fg("dim", " \u00B7 "));
}

/** Thinking — thinking level indicator. */
export function renderThinking(seg: SegmentContext): string {
  const { theme, glyphs, modelMeta } = seg;
  if (!modelMeta.effort || modelMeta.effort === "off") return "";
  return theme.fg(effortColor(modelMeta.effort), `${glyphs.thinking} ${modelMeta.effort}`);
}

/** Timer — working/done timer. */
export function renderTimer(seg: SegmentContext): string {
  const { theme, glyphs, state } = seg;
  if (state.workingSince !== undefined) {
    return `${theme.fg("accent", glyphs.working)} ${theme.fg("dim", "working")} ${theme.fg("accent", formatDuration(Date.now() - state.workingSince))}`;
  }
  if (state.lastDoneIn !== undefined) {
    return `${theme.fg("success", glyphs.done)} ${theme.fg("success", "done")} ${theme.fg("text", formatDuration(state.lastDoneIn))}`;
  }
  return "";
}

/** Separator — visual separator between segments. */
export function renderSeparator(_seg: SegmentContext): string {
  return "";
}

/** Text literal — passthrough literal text. */
export function renderText(seg: SegmentContext, text: string): string {
  return seg.theme.fg("text", text);
}
