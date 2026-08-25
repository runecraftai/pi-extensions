/**
 * Footer installer — renders a 2-line Starship-style footer.
 *
 * Line 1: CWD · git branch · runtime · context bar (stretches to fill remaining width)
 * Line 2: model · thinking · tokens · extension status (left-packed, padded to right edge)
 *
 * Segments are left-packed with normal separators. The context bar (or a filler)
 * stretches to consume all remaining width so the footer reaches the right edge.
 * Narrow terminals degrade by dropping lowest-priority segments.
 */

import type { ExtensionContext, ReadonlyFooterDataProvider, Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { FooterSegmentKey, PiTuiConfig } from "../config.ts";

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

function basenamePath(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).at(-1) ?? p;
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

/* ── Left-packed segment rendering ── */

const SEP = " · ";
const SEP_W = visibleWidth(SEP);

/**
 * Render left-packed segments joined by " · ", truncated to fit maxWidth.
 * Returns the joined text and its visible width.
 */
function renderLeftPacked(segs: Seg[], maxWidth: number): { text: string; width: number } {
  if (segs.length === 0) return { text: "", width: 0 };

  // Drop lowest-priority segments until they fit
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
  const w = visibleWidth(joined);
  return { text: joined, width: w };
}

/* ── Build segments ── */

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

/**
 * Render context bar that stretches to fill `remainingWidth`.
 * The bar expands to consume all available space.
 */
function buildContextBar(
  ctx: ExtensionContext,
  theme: Theme,
  remainingWidth: number,
): string {
  const usage = ctx.getContextUsage();
  if (!usage || usage.tokens == null || usage.contextWindow <= 0) return "";

  const pct = usage.percent ?? 0;
  const pctText = fgc(theme, stressColor(pct), `${pct.toFixed(1)}%`);
  const tokensText = `${fgc(theme, "text", fmtTokens(usage.tokens))}${fgc(theme, "dim", "/")}${fgc(theme, "text", fmtTokens(usage.contextWindow))}`;
  const contextIcon = fgc(theme, stressColor(pct), "📊");

  const spacing = 4 + visibleWidth(fgc(theme, "dim", "·"));
  const reserved = visibleWidth(contextIcon) + visibleWidth(pctText) + visibleWidth(tokensText) + spacing;
  // Bar stretches to fill all remaining width
  const barWidth = Math.max(4, remainingWidth - reserved);
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

    // ── Line 1: left-packed segments + context bar stretches to right edge ──
    const line1Segs = buildLine1Segments(this.ctx, this.footerData, theme, config, width);
    const { text: packedText, width: packedW } = renderLeftPacked(line1Segs, width);

    let line1: string;
    if (config.footer.segments.contextBar) {
      // Separator + context bar consume the remaining width
      const afterPacked = width - packedW;
      const sepSlot = packedW > 0 && afterPacked > SEP_W ? SEP_W : 0;
      const contextAvail = afterPacked - sepSlot;
      const contextText = contextAvail > 0 ? buildContextBar(this.ctx, theme, contextAvail) : "";
      const contextW = visibleWidth(contextText);

      if (packedW > 0 && contextText) {
        // packed segments + separator + context bar (fills remaining)
        const pad = Math.max(0, width - packedW - sepSlot - contextW);
        line1 = packedText + fgc(theme, "dim", SEP) + contextText + " ".repeat(pad);
      } else if (contextText) {
        // No packed segments, just context bar filling the width
        const pad = Math.max(0, width - contextW);
        line1 = contextText + " ".repeat(pad);
      } else {
        // No context data, just packed segments padded to right edge
        const pad = Math.max(0, width - packedW);
        line1 = packedText + " ".repeat(pad);
      }
    } else {
      // No context bar: packed segments padded to right edge
      const pad = Math.max(0, width - packedW);
      line1 = packedText + " ".repeat(pad);
    }

    // ── Line 2: left-packed segments padded to right edge ──
    const line2Segs = buildLine2Segments(this.ctx, this.footerData, theme, config);
    const { text: line2Packed, width: line2W } = renderLeftPacked(line2Segs, width);
    const line2Pad = Math.max(0, width - line2W);
    const line2 = line2Packed + " ".repeat(line2Pad);

    const result: string[] = [];
    if (line1) result.push(line1);
    if (line2) result.push(line2);

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
