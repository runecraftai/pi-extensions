/**
 * Diff rendering component — OpenCode-style split/unified view.
 *
 * Numbered lines, green additions, red deletions.
 * Syntax highlighting via shiki per file when viable.
 * NEVER produces edit/apply actions — view only.
 */

import { Box, Text, type Component } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { highlight, extensionToLanguage } from "./shiki.ts";
import {
  parseDiff,
  diffFileDisplayName,
  type DiffFile,
  type DiffLine,
  type DiffHunk,
  type DiffParseResult,
} from "./diff.ts";

/* ── Types ── */

export type DiffViewMode = "split" | "unified" | "auto";

export interface DiffViewConfig {
  /** Default view mode. "auto" picks split for wide terminals. */
  mode: DiffViewMode;
  /** Minimum terminal width for split mode when mode is "auto" */
  minSplitWidth: number;
  /** Whether to apply syntax highlighting */
  highlight: boolean;
  /** Whether to show line numbers */
  showLineNumbers: boolean;
  /** Shiki theme name */
  theme: string;
}

export const DEFAULT_DIFF_VIEW_CONFIG: DiffViewConfig = {
  mode: "auto",
  minSplitWidth: 140,
  highlight: true,
  showLineNumbers: true,
  theme: "github-dark",
};

/* ── Theme colors ── */

interface DiffColors {
  additionBg: string;
  additionFg: string;
  deletionBg: string;
  deletionFg: string;
  lineNumber: string;
  header: string;
  hunkHeader: string;
  context: string;
}

function resolveDiffColors(theme: Theme): DiffColors {
  // Use theme colors when available, fall back to ANSI defaults
  const tryFg = (fn: (s: string) => string, fallback: string) => {
    try { return fn(""); } catch { return fallback; }
  };
  return {
    additionBg: tryFg((s) => theme.bg("green", s), ""),
    additionFg: tryFg((s) => theme.fg("green", s), "\x1b[32m"),
    deletionBg: tryFg((s) => theme.bg("red", s), ""),
    deletionFg: tryFg((s) => theme.fg("red", s), "\x1b[31m"),
    lineNumber: tryFg((s) => theme.fg("dim", s), "\x1b[90m"),
    header: tryFg((s) => theme.fg("accent", s), "\x1b[36m"),
    hunkHeader: tryFg((s) => theme.fg("dim", s), "\x1b[90m"),
    context: "",
  };
}

/* ── Line formatting ── */

const LINE_NUM_WIDTH = 5;
const DIFF_MARKER_WIDTH = 1; // The +, -, or space prefix

function formatLineNumber(n: number | undefined, width: number): string {
  if (n === undefined) return " ".repeat(width);
  const s = String(n);
  return s.padStart(width);
}

function formatLineMarker(kind: DiffLine["kind"]): string {
  switch (kind) {
    case "addition": return "+";
    case "deletion": return "-";
    case "context": return " ";
    default: return " ";
  }
}

/* ── Unified view ── */

function renderUnifiedHunk(
  hunk: DiffHunk,
  colors: DiffColors,
  showLineNumbers: boolean,
  maxWidth: number,
): string[] {
  const lines: string[] = [];

  // Hunk header
  const hunkColor = colors.hunkHeader;
  lines.push(
    hunkColor ? `${hunkColor}${hunk.header}\x1b[0m` : hunk.header,
  );

  for (const line of hunk.lines) {
    const marker = formatLineMarker(line.kind);
    const oldNum = formatLineNumber(line.oldLine, LINE_NUM_WIDTH);
    const newNum = formatLineNumber(line.newLine, LINE_NUM_WIDTH);
    const lineNums = showLineNumbers
      ? `${colors.lineNumber}${oldNum} ${newNum}\x1b[0m `
      : "";
    const prefix = showLineNumbers ? " " : "";

    let styledText: string;
    switch (line.kind) {
      case "addition":
        styledText = colors.additionFg
          ? `${colors.additionFg}${prefix}${marker}${line.text}\x1b[0m`
          : `${prefix}${marker}${line.text}`;
        break;
      case "deletion":
        styledText = colors.deletionFg
          ? `${colors.deletionFg}${prefix}${marker}${line.text}\x1b[0m`
          : `${prefix}${marker}${line.text}`;
        break;
      default:
        styledText = `${prefix}${marker}${line.text}`;
    }

    lines.push(lineNums + styledText);
  }

  return lines;
}

/* ── Split view ── */

function renderSplitHunk(
  hunk: DiffHunk,
  colors: DiffColors,
  showLineNumbers: boolean,
  maxWidth: number,
): string[] {
  const halfWidth = Math.floor((maxWidth - 1) / 2); // -1 for gutter
  const gutter = "│";

  const lines: string[] = [];

  // Hunk header spans full width
  lines.push(colors.hunkHeader ? `${colors.hunkHeader}${hunk.header}\x1b[0m` : hunk.header);

  // Separate additions and deletions for side-by-side
  let oldLine = hunk.oldStart;
  let newLine = hunk.newStart;

  for (const line of hunk.lines) {
    let leftContent = "";
    let rightContent = "";

    const marker = formatLineMarker(line.kind);

    if (line.kind === "deletion") {
      const num = showLineNumbers ? `${colors.lineNumber}${formatLineNumber(line.oldLine, LINE_NUM_WIDTH)}\x1b[0m ` : "";
      leftContent = `${num}${marker}${line.text}`;
      oldLine++;
    } else if (line.kind === "addition") {
      const num = showLineNumbers ? `${colors.lineNumber}${formatLineNumber(line.newLine, LINE_NUM_WIDTH)}\x1b[0m ` : "";
      rightContent = `${num}${marker}${line.text}`;
      newLine++;
    } else {
      // Context line — show on both sides
      const oldNum = showLineNumbers ? `${colors.lineNumber}${formatLineNumber(line.oldLine, LINE_NUM_WIDTH)}\x1b[0m ` : "";
      const newNum = showLineNumbers ? `${colors.lineNumber}${formatLineNumber(line.newLine, LINE_NUM_WIDTH)}\x1b[0m ` : "";
      leftContent = `${oldNum} ${line.text}`;
      rightContent = `${newNum} ${line.text}`;
      oldLine++;
      newLine++;
    }

    const left = truncateToWidth(leftContent, halfWidth);
    const right = truncateToWidth(rightContent, halfWidth);

    lines.push(`${left}${gutter}${right}`);
  }

  return lines;
}

/* ── File rendering ── */

async function renderFile(
  file: DiffFile,
  config: DiffViewConfig,
  theme: Theme,
  signal?: AbortSignal,
): Promise<string[]> {
  const colors = resolveDiffColors(theme);
  const displayName = diffFileDisplayName(file);
  const lines: string[] = [];

  // File header
  lines.push(
    colors.header ? `${colors.header}── ${displayName} ──\x1b[0m` : `── ${displayName} ──`,
  );

  if (file.isBinary) {
    lines.push("  Binary file not shown");
    return lines;
  }

  if (file.hunks.length === 0) {
    lines.push("  (no changes)");
    return lines;
  }

  // Determine if we should use syntax highlighting
  const ext = displayName.includes(".")
    ? "." + displayName.split(".").pop()
    : "";
  const lang = config.highlight ? extensionToLanguage(ext) : undefined;

  const maxWidth = config.minSplitWidth;
  // For auto mode, we use the config's minSplitWidth as the threshold
  // since renderDiff is called without terminal width context.
  // The Component wrapper (createDiffComponent) handles width-based switching.
  const useSplit = config.mode === "split";

  for (const hunk of file.hunks) {
    let hunkLines: string[];

    if (useSplit) {
      hunkLines = renderSplitHunk(hunk, colors, config.showLineNumbers, maxWidth);
    } else {
      hunkLines = renderUnifiedHunk(hunk, colors, config.showLineNumbers, maxWidth);
    }

    lines.push(...hunkLines);
  }

  return lines;
}

/* ── Public API ── */

/**
 * Parse diff text and render it as a series of colored, numbered lines.
 *
 * @param diffText - Raw unified diff text
 * @param config - View configuration
 * @param theme - Pi TUI theme for colors
 * @param signal - Optional abort signal
 * @returns Array of rendered strings, one per line
 */
export async function renderDiff(
  diffText: string,
  config: DiffViewConfig = DEFAULT_DIFF_VIEW_CONFIG,
  theme: Theme,
  signal?: AbortSignal,
  terminalWidth?: number,
): Promise<string[]> {
  const result = parseDiff(diffText);

  if (result.files.length === 0) {
    return ["(no diff content)"];
  }

  // Override mode based on terminal width if provided
  const effectiveConfig = terminalWidth !== undefined && config.mode === "auto"
    ? { ...config, mode: terminalWidth >= config.minSplitWidth ? "split" as const : "unified" as const }
    : config;

  const allLines: string[] = [];

  for (const file of result.files) {
    if (signal?.aborted) break;
    const fileLines = await renderFile(file, effectiveConfig, theme, signal);
    allLines.push(...fileLines);
    allLines.push(""); // Blank line between files
  }

  // Remove trailing blank line
  if (allLines.length > 0 && allLines[allLines.length - 1] === "") {
    allLines.pop();
  }

  return allLines;
}

/**
 * Create a diff view Component that renders within the Pi TUI component system.
 *
 * @param diffText - Raw unified diff text
 * @param config - View configuration
 * @param theme - Pi TUI theme
 * @returns Component that renders the diff
 */
export function createDiffComponent(
  diffText: string,
  config: DiffViewConfig = DEFAULT_DIFF_VIEW_CONFIG,
  theme: Theme,
): Component {
  const box = new Box(1, 0, (s: string) => theme.bg("customMessageBg", s));
  let rendered = false;

  // Pre-render synchronously (without syntax highlighting for now)
  const result = parseDiff(diffText);
  const colors = resolveDiffColors(theme);

  for (const file of result.files) {
    const displayName = diffFileDisplayName(file);
    box.addChild(
      new Text(
        colors.header ? `${colors.header}── ${displayName} ──\x1b[0m` : `── ${displayName} ──`,
        1,
        0,
      ),
    );

    if (file.isBinary) {
      box.addChild(new Text("  Binary file not shown", 1, 0));
      continue;
    }

    if (file.hunks.length === 0) {
      box.addChild(new Text("  (no changes)", 1, 0));
      continue;
    }

    const useSplit = config.mode === "split";

    for (const hunk of file.hunks) {
      let hunkLines: string[];
      if (useSplit) {
        hunkLines = renderSplitHunk(hunk, colors, config.showLineNumbers, config.minSplitWidth);
      } else {
        hunkLines = renderUnifiedHunk(hunk, colors, config.showLineNumbers, config.minSplitWidth);
      }
      box.addChild(new Text(hunkLines.join("\n"), 0, 0));
    }
  }

  return {
    render: (width: number) => box.render(width),
    invalidate: () => box.invalidate(),
  };
}

/**
 * Determine the effective view mode based on terminal width.
 */
export function effectiveViewMode(
  terminalWidth: number,
  config: DiffViewConfig = DEFAULT_DIFF_VIEW_CONFIG,
): "split" | "unified" {
  if (config.mode === "split") return "split";
  if (config.mode === "unified") return "unified";
  // auto mode
  return terminalWidth >= config.minSplitWidth ? "split" : "unified";
}

/**
 * Toggle between split and unified view modes.
 */
export function toggleViewMode(current: DiffViewMode): DiffViewMode {
  if (current === "split") return "unified";
  if (current === "unified") return "split";
  return current; // auto stays auto
}
