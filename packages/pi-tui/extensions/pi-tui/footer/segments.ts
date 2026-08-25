/**
 * pi-tui footer segment renderers.
 *
 * Each renderer is a pure function that returns a string (or empty string for no-output).
 * Graceful fallback: no errors when git/context/time info is unavailable.
 */

import { execSync } from "node:child_process";
import type { ReadonlyFooterDataProvider } from "@earendil-works/pi-coding-agent";
import type { Theme } from "@earendil-works/pi-tui";

/* ── Segment context ── */

export interface SegmentContext {
  theme: Theme;
  cwd: string;
  width: number;
  footerData: ReadonlyFooterDataProvider;
  config: {
    git: { showBranch: boolean; showStatus: boolean; showCommit: boolean };
    context: { showBar: boolean; showCompact: boolean };
    tokens: { showInput: boolean; showOutput: boolean; showCache: boolean };
    telemetry: { enabled: boolean; tps: boolean; ttft: boolean; stalls: boolean };
  };
  // Session data
  modelId?: string;
  contextPercent?: number | null;
  contextWindow?: number;
  usage?: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number };
  thinkingLevel?: string;
  startTime?: number; // Process start time in ms
}

/* ── Segment renderers ── */

/**
 * cwd: Current working directory with git branch.
 */
export function renderCwd(ctx: SegmentContext): string {
  const cwd = ctx.cwd || ".";
  const branch = ctx.footerData.getGitBranch();
  if (branch) {
    return `${ctx.theme.fg("dim", cwd)} (${ctx.theme.fg("accent", branch)})`;
  }
  return ctx.theme.fg("dim", cwd);
}

/**
 * timer: Session elapsed time since process start.
 */
export function renderTimer(ctx: SegmentContext): string {
  const startTime = ctx.startTime ?? Date.now();
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;

  let timeStr: string;
  if (hours > 0) {
    timeStr = `${hours}h${minutes.toString().padStart(2, "0")}m`;
  } else if (minutes > 0) {
    timeStr = `${minutes}m${seconds.toString().padStart(2, "0")}s`;
  } else {
    timeStr = `${seconds}s`;
  }

  return ctx.theme.fg("dim", `⏱ ${timeStr}`);
}

/**
 * git: Git status info (branch, status, commit).
 */
export function renderGit(ctx: SegmentContext): string {
  const parts: string[] = [];

  const branch = ctx.footerData.getGitBranch();
  if (branch) {
    parts.push(ctx.theme.fg("accent", `⎇ ${branch}`));
  }

  if (ctx.config.git.showCommit) {
    const commit = getGitCommit(ctx.cwd);
    if (commit) {
      parts.push(ctx.theme.fg("dim", commit));
    }
  }

  return parts.join(" ");
}

let cachedCommit: { cwd: string; result: string | null; timestamp: number } | null = null;
const COMMIT_CACHE_TTL = 5000;

/**
 * Get git commit info (short hash + subject).
 * Caches per cwd for 5 seconds to avoid blocking the render path.
 */
function getGitCommit(cwd: string): string | null {
  const now = Date.now();
  if (cachedCommit && cachedCommit.cwd === cwd && now - cachedCommit.timestamp < COMMIT_CACHE_TTL) {
    return cachedCommit.result;
  }
  try {
    const result = execSync("git log -1 --format='%h %s'", {
      cwd,
      timeout: 500,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const commit = result.toString().trim();
    cachedCommit = { cwd, result: commit, timestamp: now };
    return commit;
  } catch {
    cachedCommit = { cwd, result: null, timestamp: now };
    return null;
  }
}

/**
 * runtime: Process uptime/session duration.
 */
export function renderRuntime(ctx: SegmentContext): string {
  const startTime = ctx.startTime ?? Date.now();
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;

  let timeStr: string;
  if (hours > 0) {
    timeStr = `${hours}h${minutes.toString().padStart(2, "0")}m`;
  } else if (minutes > 0) {
    timeStr = `${minutes}m${seconds.toString().padStart(2, "0")}s`;
  } else {
    timeStr = `${seconds}s`;
  }

  return ctx.theme.fg("dim", `uptime: ${timeStr}`);
}

/**
 * context_bar: Thin separator line when showBar is enabled.
 */
export function renderContextBar(ctx: SegmentContext): string {
  if (!ctx.config.context.showBar) {
    return "";
  }
  return ctx.theme.fg("dim", "─".repeat(ctx.width));
}

/**
 * separator: Visual separator character.
 */
export function renderSeparator(_ctx: SegmentContext): string {
  return "│";
}

/**
 * stale_runtime: Show stale data age (time since last significant change).
 * Since we don't track "significant changes", we show session uptime as a proxy.
 */
export function renderStaleRuntime(ctx: SegmentContext): string {
  const startTime = ctx.startTime ?? Date.now();
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);

  if (minutes < 1) {
    return ctx.theme.fg("dim", "stale: <1m");
  }

  if (minutes < 60) {
    return ctx.theme.fg("dim", `stale: ${minutes}m`);
  }

  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return ctx.theme.fg("dim", `stale: ${hours}h${remainMinutes.toString().padStart(2, "0")}m`);
}

/**
 * model: Current model name.
 */
export function renderModel(ctx: SegmentContext): string {
  return ctx.modelId ?? "no-model";
}

/**
 * thinking: Thinking/reasoning level.
 */
export function renderThinking(ctx: SegmentContext): string {
  if (!ctx.thinkingLevel || ctx.thinkingLevel === "off") {
    return "";
  }
  return ctx.theme.fg("dim", `thinking: ${ctx.thinkingLevel}`);
}

/**
 * tokens: Token usage stats.
 */
export function renderTokens(ctx: SegmentContext): string {
  if (!ctx.usage) return "";

  const parts: string[] = [];

  if (ctx.config.tokens.showInput && ctx.usage.input) {
    parts.push(`↑${formatTokens(ctx.usage.input)}`);
  }

  if (ctx.config.tokens.showOutput && ctx.usage.output) {
    parts.push(`↓${formatTokens(ctx.usage.output)}`);
  }

  if (ctx.config.tokens.showCache) {
    if (ctx.usage.cacheRead) {
      parts.push(`R${formatTokens(ctx.usage.cacheRead)}`);
    }
    if (ctx.usage.cacheWrite) {
      parts.push(`W${formatTokens(ctx.usage.cacheWrite)}`);
    }
  }

  return parts.join(" ");
}

/**
 * cost: Token cost.
 */
export function renderCost(ctx: SegmentContext): string {
  if (!ctx.usage?.cost) return "";
  return `$${ctx.usage.cost.toFixed(3)}`;
}

/**
 * ext_status: Extension statuses.
 */
export function renderExtStatus(ctx: SegmentContext): string {
  const statuses = ctx.footerData.getExtensionStatuses();
  if (statuses.size === 0) return "";

  return Array.from(statuses.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, text]) => sanitizeStatusText(text))
    .join(" ");
}

/* ── Helpers ── */

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

function sanitizeStatusText(text: string): string {
  return text
    .replace(/[\r\n\t]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

/* ── Segment registry ── */

export type SegmentRenderer = (ctx: SegmentContext) => string;

export const SEGMENT_RENDERERS: Record<string, SegmentRenderer> = {
  cwd: renderCwd,
  timer: renderTimer,
  git: renderGit,
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
