/**
 * Footer installer — wires up the configurable two-line footer.
 *
 * Modeled after pi-open-tui's footer pattern. Uses pi's native setFooter API.
 * The footer renders configurable segments with priority-based fitting for narrow terminals.
 */

import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import {
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import type { FooterConfig } from "../config.ts";
import type { GitStatus } from "./git.ts";
import { emptyGitStatus, readGitStatus } from "./git.ts";
import type { ReadonlyFooterDataProvider } from "@earendil-works/pi-coding-agent";
import {
  type IconGlyphs,
  resolveGlyphs,
  type SegmentContext,
  type PrioritizedSegment,
  fitSegmentsByPriority,
  renderCwd,
  renderCwdCompact,
  renderGit,
  renderContextBarSegment,
  renderContextCompactSegment,
  renderContextPct,
  renderTokens,
  renderCost,
  renderModel,
  renderThinking,
  renderTimer,
  renderSeparator,
  renderText,
  renderExtStatus,
  type UsageTotals,
  formatProviderLabel,
} from "./segments.ts";

/* ── Footer state ── */

export interface FooterState {
  git: GitStatus;
  workingSince: number | undefined;
  lastDoneIn: number | undefined;
}

export function createFooterState(): FooterState {
  return {
    git: emptyGitStatus(),
    workingSince: undefined,
    lastDoneIn: undefined,
  };
}

/* ── Usage totals (cached) ── */

let usageCache: { key: string; totals: UsageTotals } | undefined;

function finiteOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function entriesKey(ctx: ExtensionContext): string {
  const entries = ctx.sessionManager.getEntries();
  const last = entries.at(-1);
  return `${entries.length}:${last?.id ?? ""}:${last?.timestamp ?? ""}`;
}

export function getUsageTotals(ctx: ExtensionContext): UsageTotals {
  const key = entriesKey(ctx);
  if (usageCache && usageCache.key === key) return usageCache.totals;

  const totals: UsageTotals = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    latestCacheHitRate: undefined,
  };

  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "message" && entry.message?.role === "assistant") {
      const m = entry.message;
      const u = m.usage;
      if (!u) continue;
      const input = finiteOrZero(u.input);
      const cacheRead = finiteOrZero(u.cacheRead);
      const cacheWrite = finiteOrZero(u.cacheWrite);
      totals.input += input;
      totals.output += finiteOrZero(u.output);
      totals.cacheRead += cacheRead;
      totals.cacheWrite += cacheWrite;
      totals.cost += finiteOrZero(u.cost?.total);
      const promptTokens = input + cacheRead + cacheWrite;
      if (promptTokens > 0) {
        totals.latestCacheHitRate = (cacheRead / promptTokens) * 100;
      }
    }
  }

  usageCache = { key, totals };
  return totals;
}

export function invalidateUsageCache(): void {
  usageCache = undefined;
}

/* ── Segment resolution ── */

function resolveSegment(
  name: string,
  seg: SegmentContext,
  extStatuses: ReadonlyMap<string, string>,
): string {
  switch (name) {
    case "cwd": return renderCwd(seg);
    case "git": return renderGit(seg);
    case "context_bar": return renderContextBarSegment(seg);
    case "context_pct": return renderContextPct(seg);
    case "tokens": return renderTokens(seg);
    case "cost": return renderCost(seg);
    case "ext_status": return ""; // handled separately (multi-line)
    case "model": return renderModel(seg);
    case "thinking": return renderThinking(seg);
    case "timer": return renderTimer(seg);
    case "separator": return renderSeparator(seg);
    default:
      // text:... literal
      if (name.startsWith("text:")) {
        return renderText(seg, name.slice(5));
      }
      return "";
  }
}

function resolveSegmentPriorities(name: string): number {
  // Higher priority = survives longer in narrow terminals
  switch (name) {
    case "cwd": return 0;
    case "timer": return 1;
    case "git": return 3;
    case "runtime": return 4;
    case "context_bar":
    case "context_pct": return 4;
    case "model": return 5;
    case "thinking": return 3;
    case "tokens": return 2;
    case "cost": return 2;
    case "ext_status": return 1;
    case "separator": return 6;
    default: return 0;
  }
}

/* ── Footer component ── */

interface PiTuiFooterOptions {
  pi: ExtensionAPI;
  ctx: ExtensionContext;
  tui: TUI;
  theme: Theme;
  footerData: ReadonlyFooterDataProvider;
  config: FooterConfig;
  state: FooterState;
  requestRender: () => void;
  scheduleGitRefresh: () => void;
  iconMode: string;
}

class PiTuiFooter implements Component {
  private unsubBranch: (() => void) | undefined;

  constructor(private readonly options: PiTuiFooterOptions) {
    this.unsubBranch = options.footerData.onBranchChange(() => {
      options.scheduleGitRefresh();
      options.tui.requestRender();
    });
  }

  dispose(): void {
    this.unsubBranch?.();
    this.unsubBranch = undefined;
  }

  invalidate(): void {}

  render(width: number): string[] {
    if (width <= 0) return [""];

    const { theme, config, state, ctx, footerData } = this.options;
    const glyphs = resolveGlyphs(this.options.iconMode);
    const totals = getUsageTotals(ctx);

    const modelMeta = {
      provider: formatProviderLabel(ctx.model?.provider),
      model: ctx.model?.name ?? ctx.model?.id ?? "no-model",
      effort: ctx.model?.reasoning ? this.options.pi.getThinkingLevel() : undefined,
    };

    const segCtx: SegmentContext = {
      theme,
      ctx,
      config,
      glyphs,
      git: state.git,
      cwd: ctx.cwd,
      width,
      state: {
        workingSince: state.workingSince,
        lastDoneIn: state.lastDoneIn,
      },
      totals,
      modelMeta,
    };

    const extStatuses = footerData.getExtensionStatuses();

    // Build line 1 segments
    const line1Parts: PrioritizedSegment[] = [];
    for (const name of config.line1.segments) {
      if (name === "ext_status") continue; // handled as multi-line
      if (name === "separator") {
        const text = renderSeparator(segCtx);
        if (text) line1Parts.push({ text, priority: resolveSegmentPriorities(name) });
        continue;
      }
      const text = resolveSegment(name, segCtx, extStatuses);
      if (!text) continue;
      let compactText: string | undefined;
      if (name === "cwd") {
        compactText = renderCwdCompact(segCtx);
      }
      if (name === "context_bar") {
        compactText = renderContextCompactSegment(segCtx);
      }
      line1Parts.push({
        text,
        compactText,
        priority: resolveSegmentPriorities(name),
      });
    }

    const ellipsis = theme.fg("dim", "...");
    const fittedLine1 = fitSegmentsByPriority(line1Parts, width, ellipsis);
    const line1 = truncateToWidth(fittedLine1.join(" "), width, ellipsis);

    // Build line 2 segments
    const line2Parts: PrioritizedSegment[] = [];
    for (const name of config.line2.segments) {
      if (name === "ext_status") continue; // handled as multi-line
      if (name === "separator") {
        const text = renderSeparator(segCtx);
        if (text) line2Parts.push({ text, priority: resolveSegmentPriorities(name) });
        continue;
      }
      const text = resolveSegment(name, segCtx, extStatuses);
      if (!text) continue;
      line2Parts.push({
        text,
        priority: resolveSegmentPriorities(name),
      });
    }

    const fittedLine2 = fitSegmentsByPriority(line2Parts, width, ellipsis);
    const line2 = truncateToWidth(fittedLine2.join(" "), width, ellipsis);

    const mainLines = [line1, line2];

    // Extension status lines (third row if present)
    const extLines = config.line2.segments.includes("ext_status")
      ? renderExtStatus(segCtx, extStatuses)
      : [];

    return [...mainLines, ...extLines];
  }
}

/* ── Installer ── */

export interface FooterHooks {
  setRequestRender: (fn: (() => void) | undefined) => void;
  scheduleGitRefresh: () => void;
}

export function installFooter(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  config: FooterConfig,
  state: FooterState,
  hooks: FooterHooks,
  iconMode: string = "auto",
): () => void {
  let footer: PiTuiFooter | undefined;

  ctx.ui.setFooter((tui, theme, footerData) => {
    hooks.setRequestRender(() => tui.requestRender());
    hooks.scheduleGitRefresh();

    footer?.dispose();
    footer = new PiTuiFooter({
      pi,
      ctx,
      tui,
      theme,
      footerData,
      config,
      state,
      requestRender: () => tui.requestRender(),
      scheduleGitRefresh: hooks.scheduleGitRefresh,
      iconMode,
    });

    return {
      dispose() {
        footer?.dispose();
        footer = undefined;
        hooks.setRequestRender(undefined);
      },
      invalidate() {},
      render(width: number): string[] {
        return footer?.render(width) ?? [""];
      },
    };
  });

  return () => {
    footer?.dispose();
    footer = undefined;
    ctx.ui.setFooter(undefined);
  };
}
