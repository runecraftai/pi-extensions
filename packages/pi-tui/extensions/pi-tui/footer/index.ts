/**
 * pi-tui footer component — one canonical left-packed segment pipeline.
 *
 * Line 1 contains project identity plus a context bar that fills remaining
 * width. Line 2 contains session metrics. Segment renderers live in segments.ts.
 */

import type { ExtensionContext, ReadonlyFooterDataProvider, Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { FooterSegmentKey, PiTuiConfig } from "../config.ts";
import { resolveIcon, type SegmentIcons } from "../icons.ts";
import { renderContextBar, renderContextCompact } from "./context-bar.ts";
import type { GitStatus } from "./git.ts";
import {
  SEGMENT_RENDERERS,
  type SegmentContext,
} from "./segments.ts";

export const FOOTER_SEPARATOR = " · ";
export const FOOTER_PRIORITY: Record<FooterSegmentKey, number> = {
  cwd: 10, model: 9, tokens: 7, timer: 6, gitBranch: 8, gitStatus: 5,
  gitCommit: 4, runtime: 5, contextBar: 8, thinking: 6, cost: 7, extStatus: 3,
};

type FooterSegment = { key: FooterSegmentKey; text: string; priority: number };

/** Pack the highest-priority segments while retaining their configured order. */
export function packSegments(segments: FooterSegment[], maxWidth: number): string {
  if (maxWidth <= 0 || segments.length === 0) return "";
  const selected: FooterSegment[] = [];
  let selectedWidth = 0;
  for (const segment of [...segments].sort((a, b) => b.priority - a.priority)) {
    const separatorWidth = selected.length ? visibleWidth(FOOTER_SEPARATOR) : 0;
    const available = maxWidth - selectedWidth - separatorWidth;
    if (available <= 0) continue;
    const text = visibleWidth(segment.text) <= available
      ? segment.text
      : truncateToWidth(segment.text, available, "…");
    if (!text) continue;
    selected.push({ ...segment, text });
    selectedWidth += separatorWidth + visibleWidth(text);
  }
  const selectedKeys = new Set(selected.map((segment) => segment.key));
  return segments.filter((segment) => selectedKeys.has(segment.key)).map((segment) => {
    return selected.find((candidate) => candidate.key === segment.key)!.text;
  }).join(FOOTER_SEPARATOR);
}

function getUsage(ctx: ExtensionContext): SegmentContext["usage"] {
  try {
    const session = (ctx as any).session;
    if (session?.usage) {
      return {
        input: session.usage.input ?? 0,
        output: session.usage.output ?? 0,
        cacheRead: session.usage.cacheRead ?? 0,
        cacheWrite: session.usage.cacheWrite ?? 0,
        cost: session.usage.cost ?? 0,
      };
    }
  } catch { /* Runtime versions without session usage simply omit metrics. */ }
  return undefined;
}

function renderSegment(key: FooterSegmentKey, ctx: SegmentContext): string {
  const renderer = SEGMENT_RENDERERS[key] ?? (key === "contextBar" ? SEGMENT_RENDERERS.context_bar : undefined);
  return renderer ? renderer(ctx) : "";
}

function renderContextSegment(
  ctx: ExtensionContext,
  theme: Theme,
  width: number,
  config: PiTuiConfig,
  iconOverrides: Partial<SegmentIcons>,
): string {
  const usage = ctx.getContextUsage();
  if (!usage || usage.tokens == null || usage.contextWindow <= 0 || width <= 0) return "";
  const icon = config.footer.context.icon ?? resolveIcon(iconOverrides, "contextBar");
  if (config.footer.context.showCompact) {
    return renderContextCompact(theme, usage.percent ?? 0, icon);
  }
  return renderContextBar(
    theme,
    usage.percent ?? 0,
    usage.tokens,
    usage.contextWindow,
    width,
    icon,
  );
}

class PiTuiFooter implements Component {
  private readonly startTime: number;
  private readonly ctx: ExtensionContext;
  private readonly footerData: ReadonlyFooterDataProvider;
  private readonly theme: Theme;
  private readonly getConfig: () => PiTuiConfig;
  private readonly getGitStatus: () => GitStatus | undefined;

  constructor(
    ctx: ExtensionContext,
    footerData: ReadonlyFooterDataProvider,
    theme: Theme,
    getConfig: () => PiTuiConfig,
    getGitStatus: () => GitStatus | undefined,
  ) {
    this.ctx = ctx;
    this.footerData = footerData;
    this.theme = theme;
    this.getConfig = getConfig;
    this.getGitStatus = getGitStatus;
    this.startTime = Date.now();
  }

  invalidate(): void {}
  dispose(): void {}

  render(width: number): string[] {
    const config = this.getConfig();
    if (width <= 0 || !config.enabled || !config.footer.enabled) return [""];

    const iconOverrides: Partial<SegmentIcons> = {
      ...config.icons.custom,
      ...config.header.icons,
    };
    const segmentCtx: SegmentContext = {
      theme: this.theme,
      cwd: this.ctx.sessionManager.getCwd(),
      width,
      footerData: this.footerData,
      config: config.footer,
      modelId: this.ctx.model?.id,
      contextWindow: this.ctx.model?.contextWindow,
      usage: getUsage(this.ctx),
      thinkingLevel: this.ctx.thinkingLevel,
      startTime: this.startTime,
      git: this.getGitStatus(),
      iconMode: config.icons.mode,
      iconOverrides,
    };
    const enabled = config.footer.segments;
    const line1Keys: FooterSegmentKey[] = ["cwd", "gitBranch", "gitStatus", "gitCommit", "runtime"];
    const line2Keys: FooterSegmentKey[] = ["model", "thinking", "tokens", "cost", "extStatus"];
    const make = (keys: FooterSegmentKey[], availableWidth: number) => packSegments(
      keys.filter((key) => enabled[key]).map((key) => ({
        key,
        text: renderSegment(key, segmentCtx),
        priority: FOOTER_PRIORITY[key],
      })).filter((segment) => segment.text),
      availableWidth,
    );

    let line1 = make(line1Keys, width);
    if (enabled.contextBar && (config.footer.context.showBar || config.footer.context.showCompact)) {
      const separator = line1 ? FOOTER_SEPARATOR : "";
      const available = Math.max(0, width - visibleWidth(line1) - visibleWidth(separator));
      const context = renderContextSegment(this.ctx, this.theme, available, config, iconOverrides);
      if (context) line1 += separator + context;
    }
    const line2 = make(line2Keys, width);
    return [line1, line2]
      .filter(Boolean)
      .map((line) => truncateToWidth(line, width, "…"));
  }
}

export function installFooter(
  ctx: ExtensionContext,
  getConfig: () => PiTuiConfig,
  getGitStatus: () => GitStatus | undefined = () => undefined,
  setRequestRender?: (requestRender: (() => void) | undefined) => void,
): () => void {
  ctx.ui.setFooter((tui, theme, footerData) => {
    setRequestRender?.(() => tui.requestRender());
    return new PiTuiFooter(ctx, footerData, theme, getConfig, getGitStatus);
  });
  return () => {
    setRequestRender?.(undefined);
    ctx.ui.setFooter(undefined);
  };
}
