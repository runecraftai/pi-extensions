/**
 * pi-tui footer component — segment-based rendering.
 *
 * Replaces the built-in footer with a configurable segment-based system.
 */

import type { ExtensionAPI, ExtensionContext, ReadonlyFooterDataProvider } from "@earendil-works/pi-coding-agent";
import type { Component, TUI, Theme } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { FooterConfig } from "../config.ts";
import {
  SEGMENT_RENDERERS,
  type SegmentContext,
} from "./segments.ts";

/* ── Footer component ── */

class PiTuiFooter implements Component {
  private readonly startTime: number;

  constructor(
    private readonly pi: ExtensionAPI,
    private readonly ctx: ExtensionContext,
    private readonly tui: TUI,
    private readonly config: FooterConfig,
    private readonly footerData: ReadonlyFooterDataProvider,
  ) {
    this.startTime = Date.now();
  }

  invalidate(): void {
    // No-op: data is fetched fresh each render
  }

  dispose(): void {
    // No-op: no resources to clean up
  }

  render(width: number): string[] {
    const theme = this.ctx.ui.theme;
    const ctx: SegmentContext = {
      theme,
      cwd: this.ctx.sessionManager.getCwd(),
      footerData: this.footerData,
      config: this.config,
      modelId: this.ctx.model?.id,
      contextPercent: null,
      contextWindow: this.ctx.model?.contextWindow,
      usage: this.getUsage(),
      thinkingLevel: undefined,
      startTime: this.startTime,
    };

    const lines: string[] = [];

    // Render line1 segments
    if (this.config.line1.segments.length > 0) {
      const line1Parts = this.renderSegments(this.config.line1.segments, ctx, width);
      if (line1Parts) {
        lines.push(truncateToWidth(line1Parts, width, "..."));
      }
    }

    // Render line2 segments
    if (this.config.line2.segments.length > 0) {
      const line2Parts = this.renderSegments(this.config.line2.segments, ctx, width);
      if (line2Parts) {
        lines.push(truncateToWidth(line2Parts, width, "..."));
      }
    }

    // If context.showCompact is enabled, reduce spacing
    if (this.config.context.showCompact && lines.length > 1) {
      // Already compact - no extra spacing added
    }

    return lines;
  }

  private renderSegments(
    segments: string[],
    ctx: SegmentContext,
    width: number,
  ): string {
    const parts: string[] = [];
    let totalWidth = 0;

    for (const segment of segments) {
      const renderer = SEGMENT_RENDERERS[segment];
      if (!renderer) continue;

      const text = renderer(ctx);
      if (!text) continue;

      const textWidth = visibleWidth(text);
      if (totalWidth + textWidth > width) {
        // Truncate if needed
        const remaining = width - totalWidth;
        if (remaining > 0) {
          parts.push(truncateToWidth(text, remaining, "..."));
        }
        break;
      }

      parts.push(text);
      totalWidth += textWidth;

      // Add separator between parts
      if (parts.length > 1 && totalWidth < width) {
        totalWidth += 1; // Space separator
      }
    }

    return parts.join(" ");
  }

  private getUsage(): SegmentContext["usage"] {
    // Try to get usage from session if available
    try {
      const session = (this.ctx as any).session;
      if (session?.usage) {
        return {
          input: session.usage.input ?? 0,
          output: session.usage.output ?? 0,
          cacheRead: session.usage.cacheRead ?? 0,
          cacheWrite: session.usage.cacheWrite ?? 0,
          cost: session.usage.cost ?? 0,
        };
      }
    } catch {
      // Ignore errors accessing session
    }
    return undefined;
  }
}

/* ── Installer ── */

export function installFooter(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  config: FooterConfig,
  footerData: ReadonlyFooterDataProvider,
): () => void {
  let footer: PiTuiFooter | undefined;

  ctx.ui.setFooter((tui, _theme, _fd) => {
    footer?.dispose();
    footer = new PiTuiFooter(pi, ctx, tui, config, footerData);
    return footer;
  });

  return () => {
    footer?.dispose();
    footer = undefined;
    ctx.ui.setFooter(undefined);
  };
}
