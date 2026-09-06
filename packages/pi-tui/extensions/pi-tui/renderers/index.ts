/**
 * Renderer registry and middleware router.
 *
 * Routes tool_result events to the appropriate renderer based on
 * toolName and content shape. Unknown tools pass through unchanged.
 */

import type { RenderersConfig } from "../config.ts";
import { renderRead, type ReadRendererInput } from "./read.ts";
import { renderSearch, type SearchRendererInput } from "./search.ts";
import { renderListing, type ListingRendererInput } from "./listing.ts";
import { renderCommand, type CommandRendererInput } from "./command.ts";
import { renderDiff, type DiffRendererInput } from "./diff.ts";

export type { ReadRendererInput, ReadRendererOutput } from "./read.ts";
export type { SearchRendererInput, SearchRendererOutput } from "./search.ts";
export type { ListingRendererInput, ListingRendererOutput } from "./listing.ts";
export type { CommandRendererInput, CommandRendererOutput } from "./command.ts";
export type { DiffRendererInput, DiffRendererOutput } from "./diff.ts";

/**
 * Result from a renderer.
 */
export interface RendererResult {
  /** One-line compact summary */
  summary: string;
  /** Full expanded content */
  expanded: string;
  /** Whether the tool result was an error */
  isError: boolean;
  /** The renderer type used */
  rendererType: string;
}

/**
 * Default renderer config (used when not provided).
 */
export function defaultRenderersConfig(): RenderersConfig {
  return {
    enabled: { read: true, search: true, listing: true, command: true, diff: true, image: false },
    defaultExpanded: { read: false, search: false, listing: false, command: false, diff: true, error: true },
    diff: { prefer: "auto", highlight: true, showLineNumbers: true, minSplitWidth: 140 },
    image: { maxWidth: 80, maxHeight: 24, fallback: "metadata" },
    truncateAt: 2000,
  };
}

/**
 * Check if a string looks like a unified diff.
 */
function looksLikeDiff(content: string): boolean {
  return content.includes("diff --git") ||
    (content.includes("--- ") && content.includes("+++ ") && content.includes("@@"));
}

/**
 * Check if a string looks like grep/search output.
 */
function looksLikeGrepOutput(content: string): boolean {
  const lines = content.split("\n").filter(Boolean);
  if (lines.length === 0) return false;

  // Grep output: file:linenum:content pattern
  const grepPattern = lines.filter((l) => l.match(/^.+:\d+:.+$/)).length;
  return grepPattern > lines.length * 0.5;
}

/**
 * Check if content looks like a directory listing.
 */
function looksLikeListing(content: string): boolean {
  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return false;

  // Directory listing: mostly short lines, many without extensions
  const shortLines = lines.filter((l) => l.trim().length < 80).length;
  const withExtensions = lines.filter((l) => l.match(/\.\w{1,4}$/)).length;
  return shortLines > lines.length * 0.7 && withExtensions < lines.length * 0.5;
}

/**
 * Detect the appropriate renderer type for a tool result.
 */
export function detectRendererType(
  toolName: string,
  content: string,
  input?: Record<string, unknown>,
): string | null {
  // Explicit tool name mapping
  switch (toolName) {
    case "read":
      return "read";
    case "grep":
    case "find":
      return "search";
    case "ls":
      return "listing";
    case "bash":
      return "command";
    case "edit":
    case "write":
    case "apply_patch":
      return looksLikeDiff(content) ? "diff" : null;
  }

  // Content-based detection for unknown tools
  if (looksLikeDiff(content)) return "diff";
  if (looksLikeGrepOutput(content)) return "search";
  if (looksLikeListing(content)) return "listing";

  return null;
}

/**
 * Run a renderer for a tool result.
 */
export function runRenderer(
  rendererType: string,
  content: string,
  input?: Record<string, unknown>,
  options?: { showLineNumbers?: boolean; maxChars?: number },
): RendererResult | null {
  const truncated = content.length > (options?.maxChars ?? 2000);

  switch (rendererType) {
    case "read": {
      const result = renderRead({
        content,
        filePath: input?.path as string | undefined,
        offset: input?.offset as number | undefined,
        limit: input?.limit as number | undefined,
      }, options);
      return {
        summary: result.summary,
        expanded: result.expanded,
        isError: false,
        rendererType: "read",
      };
    }

    case "search": {
      const result = renderSearch({
        content,
        toolName: (input?.pattern ? "grep" : "find") as string,
        input: input as SearchRendererInput["input"],
        truncated,
      }, options);
      return {
        summary: result.summary,
        expanded: result.expanded,
        isError: false,
        rendererType: "search",
      };
    }

    case "listing": {
      const result = renderListing({
        content,
        toolName: "ls",
        input: input as ListingRendererInput["input"],
        truncated,
      });
      return {
        summary: result.summary,
        expanded: result.expanded,
        isError: false,
        rendererType: "listing",
      };
    }

    case "command": {
      const result = renderCommand({
        content,
        command: input?.command as string | undefined,
        exitCode: input?.exitCode as number | undefined,
        truncated,
      }, options);
      return {
        summary: result.summary,
        expanded: result.expanded,
        isError: !result.success,
        rendererType: "command",
      };
    }

    case "diff": {
      const result = renderDiff({
        content,
      }, options);
      return {
        summary: result.summary,
        expanded: result.expanded,
        isError: false,
        rendererType: "diff",
      };
    }

    default:
      return null;
  }
}

/**
 * Create a tool_result middleware handler.
 *
 * Returns a function suitable for pi.on("tool_result", handler).
 */
export function createToolResultHandler(
  config?: Partial<RenderersConfig>,
) {
  const cfg = { ...defaultRenderersConfig(), ...config };

  return function handleToolResult(
    event: { toolName: string; content: Array<{ type: string; text?: string }>; isError: boolean; input: Record<string, unknown> },
    _ctx: unknown,
  ) {
    // Skip if all renderers disabled
    if (!Object.values(cfg.enabled).some(Boolean)) return;

    // Get text content
    const textContent = event.content
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n");

    if (!textContent.trim()) return;

    // Detect renderer
    const rendererType = detectRendererType(event.toolName, textContent, event.input);
    if (!rendererType) return;

    // Check if renderer is enabled
    const enabledKey = rendererType as keyof typeof cfg.enabled;
    if (cfg.enabled[enabledKey] === false) return;

    // Determine if expanded
    const isExpanded = event.isError
      ? cfg.defaultExpanded.error
      : cfg.defaultExpanded[enabledKey as keyof typeof cfg.defaultExpanded] ?? false;

    // Run renderer
    const result = runRenderer(rendererType, textContent, event.input, {
      showLineNumbers: cfg.diff.showLineNumbers,
      maxChars: cfg.truncateAt,
    });

    if (!result) return;

    // Return modified content with compact/expanded views
    const displayText = isExpanded ? result.expanded : result.summary;
    return {
      content: [{ type: "text" as const, text: displayText }],
      details: {
        rendererType: result.rendererType,
        summary: result.summary,
        expanded: result.expanded,
        isExpanded,
      },
      isError: result.isError,
    };
  };
}
