/**
 * pi-tui footer component — one canonical left-packed segment pipeline.
 *
 * Line 1 contains project identity plus a context bar that fills remaining
 * width. Line 2 contains session metrics. Segment renderers live in segments.ts.
 */

import type { ExtensionContext, ReadonlyFooterDataProvider, Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { FooterSegmentKey, FooterZone, PiTuiConfig } from "../config.ts";
import { resolveIcon, type SegmentIcons } from "../icons.ts";
import { contextBarMinimumWidth } from "./context-bar.ts";
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

const ZONE_ORDER: FooterZone[] = ["left", "center", "right"];

function normalizeZone(zone: unknown): FooterZone {
  return zone === "center" || zone === "right" ? zone : "left";
}

function layoutZones(texts: Record<FooterZone, string>, width: number): string {
  const left = texts.left;
  const center = texts.center;
  const right = texts.right;
  const leftWidth = visibleWidth(left);
  const centerWidth = visibleWidth(center);
  const rightWidth = visibleWidth(right);
  if (!center && !right) return left;
  if (!left && !right) return " ".repeat(Math.max(0, Math.floor((width - centerWidth) / 2))) + center;
  if (!left && !center) return " ".repeat(Math.max(0, width - rightWidth)) + right;

  const separator = visibleWidth(FOOTER_SEPARATOR);
  const rightStart = Math.max(0, width - rightWidth);
  const centerStart = center
    ? Math.max(leftWidth + (left ? separator : 0), Math.floor((width - centerWidth) / 2))
    : rightStart;
  const parts: string[] = [];
  if (left) parts.push(left);
  if (center) {
    const start = Math.min(centerStart, rightStart - (right ? separator + centerWidth : centerWidth));
    parts.push(" ".repeat(Math.max(0, start - leftWidth - (left ? separator : 0))), center);
  }
  if (right) {
    const used = leftWidth + (left && center ? separator : 0) + centerWidth;
    parts.push(" ".repeat(Math.max(0, rightStart - used)), right);
  }
  return parts.join("");
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
    };
    const segmentCtx: SegmentContext = {
      theme: this.theme,
      cwd: this.ctx.sessionManager.getCwd(),
      width,
      footerData: this.footerData,
      config: config.footer,
      modelId: this.ctx.model?.id,
      contextWindow: this.ctx.model?.contextWindow,
      contextUsage: (() => {
        const usage = this.ctx.getContextUsage();
        return usage && usage.tokens != null
          ? { tokens: usage.tokens, contextWindow: usage.contextWindow, percent: usage.percent }
          : undefined;
      })(),
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
    const makeZoneTexts = (keys: FooterSegmentKey[], availableWidth: number): Record<FooterZone, string> => {
      const groups: Record<FooterZone, FooterSegment[]> = { left: [], center: [], right: [] };
      for (const key of keys) {
        if (!enabled[key]) continue;
        const text = renderSegment(key, segmentCtx);
        if (text) groups[normalizeZone(config.footer.zones[key])].push({
          key, text, priority: FOOTER_PRIORITY[key],
        });
      }
      return {
        left: packSegments(groups.left, availableWidth),
        center: packSegments(groups.center, availableWidth),
        right: packSegments(groups.right, availableWidth),
      };
    };

    const contextUsage = segmentCtx.contextUsage;
    const contextRequested = enabled.contextBar &&
      (config.footer.context.showBar || config.footer.context.showCompact) &&
      contextUsage !== undefined && contextUsage.contextWindow > 0;
    const contextIcon = config.icons.mode === "ascii"
      ? ""
      : config.footer.context.icon ?? resolveIcon(iconOverrides, "contextBar");
    const contextMinWidth = contextRequested
      ? contextBarMinimumWidth(
        this.theme,
        contextUsage.percent ?? 0,
        contextUsage.tokens,
        contextUsage.contextWindow,
        contextIcon,
      )
      : 0;
    const contextZone = normalizeZone(config.footer.zones.contextBar);
    const regularWidth = Math.max(0, width - (contextMinWidth ? contextMinWidth + visibleWidth(FOOTER_SEPARATOR) : 0));
    const regularTexts = makeZoneTexts(line1Keys, regularWidth);
    let line1: string;

    if (!contextRequested) {
      line1 = layoutZones(regularTexts, width);
    } else if (contextZone === "right") {
      const regularLine = layoutZones(regularTexts, regularWidth);
      const separator = regularLine ? FOOTER_SEPARATOR : "";
      const available = Math.max(0, width - visibleWidth(regularLine) - visibleWidth(separator));
      const context = renderSegment("contextBar", { ...segmentCtx, width: available });
      line1 = regularLine + separator + context;
    } else {
      const context = renderSegment("contextBar", { ...segmentCtx, width: contextMinWidth });
      const zoneTexts = { ...regularTexts };
      zoneTexts[contextZone] = zoneTexts[contextZone]
        ? `${context}${FOOTER_SEPARATOR}${zoneTexts[contextZone]}`
        : context;
      line1 = layoutZones(zoneTexts, width);
    }

    const line2 = layoutZones(makeZoneTexts(line2Keys, width), width);
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
