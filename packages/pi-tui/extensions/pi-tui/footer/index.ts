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
  cwd: 6, model: 9, tokens: 7, timer: 4, gitBranch: 10, gitStatus: 9,
  gitCommit: 8, contextBar: 8, thinking: 6, cost: 7, extStatus: 3,
};

type FooterSegment = { key: FooterSegmentKey; text: string; priority: number };

/** Select the highest-priority segments that fit while retaining their configured order. */
function selectSegments(segments: FooterSegment[], maxWidth: number): FooterSegment[] {
  if (maxWidth <= 0 || segments.length === 0) return [];
  const selected: FooterSegment[] = [];
  const deferred: FooterSegment[] = [];
  let selectedWidth = 0;
  const sorted = [...segments].sort((a, b) => b.priority - a.priority);

  // Keep a long high-priority segment from consuming space needed by shorter,
  // lower-priority segments such as the Git indicators.
  for (const segment of sorted) {
    const separatorWidth = selected.length ? visibleWidth(FOOTER_SEPARATOR) : 0;
    const available = maxWidth - selectedWidth - separatorWidth;
    if (available <= 0) {
      deferred.push(segment);
      continue;
    }
    if (visibleWidth(segment.text) > available) {
      // Git indicators are useful even when the commit subject or path leaves
      // little room; keep a compact/truncated indicator instead of dropping it.
      if (segment.key.startsWith("git")) {
        const text = truncateToWidth(segment.text, available, "…");
        if (text) {
          selected.push({ ...segment, text });
          selectedWidth += separatorWidth + visibleWidth(text);
        }
      } else {
        deferred.push(segment);
      }
      continue;
    }
    selected.push(segment);
    selectedWidth += separatorWidth + visibleWidth(segment.text);
  }

  for (const segment of deferred) {
    const separatorWidth = selected.length ? visibleWidth(FOOTER_SEPARATOR) : 0;
    const available = maxWidth - selectedWidth - separatorWidth;
    if (available <= 0) continue;
    const text = truncateToWidth(segment.text, available, "…");
    if (!text) continue;
    selected.push({ ...segment, text });
    selectedWidth += separatorWidth + visibleWidth(text);
  }

  return selected;
}

function joinSegments(segments: FooterSegment[]): string {
  return segments.map((segment) => segment.text).join(FOOTER_SEPARATOR);
}

/** Pack the highest-priority segments while retaining their configured order. */
export function packSegments(segments: FooterSegment[], maxWidth: number): string {
  const selected = selectSegments(segments, maxWidth);
  const selectedText = new Map(selected.map((segment) => [segment.key, segment.text]));
  return joinSegments(segments
    .filter((segment) => selectedText.has(segment.key))
    .map((segment) => ({ ...segment, text: selectedText.get(segment.key)! })));
}

function renderSegment(key: FooterSegmentKey, ctx: SegmentContext): string {
  const renderer = SEGMENT_RENDERERS[key] ?? (key === "contextBar" ? SEGMENT_RENDERERS.context_bar : undefined);
  return renderer ? renderer(ctx) : "";
}

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

  const rightStart = Math.max(0, width - rightWidth);
  const centerStart = center
    ? Math.max(leftWidth, Math.min(
      Math.floor((width - centerWidth) / 2),
      rightStart - (right ? centerWidth : 0),
    ))
    : rightStart;
  const parts: string[] = [];
  if (left) parts.push(left);
  if (center) parts.push(" ".repeat(Math.max(0, centerStart - leftWidth)), center);
  if (right) {
    const used = center ? centerStart + centerWidth : leftWidth;
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
  private readonly timerHandle: ReturnType<typeof setInterval>;
  private readonly unsubscribeBranchChange: () => void;

  constructor(
    ctx: ExtensionContext,
    footerData: ReadonlyFooterDataProvider,
    theme: Theme,
    getConfig: () => PiTuiConfig,
    getGitStatus: () => GitStatus | undefined,
    requestRender: () => void,
  ) {
    this.ctx = ctx;
    this.footerData = footerData;
    this.theme = theme;
    this.getConfig = getConfig;
    this.getGitStatus = getGitStatus;
    this.startTime = Date.now();
    this.timerHandle = setInterval(requestRender, 1000);
    this.timerHandle.unref?.();
    this.unsubscribeBranchChange = footerData.onBranchChange(() => requestRender());
  }

  invalidate(): void {}
  dispose(): void {
    clearInterval(this.timerHandle);
    this.unsubscribeBranchChange();
  }

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
      usage: this.getUsage(),
      thinkingLevel: this.ctx.thinkingLevel,
      startTime: this.startTime,
      // The extension owns the async snapshot; keep it in the segment context so
      // branch, status, and commit renderers all use the same value.
      git: this.getGitStatus(),
      iconMode: config.icons.mode,
      iconOverrides,
    };
    const enabled = config.footer.segments;
    // Keep the two lines independent: the context bar is a line-1-only segment
    // and must not affect selection of line-2 metrics.
    const line1Keys: FooterSegmentKey[] = ["cwd", "timer", "gitBranch", "gitStatus", "gitCommit"];
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
      const selected = selectSegments(
        [...groups.left, ...groups.center, ...groups.right],
        availableWidth,
      );
      const selectedText = new Map(selected.map((segment) => [segment.key, segment.text]));
      return {
        left: joinSegments(groups.left
          .filter((segment) => selectedText.has(segment.key))
          .map((segment) => ({ ...segment, text: selectedText.get(segment.key)! }))),
        center: joinSegments(groups.center
          .filter((segment) => selectedText.has(segment.key))
          .map((segment) => ({ ...segment, text: selectedText.get(segment.key)! }))),
        right: joinSegments(groups.right
          .filter((segment) => selectedText.has(segment.key))
          .map((segment) => ({ ...segment, text: selectedText.get(segment.key)! }))),
      };
    };

    const contextUsage = segmentCtx.contextUsage;
    const contextRequested = enabled.contextBar &&
      (config.footer.context.showBar || config.footer.context.showCompact) &&
      contextUsage !== undefined && contextUsage.contextWindow > 0;
    const configuredContextIcon = config.footer.context.icon ?? iconOverrides.contextBar;
    const contextIcon = configuredContextIcon ?? (
      config.icons.mode === "ascii" ? resolveIcon(undefined, "contextBar", "ascii") : undefined
    );
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

  /** Get cumulative token usage from the supported session branch. */
  private getUsage(): SegmentContext["usage"] {
    const usage = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
    };

    try {
      for (const entry of this.ctx.sessionManager.getEntries()) {
        if (entry.type === "message") {
          if (entry.message.role !== "assistant" && entry.message.role !== "toolResult") continue;
          const messageUsage = entry.message.usage;
          if (!messageUsage) continue;
          usage.input += messageUsage.input ?? 0;
          usage.output += messageUsage.output ?? 0;
          usage.cacheRead += messageUsage.cacheRead ?? 0;
          usage.cacheWrite += messageUsage.cacheWrite ?? 0;
          usage.cost += messageUsage.cost?.total ?? 0;
        } else if ((entry.type === "compaction" || entry.type === "branch_summary") && entry.usage) {
          usage.input += entry.usage.input ?? 0;
          usage.output += entry.usage.output ?? 0;
          usage.cacheRead += entry.usage.cacheRead ?? 0;
          usage.cacheWrite += entry.usage.cacheWrite ?? 0;
          usage.cost += entry.usage.cost?.total ?? 0;
        }
      }
    } catch {
      // Graceful fallback: usage data unavailable
    }

    return usage;
  }
}

export function installFooter(
  ctx: ExtensionContext,
  getConfig: () => PiTuiConfig,
  getGitStatus: () => GitStatus | undefined = () => undefined,
  setRequestRender?: (requestRender: (() => void) | undefined) => void,
): () => void {
  ctx.ui.setFooter((tui, theme, footerData) => {
    const requestRender = () => tui.requestRender();
    setRequestRender?.(requestRender);
    return new PiTuiFooter(ctx, footerData, theme, getConfig, getGitStatus, requestRender);
  });
  return () => {
    setRequestRender?.(undefined);
    ctx.ui.setFooter(undefined);
  };
}
