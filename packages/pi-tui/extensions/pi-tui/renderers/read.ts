/**
 * Read renderer: file path + line range + syntax-highlighted content.
 *
 * Renders a compact header with the file path and line range, followed
 * by syntax-highlighted file content with optional line numbers.
 */

import { getLanguageFromPath, highlightCode } from "@earendil-works/pi-coding-agent";

export interface ReadRendererInput {
  /** Raw file content from the tool result */
  content: string;
  /** File path */
  filePath?: string;
  /** 1-based start line (from tool input offset) */
  offset?: number;
  /** Number of lines read */
  limit?: number;
  /** Total lines in file (for range display) */
  totalLines?: number;
}

export interface ReadRendererOutput {
  /** One-line compact summary */
  summary: string;
  /** Full expanded view */
  expanded: string;
}

/**
 * Detect file path from read tool content or input.
 */
export function extractFilePath(content: string, inputPath?: string): string | undefined {
  if (inputPath) return inputPath;

  // Try to extract from content header (e.g. "// path/to/file.ts" or "# path/to/file")
  const firstLine = content.split("\n")[0] ?? "";
  const headerMatch = firstLine.match(/^(?:\/\/|#|;)\s*(.+)$/);
  if (headerMatch) return headerMatch[1]?.trim();
  return undefined;
}

/**
 * Parse line range from content or input parameters.
 */
export function parseLineRange(
  content: string,
  offset?: number,
  limit?: number,
): { start: number; end: number; total: number } {
  const lines = content.split("\n");
  const total = lines.length;
  const start = (offset ?? 0) + 1;
  const end = limit ? start + limit - 1 : total;
  return { start, end: Math.min(end, total), total };
}

/**
 * Format a compact summary line for the read result.
 */
export function formatReadSummary(filePath?: string, range?: { start: number; end: number; total: number }): string {
  if (!filePath) return "File content";

  const basename = filePath.split("/").pop() ?? filePath;
  if (!range || (range.start === 1 && range.end === range.total)) {
    return `${basename} (${range?.total ?? "?"} lines)`;
  }
  return `${basename} L${range.start}-${range.end} of ${range.total}`;
}

/**
 * Render the full expanded view with syntax highlighting and line numbers.
 */
export function renderReadExpanded(
  content: string,
  filePath?: string,
  showLineNumbers: boolean = true,
): string {
  const lang = filePath ? getLanguageFromPath(filePath) ?? undefined : undefined;
  const highlighted = lang ? highlightCode(content, lang) : content.split("\n");

  const maxLineNum = highlighted.length;
  const gutterWidth = String(maxLineNum).length;

  const lines = highlighted.map((line, i) => {
    const lineNum = showLineNumbers ? String(i + 1).padStart(gutterWidth) + " │ " : "";
    return lineNum + line;
  });

  return lines.join("\n");
}

/**
 * Main render function: produces compact summary and expanded content.
 */
export function renderRead(
  input: ReadRendererInput,
  options?: { showLineNumbers?: boolean },
): ReadRendererOutput {
  const filePath = extractFilePath(input.content, input.filePath);
  const range = parseLineRange(input.content, input.offset, input.limit);
  const summary = formatReadSummary(filePath, range);
  const expanded = renderReadExpanded(
    input.content,
    filePath,
    options?.showLineNumbers ?? true,
  );

  return { summary, expanded };
}
