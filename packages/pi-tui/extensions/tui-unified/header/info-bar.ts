/**
 * Startup info bar — version, model, stats, slogan.
 *
 * Rendered to the right of the logo in two-column mode,
 * or below the logo in single-column mode.
 */

import { VERSION } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { HeaderConfig } from "../config.ts";

/* ── Stats collection ── */

export interface HeaderStats {
  extensions: number;
  skills: number;
  prompts: number;
  agents: string;
}

/** Collect session statistics from the environment. */
export function collectStats(_ctx: ExtensionContext): HeaderStats {
  // These are computed synchronously from the filesystem at session start.
  // We use a simplified version here; the full implementation can be expanded
  // to match pi-cc-header's computeStats for package counting.
  return {
    extensions: 0,
    skills: 0,
    prompts: 0,
    agents: "",
  };
}

/* ── Info bar rendering ── */

export function renderInfoBar(
  config: HeaderConfig,
  stats: HeaderStats,
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  theme: Theme,
  maxWidth: number,
): string[] {
  const muted = (s: string) => theme.fg("muted", s);
  const dim = (s: string) => theme.fg("dim", s);
  const bold = (s: string) => theme.bold(s);

  const model = ctx.model?.id ?? "Default";
  const effort = pi.getThinkingLevel();
  const effortLabel = effort === "off" ? "thinking off" : `${effort} effort`;

  const lines: string[] = [];

  // Line 1: Pi version
  if (config.showVersion) {
    const piText = config.logoColor
      ? `\x1b[${getCmapAnsi(config.logoColor)}mPi\x1b[39m ${muted(`v${VERSION}`)}`
      : muted(`Pi v${VERSION}`);
    lines.push(truncateToWidth(piText, maxWidth));
  }

  // Line 2: Slogan
  if (config.showSlogan && config.slogan) {
    const sloganText = config.sloganColor
      ? `\x1b[1m\x1b[${getCmapAnsi(config.logoColor)}m${config.slogan}\x1b[39m\x1b[22m`
      : muted(`\x1b[1m${config.slogan}\x1b[22m`);
    lines.push(truncateToWidth(sloganText, maxWidth));
  }

  // Line 3: Model and effort
  if (config.showModel) {
    const modelLine = `${model} · ${effortLabel}${stats.agents ? `  |  ${stats.agents}` : ""}`;
    lines.push(truncateToWidth(muted(modelLine), maxWidth));
  }

  // Line 4: Stats bar
  if (config.showStatsBar) {
    const parts: string[] = [];
    if (stats.skills > 0) parts.push(`${stats.skills} skills`);
    if (stats.prompts > 0) parts.push(`${stats.prompts} prompts`);
    if (stats.extensions > 0) parts.push(`${stats.extensions} extensions`);
    if (parts.length > 0) {
      lines.push(truncateToWidth(muted(parts.join(" · ")), maxWidth));
    }
  }

  // Line 5: Cwd
  if (config.showCwd) {
    lines.push(truncateToWidth(dim(formatCwd(ctx.cwd)), maxWidth));
  }

  return lines;
}

/* ── Helpers ── */

function getCmapAnsi(colorKey: string): string {
  const CMAP: Record<string, string> = {
    a: "38;2;217;119;87",
    r: "31",
    o: "38;5;208",
    y: "38;5;226",
    g: "38;2;20;180;20",
    w: "38;5;15",
    b: "38;2;40;130;220",
    p: "38;5;129",
    c: "38;2;251;73;52",
  };
  return CMAP[colorKey] ?? "34";
}

function formatCwd(cwd: string): string {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return cwd;
  if (cwd.startsWith(home)) return `~${cwd.slice(home.length)}`;
  return cwd;
}
