/**
 * Command tips panel — right column of the two-column header.
 *
 * Shows a random selection of available slash commands as tips.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

/** Built-in pi commands that are always available as tip candidates. */
const BUILTIN_COMMANDS = [
  "pi-tui",
  "settings", "model", "session", "compact", "resume", "reload",
  "new", "fork", "tree", "quit", "login", "export", "import",
];

/**
 * Pick random slash command tips from available commands.
 * @param availableNames - all registered command names
 * @param count - number of tips to show (including fixed tips)
 */
export function pickTips(
  availableNames: readonly string[],
  count: number,
): string[] {
  const pool = [...new Set([...BUILTIN_COMMANDS, ...availableNames])]
    .filter((n) => n.trim().length > 0);

  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }

  const selected = pool.slice(0, Math.max(0, count)).map((n) => (n.startsWith("/") ? n : `/${n}`));
  // Always include /pi-tui as first item
  if (!selected.includes("/pi-tui") && count > 0) {
    selected.unshift("/pi-tui");
    if (selected.length > count) selected.pop();
  }
  return selected;
}

/**
 * Render the tips panel lines.
 * @param tips - array of tip strings like "/model", "/session", etc.
 * @param maxWidth - maximum width for each line
 * @param paint - theme paint function for accent color
 * @param muted - theme paint function for muted text
 * @param bold - theme paint function for bold text
 */
export function renderTipsPanel(
  tips: readonly string[],
  maxWidth: number,
  paint: (s: string) => string,
  muted: (s: string) => string,
  bold: (s: string) => string,
): string[] {
  if (maxWidth <= 0) return [];

  const divider = paint("─".repeat(Math.max(8, Math.min(maxWidth, 22))));

  const lines: string[] = [
    "",
    paint(bold("Commands")),
  ];

  for (const tip of tips) {
    lines.push(muted(truncateToWidth(tip, maxWidth)));
  }

  lines.push("");
  return lines;
}
