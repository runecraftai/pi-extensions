/**
 * Context zone visualization bar — smart / warm / dumb zones.
 *
 * Inspired by pi-context-zone (v0.1.1) and pi-open-tui's context bar.
 * Renders a bar with zone dividers at 40% and 70% thresholds.
 *
 * Two modes:
 *   - Full bar:   🧠 ████░░░░│░░░░░│░░░░░ 36%
 *   - Compact:    🧠 36%
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { stressColor } from "./segments.ts";

/** Zone thresholds as percentages of context window. */
const WARN = 40;
const DANGER = 70;

const DEFAULT_BAR_LEN = 16;

interface ZoneInfo {
  icon: string;
  label: string;
  ceiling: number;
}

function zone(pct: number): ZoneInfo {
  if (pct < WARN) return { icon: "\u{1F9E0}", label: "smart", ceiling: WARN };
  if (pct < DANGER) return { icon: "\u26A0\uFE0F", label: "warm", ceiling: DANGER };
  return { icon: "\u{1F9DF}", label: "dumb", ceiling: 100 };
}

/**
 * Render the context bar with zone dividers.
 * Returns a styled string using theme colors.
 */
export function renderContextBar(
  theme: Theme,
  pct: number,
  tokens: number,
  contextWindow: number,
  barWidth: number = DEFAULT_BAR_LEN,
): string {
  if (contextWindow <= 0) return "";

  const filled = Math.max(0, Math.min(barWidth, Math.round((pct / 100) * barWidth)));
  const empty = barWidth - filled;
  const color = stressColor(pct);
  const z = zone(pct);

  // Zone boundary positions in the bar
  const warnPos = Math.round((WARN / 100) * barWidth);
  const dangerPos = Math.round((DANGER / 100) * barWidth);

  // Build bar with zone dividers
  let bar = "";
  for (let i = 0; i < barWidth; i++) {
    if (i === warnPos || i === dangerPos) {
      bar += theme.fg("dim", "\u2502"); // │
      continue;
    }
    if (i < filled) {
      bar += theme.fg(color, "\u2588"); // █
    } else {
      bar += theme.fg("dim", "\u2591"); // ░
    }
  }

  const pctText = theme.fg(stressColor(pct), `${pct.toFixed(1)}%`);
  const leftPct = Math.max(0, z.ceiling - pct);
  const leftText = theme.fg("dim", `${leftPct.toFixed(0)}% left`);

  return `${z.icon} ${bar} ${pctText} ${theme.fg("dim", "\u00B7")} ${leftText}`;
}

/**
 * Compact context form: icon + percentage, no bar or token counts.
 */
export function renderContextCompact(
  theme: Theme,
  pct: number,
): string {
  const color = stressColor(pct);
  const z = zone(pct);
  return `${theme.fg(color, z.icon)} ${theme.fg(color, `${pct.toFixed(1)}%`)}`;
}
