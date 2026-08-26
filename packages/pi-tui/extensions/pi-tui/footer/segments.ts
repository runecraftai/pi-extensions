/** Pure footer segment renderers shared by the canonical footer pipeline. */

import { execSync } from "node:child_process";
import type { ReadonlyFooterDataProvider } from "@earendil-works/pi-coding-agent";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { FooterConfig } from "../config.ts";
import { iconPrefix, resolveIcon, type SegmentIcons } from "../icons.ts";
import type { GitStatus } from "./git.ts";

export interface SegmentContext {
  theme: Theme;
  cwd: string;
  width: number;
  footerData: ReadonlyFooterDataProvider;
  config: {
    git: FooterConfig["git"];
    context: FooterConfig["context"];
    tokens: FooterConfig["tokens"];
    telemetry: FooterConfig["telemetry"];
    cost?: FooterConfig["cost"];
    runtime?: FooterConfig["runtime"];
    timer?: FooterConfig["timer"];
    model?: FooterConfig["model"];
    thinking?: FooterConfig["thinking"];
    extStatus?: FooterConfig["extStatus"];
  };
  modelId?: string;
  contextPercent?: number | null;
  contextWindow?: number;
  usage?: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number };
  thinkingLevel?: string;
  startTime?: number;
  git?: GitStatus;
  iconMode?: string;
  iconOverrides?: Partial<SegmentIcons>;
}

function segmentIcon(ctx: SegmentContext, segment: keyof SegmentIcons, configured?: string): string {
  if (!ctx.iconMode || ctx.iconMode === "ascii") return "";
  const overrides = { ...(ctx.iconOverrides ?? {}) };
  if (configured !== undefined) overrides[segment] = configured;
  return iconPrefix(ctx.theme, overrides, segment);
}

export function renderCwd(ctx: SegmentContext): string {
  const cwd = ctx.cwd || ".";
  return `${segmentIcon(ctx, "cwd")}${ctx.theme.fg("dim", cwd)}`;
}

export function renderTimer(ctx: SegmentContext): string {
  const elapsed = Math.max(0, Math.floor((Date.now() - (ctx.startTime ?? Date.now())) / 1000));
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const time = hours > 0
    ? `${hours}h${minutes.toString().padStart(2, "0")}m`
    : minutes > 0
      ? `${minutes}m${(elapsed % 60).toString().padStart(2, "0")}s`
      : `${elapsed}s`;
  const prefix = segmentIcon(ctx, "timer", ctx.config.timer?.icon);
  return `${prefix || "⏱ "}${ctx.theme.fg("dim", time)}`;
}

function branch(ctx: SegmentContext): string | undefined {
  return ctx.git?.branch ?? ctx.footerData.getGitBranch() ?? undefined;
}

export function renderGitBranch(ctx: SegmentContext): string {
  if (!ctx.config.git.showBranch) return "";
  const value = branch(ctx);
  return value ? `${segmentIcon(ctx, "gitBranch", ctx.config.git?.icon) || "⎇ "}${ctx.theme.fg("accent", value)}` : "";
}

export function renderGitStatus(ctx: SegmentContext): string {
  if (!ctx.config.git.showStatus || !ctx.git) return "";
  const status = ctx.git;
  const counts = [
    [status.conflicted, "!"], [status.modified, "~"], [status.staged, "+"],
    [status.untracked, "?"], [status.renamed, "→"], [status.deleted, "-"],
    [status.stashed, "$"],
  ] as const;
  const text = counts.filter(([count]) => count > 0).map(([count, marker]) => `${marker}${count}`).join(" ");
  const tracking = status.ahead > 0 || status.behind > 0
    ? ` ${status.ahead > 0 ? `↑${status.ahead}` : ""}${status.behind > 0 ? `↓${status.behind}` : ""}`
    : "";
  const value = `${text}${tracking}`.trim();
  return value ? `${segmentIcon(ctx, "gitStatus", ctx.config.git?.icon)}${ctx.theme.fg("dim", value)}` : "";
}

let cachedCommit: { cwd: string; result: string | null; timestamp: number } | undefined;

function getGitCommit(cwd: string): string | null {
  const now = Date.now();
  if (cachedCommit?.cwd === cwd && now - cachedCommit.timestamp < 5000) return cachedCommit.result;
  try {
    const result = execSync("git log -1 --format='%h %s'", {
      cwd,
      timeout: 500,
      stdio: ["pipe", "pipe", "pipe"],
    }).toString().trim() || null;
    cachedCommit = { cwd, result, timestamp: now };
    return result;
  } catch {
    cachedCommit = { cwd, result: null, timestamp: now };
    return null;
  }
}

export function renderGitCommit(ctx: SegmentContext): string {
  if (!ctx.config.git.showCommit) return "";
  const value = ctx.git?.commit?.oid
    ? `${ctx.git.commit.oid.slice(0, 7)}${ctx.git.commit.tag ? ` ${ctx.git.commit.tag}` : ""}${ctx.git.commit.subject ? ` ${ctx.git.commit.subject}` : ""}`
    : getGitCommit(ctx.cwd);
  return value ? `${segmentIcon(ctx, "gitCommit", ctx.config.git?.icon)}${ctx.theme.fg("dim", value)}` : "";
}

/** Combined renderer retained for callers using the legacy `git` registry key. */
export function renderGit(ctx: SegmentContext): string {
  return [renderGitBranch(ctx), renderGitStatus(ctx), renderGitCommit(ctx)].filter(Boolean).join(" ");
}

export function renderRuntime(ctx: SegmentContext): string {
  const elapsed = Math.max(0, Math.floor((Date.now() - (ctx.startTime ?? Date.now())) / 1000));
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const time = hours > 0
    ? `${hours}h${minutes.toString().padStart(2, "0")}m`
    : minutes > 0
      ? `${minutes}m${(elapsed % 60).toString().padStart(2, "0")}s`
      : `${elapsed}s`;
  return `${segmentIcon(ctx, "runtime", ctx.config.runtime?.icon)}${ctx.theme.fg("dim", `uptime: ${time}`)}`;
}

export function renderContextBar(ctx: SegmentContext): string {
  return ctx.config.context.showBar ? ctx.theme.fg("dim", "─".repeat(Math.max(0, ctx.width))) : "";
}

export function renderSeparator(ctx: SegmentContext): string {
  return ctx.theme.fg("dim", "│");
}

export function renderStaleRuntime(ctx: SegmentContext): string {
  const minutes = Math.max(0, Math.floor((Date.now() - (ctx.startTime ?? Date.now())) / 60000));
  const value = minutes < 1 ? "<1m" : minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h${(minutes % 60).toString().padStart(2, "0")}m`;
  return ctx.theme.fg("dim", `stale: ${value}`);
}

export function renderModel(ctx: SegmentContext): string {
  return `${segmentIcon(ctx, "model", ctx.config.model?.icon)}${ctx.modelId ?? "no-model"}`;
}

export function renderThinking(ctx: SegmentContext): string {
  if (!ctx.thinkingLevel || ctx.thinkingLevel === "off") return "";
  return `${segmentIcon(ctx, "thinking", ctx.config.thinking?.icon)}${ctx.theme.fg("dim", `thinking: ${ctx.thinkingLevel}`)}`;
}

export function renderTokens(ctx: SegmentContext): string {
  if (!ctx.usage) return "";
  const parts: string[] = [];
  if (ctx.config.tokens.showInput && ctx.usage.input) parts.push(`${segmentIcon(ctx, "tokenInput", ctx.config.tokens.inputIcon)}↑${formatTokens(ctx.usage.input)}`);
  if (ctx.config.tokens.showOutput && ctx.usage.output) parts.push(`${segmentIcon(ctx, "tokenOutput", ctx.config.tokens.outputIcon)}↓${formatTokens(ctx.usage.output)}`);
  if (ctx.config.tokens.showCache && ctx.usage.cacheRead) parts.push(`${segmentIcon(ctx, "cacheHit", ctx.config.tokens.cacheIcon)}R${formatTokens(ctx.usage.cacheRead)}`);
  if (ctx.config.tokens.showCache && ctx.usage.cacheWrite) parts.push(`W${formatTokens(ctx.usage.cacheWrite)}`);
  return parts.join(" ");
}

export function renderCost(ctx: SegmentContext): string {
  return ctx.usage?.cost ? `${segmentIcon(ctx, "cost", ctx.config.cost?.icon)}$${ctx.usage.cost.toFixed(3)}` : "";
}

export function renderExtStatus(ctx: SegmentContext): string {
  const statuses = Array.from(ctx.footerData.getExtensionStatuses().values())
    .map((text) => sanitizeStatusText(text))
    .filter(Boolean);
  return statuses.length ? `${segmentIcon(ctx, "extensionStatus", ctx.config.extStatus?.icon)}${statuses.join(" ")}` : "";
}

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
  if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  return `${Math.round(count / 1_000_000)}M`;
}

function sanitizeStatusText(text: string): string {
  return text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

export type SegmentRenderer = (ctx: SegmentContext) => string;

export const SEGMENT_RENDERERS: Record<string, SegmentRenderer> = {
  cwd: renderCwd,
  timer: renderTimer,
  git: renderGit,
  gitBranch: renderGitBranch,
  gitStatus: renderGitStatus,
  gitCommit: renderGitCommit,
  runtime: renderRuntime,
  context_bar: renderContextBar,
  separator: renderSeparator,
  stale_runtime: renderStaleRuntime,
  model: renderModel,
  thinking: renderThinking,
  tokens: renderTokens,
  cost: renderCost,
  ext_status: renderExtStatus,
};
