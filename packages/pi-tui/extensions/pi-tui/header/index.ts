/**
 * Header installer — wires up the animated logo, info bar, and tips panel.
 *
 * Modeled after pi-open-tui's installHeader pattern.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { HeaderConfig } from "../config.ts";
import {
  LAST_FRAME_INDEX,
  precomputeFrames,
} from "./logo.ts";
import { collectStats, renderInfoBar } from "./info-bar.ts";
import { pickTips, renderTipsPanel } from "./tips-panel.ts";

/* ── Layout helpers ── */

function padRight(text: string, width: number): string {
  const clipped = truncateToWidth(text, width, "");
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function center(text: string, width: number): string {
  if (width <= 0) return "";
  const w = visibleWidth(text);
  if (w >= width) return truncateToWidth(text, width, "...");
  return `${" ".repeat(Math.floor((width - w) / 2))}${text}`;
}

const MIN_LEFT_WIDTH = 28;
const MIN_TIPS_WIDTH = 16;
const MAX_TIPS_WIDTH = 28;
const COLUMN_GAP = 3;

function headerColumnWidths(
  innerWidth: number,
): { leftWidth: number; rightWidth: number; useTips: boolean } {
  if (innerWidth <= 0) return { leftWidth: 0, rightWidth: 0, useTips: false };

  const gap = COLUMN_GAP;
  if (innerWidth < MIN_LEFT_WIDTH + gap + MIN_TIPS_WIDTH) {
    return { leftWidth: innerWidth, rightWidth: 0, useTips: false };
  }

  let rightWidth = Math.min(
    MAX_TIPS_WIDTH,
    Math.max(MIN_TIPS_WIDTH, Math.round(innerWidth * 0.28)),
  );
  let leftWidth = innerWidth - gap - rightWidth;

  if (leftWidth < MIN_LEFT_WIDTH) {
    leftWidth = MIN_LEFT_WIDTH;
    rightWidth = innerWidth - gap - leftWidth;
  }

  if (leftWidth <= rightWidth) {
    leftWidth = Math.ceil((innerWidth - gap) * 0.65);
    rightWidth = innerWidth - gap - leftWidth;
  }

  return { leftWidth, rightWidth, useTips: rightWidth >= MIN_TIPS_WIDTH };
}

function borderLine(
  left: string,
  label: string,
  right: string,
  width: number,
  paint: (s: string) => string,
): string {
  if (width <= 1) return "";
  if (width < 8 || label.length === 0) {
    return paint(truncateToWidth(left + "─".repeat(Math.max(0, width - 2)) + right, width, ""));
  }

  const before = "─── ";
  const after = " ─────";
  const fixedWidth = visibleWidth(before) + visibleWidth(label) + visibleWidth(after);
  const fill = Math.max(0, width - 2 - fixedWidth);
  return `${paint(left)}${paint(before)}${label}${paint(after)}${paint("─".repeat(fill))}${paint(right)}`;
}

function boxedLine(
  content: string,
  width: number,
  paint: (s: string) => string,
): string {
  if (width <= 2) return truncateToWidth(content, width, "");
  return `${paint("│")}${padRight(content, width - 2)}${paint("│")}`;
}

function twoColumn(
  left: string,
  right: string,
  leftWidth: number,
  rightWidth: number,
  paint: (s: string) => string,
): string {
  return `${padRight(left, leftWidth)} ${paint("│")} ${padRight(right, rightWidth, "…")}`;
}

/* ── Header component ── */

class PiTuiHeader implements Component {
  private frame: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly precomputedFrames: string[][];
  private readonly stats;
  private readonly tipCommands: string[];

  constructor(
    private readonly pi: ExtensionAPI,
    private readonly ctx: ExtensionContext,
    private readonly tui: TUI,
    private readonly config: HeaderConfig,
    skipAnimation: boolean = false,
  ) {
    this.stats = collectStats(ctx);

    const pool = [...(this.pi.getCommands().map((c) => c.name))];
    this.tipCommands = pickTips(pool, config.tipCount);

    this.precomputedFrames = precomputeFrames(
      config.logoColor,
      config.minecraftGradient,
      config.ibmStripes,
    );

    if (skipAnimation || !config.animateLogo) {
      this.frame = LAST_FRAME_INDEX;
    } else {
      this.frame = 0;
      this.startAnimation();
    }
  }

  private startAnimation(): void {
    const tick = () => {
      if (this.frame < LAST_FRAME_INDEX) {
        this.frame++;
        this.tui.requestRender();
        this.timer = setTimeout(tick, this.config.logoSpeed);
        this.timer.unref?.();
      } else {
        this.timer = null;
        this.tui.requestRender();
      }
    };
    this.timer = setTimeout(tick, this.config.logoSpeed);
    this.timer.unref?.();
  }

  render(width: number): string[] {
    const theme = this.ctx.ui.theme;
    const paint = (s: string) => theme.fg("accent", s);
    const muted = (s: string) => theme.fg("muted", s);
    const dim = (s: string) => theme.fg("dim", s);
    const bold = (s: string) => theme.bold(s);

    if (width < 24) return [paint("Pi")];

    const innerWidth = width - 2;
    const { leftWidth, rightWidth, useTips } = headerColumnWidths(innerWidth);

    // Left column: logo + info
    const logoLines = this.precomputedFrames[this.frame] ?? [];
    const leftLines: string[] = [
      ...logoLines.map((line) => center(line, leftWidth)),
    ];

    // Info bar below logo
    const infoLines = this.config.showStatsBar || this.config.showModel || this.config.showVersion
      ? renderInfoBar(this.config, this.stats, this.pi, this.ctx, theme, leftWidth)
      : [];
    for (const line of infoLines) {
      leftLines.push(center(line, leftWidth));
    }

    // Right column: tips
    const tipLines = this.config.showTips
      ? renderTipsPanel(
          this.tipCommands,
          rightWidth,
          paint,
          muted,
          bold,
        )
      : [];

    // Assemble bordered output
    const lines: string[] = [];
    lines.push(borderLine("╭", `${paint("Pi")} ${dim("tui")}`, "╮", width, paint));

    const maxLines = Math.max(leftLines.length, tipLines.length);
    for (let i = 0; i < maxLines; i++) {
      const left = leftLines[i] ?? "";
      const right = tipLines[i] ?? "";
      const content = useTips
        ? twoColumn(left, right, leftWidth, rightWidth, paint)
        : padRight(left, leftWidth);
      lines.push(boxedLine(content, width, paint));
    }

    lines.push(borderLine("╰", "", "╯", width, paint));
    return lines.map((l) => truncateToWidth(l, width, ""));
  }

  invalidate(): void {}

  dispose(): void {
    if (this.timer != null) clearTimeout(this.timer);
  }
}

/* ── Installer ── */

export function installHeader(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  config: HeaderConfig,
  skipAnimation: boolean = false,
): () => void {
  let header: PiTuiHeader | undefined;

  ctx.ui.setHeader((tui) => {
    header?.dispose();
    header = new PiTuiHeader(pi, ctx, tui, config, skipAnimation);
    return header;
  });

  return () => {
    header?.dispose();
    header = undefined;
    ctx.ui.setHeader(undefined);
  };
}
