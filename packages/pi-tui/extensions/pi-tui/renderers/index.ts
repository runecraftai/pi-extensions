/**
 * Renderer routing middleware — routes tool_result events by tool name and content shape.
 *
 * Each renderer is a pure function callable without Pi.
 * Unknown tools return undefined (chain continues, Pi native renderer takes over).
 */

import type { ExtensionAPI, ExtensionContext, ToolResultEvent, ToolResultEventResult } from "@earendil-works/pi-coding-agent";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { PiTuiConfig } from "../config.ts";
import { looksLikeDiff, parseDiff } from "./diff.ts";
import { renderDiff, type DiffViewConfig, DEFAULT_DIFF_VIEW_CONFIG } from "./diff-view.ts";

/* ── Renderer types ── */

export type RendererName = "diff" | "read" | "search" | "listing" | "command";

export interface RendererConfig {
  enabled: Record<RendererName, boolean>;
  diff: DiffViewConfig;
  defaultExpanded: Record<RendererName | "error", boolean>;
}

const DEFAULT_RENDERER_CONFIG: RendererConfig = {
  enabled: {
    diff: true,
    read: true,
    search: true,
    listing: true,
    command: true,
  },
  diff: DEFAULT_DIFF_VIEW_CONFIG,
  defaultExpanded: {
    diff: true,
    read: false,
    search: false,
    listing: false,
    command: false,
    error: true,
  },
};

/* ── Content extraction ── */

/**
 * Extract plain text content from a tool result event.
 */
function extractTextContent(event: ToolResultEvent): string {
  if (!event.content || !Array.isArray(event.content)) return "";
  return event.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

/* ── Diff renderer ── */

async function renderDiffResult(
  event: ToolResultEvent,
  config: RendererConfig,
  theme: Theme,
  signal?: AbortSignal,
): Promise<ToolResultEventResult | undefined> {
  const text = extractTextContent(event);
  if (!looksLikeDiff(text)) return undefined;

  const result = parseDiff(text);
  if (result.files.length === 0) return undefined;

  const lines = await renderDiff(text, config.diff, theme, signal);
  const renderedText = lines.join("\n");

  return {
    content: [{ type: "text", text: renderedText }],
    details: { renderer: "diff", files: result.files.length },
  };
}

/* ── Tool detection ── */

function isEditToolResult(event: ToolResultEvent): boolean {
  return event.toolName === "edit" || event.toolName === "apply_patch";
}

function isWriteToolResult(event: ToolResultEvent): boolean {
  return event.toolName === "write";
}

function isBashToolResult(event: ToolResultEvent): boolean {
  return event.toolName === "bash";
}

function isDiffLikeResult(event: ToolResultEvent): boolean {
  if (isEditToolResult(event) || isWriteToolResult(event)) {
    const text = extractTextContent(event);
    return looksLikeDiff(text);
  }
  // For bash results, check if output looks like diff output
  if (isBashToolResult(event)) {
    const text = extractTextContent(event);
    return looksLikeDiff(text);
  }
  return false;
}

/* ── Main router ── */

/**
 * Create a tool_result event handler that routes to appropriate renderers.
 *
 * @param pi - Extension API for configuration access
 * @param getConfig - Function to get current pi-tui config
 * @returns Event handler function for tool_result events
 */
export function createRendererHandler(
  getConfig: () => PiTuiConfig,
) {
  return async function handleToolResult(
    event: ToolResultEvent,
    ctx: ExtensionContext,
  ): Promise<ToolResultEventResult | undefined> {
    const config = getConfig();

    // Check if renderers are enabled in config
    if (!config.enabled || !config.renderers?.enabled) {
      return undefined;
    }

    const rendererConfig: RendererConfig = {
      enabled: config.renderers?.enabled ?? DEFAULT_RENDERER_CONFIG.enabled,
      diff: config.renderers?.diff ?? DEFAULT_DIFF_VIEW_CONFIG,
      defaultExpanded: config.renderers?.defaultExpanded ?? DEFAULT_RENDERER_CONFIG.defaultExpanded,
    };

    // Respect ctx.signal for cancellation
    const signal = ctx.signal;

    // Diff detection: edit/write with diff content, or bash output that looks like diff
    if (rendererConfig.enabled.diff && isDiffLikeResult(event)) {
      return await renderDiffResult(event, rendererConfig, ctx.ui.theme, signal);
    }

    // Unknown tool or no matching renderer — return undefined
    // This lets Pi's native renderer take over
    return undefined;
  };
}

/**
 * Register the renderer middleware with Pi.
 *
 * @param pi - Extension API
 * @param getConfig - Function to get current pi-tui config
 */
export function registerRenderers(
  pi: ExtensionAPI,
  getConfig: () => PiTuiConfig,
): void {
  const handler = createRendererHandler(getConfig);

  pi.on("tool_result", async (event, ctx) => {
    return handler(event, ctx);
  });
}

/* ── Pure renderer functions (callable without Pi) ── */

/**
 * Pure function: render a diff string to colored, numbered lines.
 * Can be used directly in tests without Pi context.
 */
export async function renderDiffText(
  diffText: string,
  config: DiffViewConfig = DEFAULT_DIFF_VIEW_CONFIG,
): Promise<string[]> {
  // Create a minimal theme stub for standalone use
  const stubTheme = {
    fg: (color: string, text: string) => `\x1b[${colorFgCode(color)}m${text}\x1b[0m`,
    bg: (_color: string, text: string) => text, // No background in standalone
    bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
    dim: (text: string) => `\x1b[2m${text}\x1b[0m`,
  } as unknown as Theme;

  return renderDiff(diffText, config, stubTheme);
}

function colorFgCode(color: string): string {
  const codes: Record<string, string> = {
    green: "32",
    red: "31",
    cyan: "36",
    dim: "90",
    accent: "36",
    muted: "90",
    warning: "33",
    error: "31",
  };
  return codes[color] ?? "0";
}

/**
 * Check if a tool result would be handled by our renderers.
 * Useful for testing and debugging.
 */
export function canRender(event: ToolResultEvent, config?: RendererConfig): boolean {
  const cfg = config ?? DEFAULT_RENDERER_CONFIG;
  if (!cfg.enabled.diff) return false;
  return isDiffLikeResult(event);
}

/**
 * Get default renderer config for testing.
 */
export function getDefaultRendererConfig(): RendererConfig {
  return structuredClone(DEFAULT_RENDERER_CONFIG);
}
