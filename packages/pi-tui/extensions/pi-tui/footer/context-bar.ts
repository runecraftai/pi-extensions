/** Context-window smart/warm/dumb visualization used by the footer. */

import type { Theme } from "@earendil-works/pi-coding-agent";

const WARN = 40;
const DANGER = 70;

type ContextColor = "accent" | "warning" | "error";

function zone(pct: number): { icon: string; ceiling: number; color: ContextColor } {
  if (pct < WARN) return { icon: "\u{1F9E0}", ceiling: WARN, color: "accent" };
  if (pct < DANGER) return { icon: "⚠️", ceiling: DANGER, color: "warning" };
  return { icon: "\u{1F9DF}", ceiling: 100, color: "error" };
}

function formatTokens(value: number): string {
  if (value < 1000) return `${value}`;
  if (value < 1_000_000) return `${Math.round(value / 1000)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

export function renderContextBar(
  theme: Theme,
  pct: number,
  tokens: number,
  contextWindow: number,
  width: number,
  icon = "📊",
): string {
  if (contextWindow <= 0 || width <= 0) return "";

  const clampedPct = Math.max(0, Math.min(100, pct));
  const context = zone(clampedPct);
  const pctText = theme.fg(context.color, `${clampedPct.toFixed(1)}%`);
  const tokenText = `${formatTokens(tokens)}/${formatTokens(contextWindow)}`;
  const fixed = icon.length + pctText.replace(/\x1b\[[0-9;]*m/g, "").length + tokenText.length + 8;
  const barWidth = Math.max(1, width - fixed);
  const filled = Math.round((clampedPct / 100) * barWidth);
  const warnPos = Math.round((WARN / 100) * barWidth);
  const dangerPos = Math.round((DANGER / 100) * barWidth);
  let bar = "";
  for (let i = 0; i < barWidth; i++) {
    if (i === warnPos || i === dangerPos) bar += theme.fg("dim", "│");
    else if (i < filled) bar += theme.fg(context.color, "█");
    else bar += theme.fg("dim", "░");
  }

  const left = Math.max(0, context.ceiling - clampedPct);
  const iconText = icon ? `${theme.fg(context.color, icon)} ` : "";
  return `${iconText}${bar} ${pctText} ${theme.fg("dim", "·")} ${theme.fg("dim", `${left.toFixed(0)}% left`)} ${theme.fg("dim", tokenText)}`;
}

export function renderContextCompact(theme: Theme, pct: number, icon = "📊"): string {
  const clampedPct = Math.max(0, Math.min(100, pct));
  const context = zone(clampedPct);
  const iconText = icon ? `${theme.fg(context.color, icon)} ` : "";
  return `${iconText}${theme.fg(context.color, `${clampedPct.toFixed(1)}%`)}`;
}
