/**
 * pi-tui footer component — left-packed segment rendering.
 *
 * Footer segments use the shared renderers from segments.ts. The context bar
 * is appended after packed segments and expands to the right edge.
 */

import type { ExtensionContext, ReadonlyFooterDataProvider, Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { FooterSegmentKey, PiTuiConfig } from "../config.ts";
import { SEGMENT_RENDERERS, type SegmentContext } from "./segments.ts";

const SEP = " · ";
const PRIORITY: Record<FooterSegmentKey, number> = {
  cwd: 10, model: 9, tokens: 7, timer: 6, gitBranch: 8, gitStatus: 5,
  gitCommit: 4, runtime: 5, contextBar: 8, thinking: 6, cost: 7, extStatus: 3,
};

interface Seg { key: FooterSegmentKey; text: string; priority: number }

function packSegments(segs: Seg[], maxWidth: number): string {
  if (maxWidth <= 0 || segs.length === 0) return "";
  const sorted = [...segs].sort((a, b) => a.priority - b.priority);
  const kept: Seg[] = [];
  let width = 0;
  for (const seg of sorted) {
    const separator = kept.length > 0 ? visibleWidth(SEP) : 0;
    const available = maxWidth - width - separator;
    if (available <= 0) continue;
    const text = visibleWidth(seg.text) <= available
      ? seg.text
      : truncateToWidth(seg.text, available, "…");
    if (!text) continue;
    kept.push({ ...seg, text });
    width += separator + visibleWidth(text);
  }
  return kept.map((seg) => seg.text).join(SEP);
}

function contextBar(ctx: ExtensionContext, theme: Theme, width: number): string {
  const usage = ctx.getContextUsage();
  if (!usage || usage.tokens == null || usage.contextWindow <= 0 || width <= 0) return "";
  const pct = usage.percent ?? 0;
  const icon = (theme as any).fg(pct >= 90 ? "error" : pct >= 70 ? "warning" : "accent", "📊");
  const pctText = (theme as any).fg(pct >= 90 ? "error" : pct >= 70 ? "warning" : "accent", `${pct.toFixed(1)}%`);
  const fmt = (n: number) => n < 1000 ? `${n}` : n < 1_000_000 ? `${Math.round(n / 1000)}k` : `${(n / 1_000_000).toFixed(1)}M`;
  const tokens = `${fmt(usage.tokens)}/${fmt(usage.contextWindow)}`;
  const fixed = visibleWidth(icon) + visibleWidth(pctText) + visibleWidth(tokens) + 6;
  const barWidth = Math.max(4, width - fixed);
  const filled = Math.min(barWidth, Math.round((pct / 100) * barWidth));
  const bar = (theme as any).fg("dim", "[") +
    (theme as any).fg(pct >= 90 ? "error" : pct >= 70 ? "warning" : "accent", "█".repeat(filled)) +
    (theme as any).fg("dim", "░".repeat(barWidth - filled) + "]");
  return `${icon} ${bar} ${pctText} ${(theme as any).fg("dim", "·")} ${tokens}`;
}

function usage(ctx: ExtensionContext): SegmentContext["usage"] {
  // Runtime dependency retained from PR 4; unavailable usage degrades cleanly.
  try {
    const session = (ctx as any).session;
    if (session?.usage) return {
      input: session.usage.input ?? 0, output: session.usage.output ?? 0,
      cacheRead: session.usage.cacheRead ?? 0, cacheWrite: session.usage.cacheWrite ?? 0,
      cost: session.usage.cost ?? 0,
    };
  } catch { /* graceful fallback */ }
  return undefined;
}

function renderSegment(key: FooterSegmentKey, ctx: SegmentContext): string {
  const renderer = key === "gitBranch" || key === "gitStatus" || key === "gitCommit"
    ? SEGMENT_RENDERERS.git : SEGMENT_RENDERERS[key === "contextBar" ? "context_bar" : key === "extStatus" ? "ext_status" : key];
  return renderer ? renderer(ctx) : "";
}

class PiTuiFooter implements Component {
  constructor(
    private readonly ctx: ExtensionContext,
    private readonly footerData: ReadonlyFooterDataProvider,
    private readonly theme: Theme,
    private readonly getConfig: () => PiTuiConfig,
    private readonly startTime = Date.now(),
  ) {}

  invalidate(): void {}
  dispose(): void {}

  render(width: number): string[] {
    const config = this.getConfig();
    if (width <= 0 || !config.enabled || !config.footer.enabled) return [""];
    const segmentCtx: SegmentContext = {
      theme: this.theme, cwd: this.ctx.sessionManager.getCwd(), width,
      footerData: this.footerData, config: config.footer,
      modelId: this.ctx.model?.id, contextWindow: this.ctx.model?.contextWindow,
      usage: usage(this.ctx), thinkingLevel: this.ctx.thinkingLevel, startTime: this.startTime,
    };
    const enabled = config.footer.segments;
    const line1Keys: FooterSegmentKey[] = ["cwd", "gitBranch", "gitStatus", "gitCommit", "runtime"];
    const line2Keys: FooterSegmentKey[] = ["model", "thinking", "tokens", "cost", "extStatus"];
    const make = (keys: FooterSegmentKey[]) => packSegments(keys.filter((key) => enabled[key]).map((key) => ({
      key, text: renderSegment(key, segmentCtx), priority: PRIORITY[key],
    })).filter((seg) => seg.text), width);
    const line1Packed = make(line1Keys);
    const line2 = make(line2Keys);
    let line1 = line1Packed;
    if (enabled.contextBar) {
      const separator = line1Packed ? SEP : "";
      const bar = contextBar(this.ctx, this.theme, Math.max(0, width - visibleWidth(line1Packed) - visibleWidth(separator)));
      line1 = line1Packed + separator + bar;
    }
    return [line1, line2].filter(Boolean).map((line) => truncateToWidth(line, width, "…"));
  }
}

export function installFooter(ctx: ExtensionContext, getConfig: () => PiTuiConfig): () => void {
  ctx.ui.setFooter((_tui, theme, footerData) => new PiTuiFooter(ctx, footerData, theme, getConfig));
  return () => ctx.ui.setFooter(undefined);
}
