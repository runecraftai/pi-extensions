/** Context-window smart/warm/dumb visualization used by the footer. */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const SMART_LIMIT = 40;
const WARM_LIMIT = 70;
const BAR_WIDTH = 20;
const BAR_DIVIDERS = new Set([8, 14]);

type ContextColor = "success" | "warning" | "error";
type ContextZone = { label: "smart" | "warm" | "dumb"; ceiling: number; color: ContextColor };

function zone(pct: number): ContextZone {
  if (pct < SMART_LIMIT) return { label: "smart", ceiling: SMART_LIMIT, color: "success" };
  if (pct <= WARM_LIMIT) return { label: "warm", ceiling: WARM_LIMIT, color: "warning" };
  return { label: "dumb", ceiling: 100, color: "error" };
}

function renderBar(theme: Theme, pct: number, color: ContextColor): string {
  const filledUnits = Math.round((pct / 100) * (BAR_WIDTH / 2));
  const chars = [..."██".repeat(filledUnits) + "░░".repeat(BAR_WIDTH / 2 - filledUnits)];
  return chars.map((char, index) => BAR_DIVIDERS.has(index)
    ? theme.fg("dim", "│")
    : theme.fg(color, char)).join("");
}

function renderUsageText(theme: Theme, pct: number, icon?: string): string {
  const clampedPct = Math.max(0, Math.min(100, pct));
  const context = zone(clampedPct);
  const remaining = Math.max(0, Math.round(context.ceiling - clampedPct));
  const resolvedIcon = icon ?? "🧠";
  const iconText = resolvedIcon ? `${theme.fg(context.color, resolvedIcon)} ` : "";
  return `${iconText}${renderBar(theme, clampedPct, context.color)} ${theme.fg(context.color, context.label)} ${theme.fg(context.color, `${remaining}% left`)}`;
}

export function contextBarMinimumWidth(
  theme: Theme,
  pct: number,
  _tokens: number,
  _contextWindow: number,
  icon?: string,
): number {
  return visibleWidth(renderUsageText(theme, pct, icon));
}

export function renderUsageContextBar(
  theme: Theme,
  pct: number,
  _tokens: number,
  contextWindow: number,
  width: number,
  icon?: string,
): string {
  if (contextWindow <= 0 || width <= 0) return "";
  return truncateToWidth(renderUsageText(theme, pct, icon), width, "…");
}

export function renderContextBar(
  theme: Theme,
  pct: number,
  tokens: number,
  contextWindow: number,
  width: number,
  icon?: string,
): string {
  return renderUsageContextBar(theme, pct, tokens, contextWindow, width, icon);
}

export function renderContextCompact(theme: Theme, pct: number, icon?: string): string {
  const clampedPct = Math.max(0, Math.min(100, pct));
  const context = zone(clampedPct);
  const resolvedIcon = icon ?? "🧠";
  const iconText = resolvedIcon ? `${theme.fg(context.color, resolvedIcon)} ` : "";
  return `${iconText}${theme.fg(context.color, `${clampedPct.toFixed(1)}%`)}`;
}
