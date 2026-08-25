/**
 * Footer installer — renders a 2-line three-zone Starship-style footer.
 *
 * Each line has three zones: LEFT (left-aligned), CENTER (centered), RIGHT (right-aligned).
 * Segments are assigned to zones via config.footer.zones.
 * Narrow terminals degrade by dropping lowest-priority segments.
 */

import type { ExtensionContext, ReadonlyFooterDataProvider, Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { FooterSegmentKey, FooterZone, PiTuiConfig } from "../config.ts";

/* ── Priority: higher = survives longer under pressure ── */

interface Seg {
  key: FooterSegmentKey;
  text: string;
  priority: number;
}

const PRIORITY: Record<FooterSegmentKey, number> = {
  cwd: 10,
  model: 9,
  tokens: 7,
  timer: 6,
  gitBranch: 8,
  gitStatus: 5,
  gitCommit: 4,
  runtime: 5,
  contextBar: 8,
  thinking: 6,
  cost: 7,
  extStatus: 3,
};

/* ── Utilities ── */

function fmtTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  if (n < 10_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${Math.round(n / 1_000_000)}M`;
}

function formatCwd(cwd: string): string {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return cwd;
  if (cwd.startsWith(home)) return `~${cwd.slice(home.length)}`;
  return cwd;
}

function truncatePath(path: string, maxLen: number): string {
  if (path.length <= maxLen) return path;
  if (maxLen <= 3) return path.slice(0, maxLen);
  const sep = path.includes("/") ? "/" : "\\";
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
  const result = `${head}${sep}...${sep}${tail.join(sep)}`;
  return result.length > maxLen ? result.slice(0, maxLen - 3) + "..." : result;
}

function stressColor(pct: number): string {
  if (pct >= 90) return "error";
  if (pct >= 70) return "warning";
  return "accent";
}

function renderBar(theme: Theme, pct: number, barWidth: number): string {
  const filled = Math.max(0, Math.min(barWidth, Math.round((pct / 100) * barWidth)));
  const empty = barWidth - filled;
  const color = stressColor(pct);
  const fgc = (c: string, t: string) => (theme as any).fg(c, t);
  return (
    fgc("dim", "[") +
    fgc(color, "█".repeat(filled)) +
    fgc("dim", "░".repeat(empty)) +
    fgc("dim", "]")
  );
}

function fgc(theme: Theme, color: string, text: string): string {
  return (theme as any).fg(color, text);
}

/* ── Left-packed rendering (used inside each zone) ── */

const SEP = " · ";
const SEP_W = visibleWidth(SEP);

/**
 * Render segments left-packed with " · " separators, dropping lowest-priority
 * if needed to fit maxWidth. Returns the joined text and its visible width.
 */
function packSegments(segs: Seg[], maxWidth: number): { text: string; width: number } {
  if (segs.length === 0) return { text: "", width: 0 };

  const sorted = [...segs].sort((a, b) => a.priority - b.priority);
  let totalW = sorted.reduce((a, s) => a + visibleWidth(s.text), 0) + Math.max(0, sorted.length - 1) * SEP_W;

  for (const seg of sorted) {
    if (totalW <= maxWidth) break;
    const segW = visibleWidth(seg.text);
    const without = totalW - segW - SEP_W;
    if (without <= 0) {
      seg.text = "";
      totalW -= segW + SEP_W;
    } else if (segW > 0) {
      const avail = maxWidth - without - SEP_W;
      if (avail > 3) {
        seg.text = truncateToWidth(seg.text, avail, "…");
        totalW = without + visibleWidth(seg.text) + SEP_W;
      } else {
        seg.text = "";
        totalW -= segW + SEP_W;
      }
    }
  }

  const surviving = segs.filter((s) => s.text !== "");
  if (surviving.length === 0) return { text: "", width: 0 };

  const joined = surviving.map((s) => s.text).join(SEP);
  return { text: joined, width: visibleWidth(joined) };
}

/* ── Three-zone line renderer ── */

/**
 * Render a line with three zones: LEFT (left-aligned), CENTER (centered), RIGHT (right-aligned).
 * Zones with no content take no space. Adjacent zones get a " · " separator between them.
 */
function renderThreeZoneLine(
  left: string,
  center: string,
  right: string,
  width: number,
  theme: Theme,
): string {
  const leftW = visibleWidth(left);
  const centerW = visibleWidth(center);
  const rightW = visibleWidth(right);

  // Count active zones
  const activeCount = (leftW > 0 ? 1 : 0) + (centerW > 0 ? 1 : 0) + (rightW > 0 ? 1 : 0);

  if (activeCount === 0) return "";
  if (activeCount === 1) {
    // Single zone: left, center, or right
    if (leftW > 0) return left;
    if (centerW > 0) return center;
    return right;
  }

  // Calculate separator slots between active zones
  const sepSlots = activeCount - 1;
  const totalContentW = leftW + centerW + rightW;
  const totalSepW = sepSlots * SEP_W;
  const remaining = width - totalContentW - totalSepW;

  if (remaining <= 0) {
    // Not enough room: just jam together
    const parts = [left, center, right].filter(Boolean);
    return truncateToWidth(parts.join(SEP), width, "…");
  }

  // Distribute remaining space:
  // - left zone gets left padding = 0
  // - center zone gets centered in remaining space
  // - right zone gets right padding

  const leftPad = 0;
  let centerPad: number;
  let rightPad: number;

  if (activeCount === 2) {
    // Two zones: distribute remaining space between them
    if (leftW > 0 && rightW > 0) {
      // left + right: center gets 0, remaining goes between them
      centerPad = 0;
      rightPad = remaining;
    } else if (leftW > 0 && centerW > 0) {
      // left + center: remaining goes after center
      centerPad = 0;
      rightPad = remaining;
    } else {
      // center + right: remaining goes before center
      centerPad = remaining;
      rightPad = 0;
    }
  } else {
    // Three zones: center gets half, right gets other half
    centerPad = Math.floor(remaining / 2);
    rightPad = remaining - centerPad;
  }

  const parts: string[] = [];
  parts.push(left);
  if (centerW > 0) {
    parts.push(fgc(theme, "dim", SEP));
    parts.push(" ".repeat(centerPad));
    parts.push(center);
  }
  if (rightW > 0) {
    if (leftW > 0 || centerW > 0) {
      parts.push(fgc(theme, "dim", SEP));
    }
    parts.push(" ".repeat(rightPad));
    parts.push(right);
  }

  return parts.join("");
}

/* ── Build segments per zone ── */

function buildLine1Segments(
  ctx: ExtensionContext,
  footerData: ReadonlyFooterDataProvider,
  theme: Theme,
  config: PiTuiConfig,
  width: number,
): Seg[] {
  const segs = config.footer.segments;
  const result: Seg[] = [];

  if (segs.cwd) {
    const cwd = ctx.sessionManager.getCwd();
    const formatted = formatCwd(cwd);
    const maxCwdLen = Math.min(30, Math.max(10, Math.floor(width * 0.4)));
    result.push({
      key: "cwd",
      text: `${fgc(theme, "mdLink", "📁")} ${fgc(theme, "accent", truncatePath(formatted, maxCwdLen))}`,
      priority: PRIORITY.cwd,
    });
  }

  if (segs.gitBranch) {
    const branch = footerData.getGitBranch();
    if (branch) {
      const truncated = branch.length > 20 ? `${branch.slice(0, 17)}...` : branch;
      result.push({
        key: "gitBranch",
        text: `${fgc(theme, "mdLink", "🔀")} ${fgc(theme, "mdLink", truncated)}`,
        priority: PRIORITY.gitBranch,
      });
    }
  }

  if (segs.runtime) {
    result.push({
      key: "runtime",
      text: `${fgc(theme, "success", "⬢")} ${fgc(theme, "dim", process.version)}`,
      priority: PRIORITY.runtime,
    });
  }

  return result;
}

function buildContextBar(ctx: ExtensionContext, theme: Theme, maxWidth: number): string {
  const usage = ctx.getContextUsage();
  if (!usage || usage.tokens == null || usage.contextWindow <= 0) return "";

  const pct = usage.percent ?? 0;
  const pctText = fgc(theme, stressColor(pct), `${pct.toFixed(1)}%`);
  const tokensText = `${fgc(theme, "text", fmtTokens(usage.tokens))}${fgc(theme, "dim", "/")}${fgc(theme, "text", fmtTokens(usage.contextWindow))}`;
  const contextIcon = fgc(theme, stressColor(pct), "📊");

  const reserved = visibleWidth(contextIcon) + visibleWidth(pctText) + visibleWidth(tokensText) + 6;
  const barWidth = Math.max(4, Math.min(20, maxWidth - reserved));
  const bar = renderBar(theme, pct, barWidth);

  return `${contextIcon} ${bar} ${pctText} ${fgc(theme, "dim", "·")} ${tokensText}`;
}

function buildLine2Segments(
  ctx: ExtensionContext,
  footerData: ReadonlyFooterDataProvider,
  theme: Theme,
  config: PiTuiConfig,
): Seg[] {
  const segs = config.footer.segments;
  const result: Seg[] = [];

  if (segs.model) {
    const modelId = ctx.model?.id ?? "default";
    const provider = ctx.model?.provider;
    const parts: string[] = [fgc(theme, "mdLink", "🤖")];
    if (provider) parts.push(fgc(theme, "muted", provider));
    parts.push(fgc(theme, "dim", modelId));
    result.push({ key: "model", text: parts.join(" "), priority: PRIORITY.model });
  }

  if (segs.thinking) {
    const level = ctx.thinkingLevel ?? "off";
    if (level !== "off") {
      result.push({
        key: "thinking",
        text: `${fgc(theme, "accent", "💭")} ${fgc(theme, "accent", level)}`,
        priority: PRIORITY.thinking,
      });
    }
  }

  if (segs.tokens) {
    const usage = ctx.getContextUsage();
    if (usage && usage.tokens != null && usage.contextWindow != null) {
      result.push({
        key: "tokens",
        text: `${fgc(theme, "success", "⬆")} ${fgc(theme, "dim", fmtTokens(usage.tokens))}${fgc(theme, "dim", "/")}${fgc(theme, "dim", fmtTokens(usage.contextWindow))}`,
        priority: PRIORITY.tokens,
      });
    }
  }

  if (segs.extStatus) {
    const statuses = footerData.getExtensionStatuses();
    if (statuses.size > 0) {
      const statusText = Array.from(statuses.values())
        .filter(Boolean)
        .join(` ${fgc(theme, "dim", "|")} `);
      if (statusText) {
        result.push({
          key: "extStatus",
          text: `${fgc(theme, "mdLink", "🔌")} ${fgc(theme, "muted", statusText)}`,
          priority: PRIORITY.extStatus,
        });
      }
    }
  }

  return result;
}

/* ── Footer component ── */

class PiTuiFooter implements Component {
  constructor(
    private readonly ctx: ExtensionContext,
    private readonly footerData: ReadonlyFooterDataProvider,
    private readonly theme: Theme,
    private readonly getConfig: () => PiTuiConfig,
  ) {}

  invalidate(): void {}

  render(width: number): string[] {
    if (width <= 0) return [""];
    const config = this.getConfig();
    if (!config.enabled || !config.footer.enabled) return [""];

    const theme = this.theme;
    const zones = config.footer.zones;

    // ── Line 1: cwd, git, runtime, context bar ──
    const allLine1 = buildLine1Segments(this.ctx, this.footerData, theme, config, width);
    const leftLine1 = allLine1.filter((s) => (zones[s.key] ?? "left") === "left");
    const centerLine1 = allLine1.filter((s) => zones[s.key] === "center");
    const rightLine1 = allLine1.filter((s) => zones[s.key] === "right");

    // Context bar is a special segment — render it as a single string
    let contextBarText = "";
    if (config.footer.segments.contextBar) {
      const ctxZone = zones.contextBar ?? "center";
      // Allocate roughly 1/3 of width for context bar
      const ctxBudget = Math.floor(width / 3);
      contextBarText = buildContextBar(this.ctx, theme, ctxBudget);
      if (ctxZone === "left") leftLine1.push({ key: "contextBar", text: contextBarText, priority: PRIORITY.contextBar });
      else if (ctxZone === "center") centerLine1.push({ key: "contextBar", text: contextBarText, priority: PRIORITY.contextBar });
      else rightLine1.push({ key: "contextBar", text: contextBarText, priority: PRIORITY.contextBar });
    }

    const leftText1 = packSegments(leftLine1, width).text;
    const centerText1 = packSegments(centerLine1, width).text;
    const rightText1 = packSegments(rightLine1, width).text;
    const line1 = renderThreeZoneLine(leftText1, centerText1, rightText1, width, theme);

    // ── Line 2: model, thinking, tokens, ext status ──
    const allLine2 = buildLine2Segments(this.ctx, this.footerData, theme, config);
    const leftLine2 = allLine2.filter((s) => (zones[s.key] ?? "left") === "left");
    const centerLine2 = allLine2.filter((s) => zones[s.key] === "center");
    const rightLine2 = allLine2.filter((s) => zones[s.key] === "right");

    const leftText2 = packSegments(leftLine2, width).text;
    const centerText2 = packSegments(centerLine2, width).text;
    const rightText2 = packSegments(rightLine2, width).text;
    const line2 = renderThreeZoneLine(leftText2, centerText2, rightText2, width, theme);

    const result: string[] = [];
    if (line1) result.push(truncateToWidth(line1, width, "…"));
    if (line2) result.push(truncateToWidth(line2, width, "…"));

    return result.length > 0 ? result : [""];
  }
}

/* ── Installer ── */

export function installFooter(
  ctx: ExtensionContext,
  getConfig: () => PiTuiConfig,
): () => void {
  ctx.ui.setFooter((_tui, theme, footerData) => {
    return new PiTuiFooter(ctx, footerData, theme, getConfig);
  });

  return () => {
    ctx.ui.setFooter(undefined);
  };
}
