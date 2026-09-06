/**
 * Search renderer: results grouped by file with line numbers.
 *
 * Parses grep/find output and renders compact grouped results
 * with navigation between matches.
 */

export interface SearchMatch {
  /** 1-based line number */
  line: number;
  /** Matched line content */
  content: string;
  /** Optional column range [start, end] for highlighting */
  column?: [number, number];
}

export interface SearchFileGroup {
  /** File path */
  path: string;
  /** Matches in this file */
  matches: SearchMatch[];
}

export interface SearchRendererInput {
  /** Raw tool result content */
  content: string;
  /** Tool name (grep, find, etc.) */
  toolName: string;
  /** Tool input */
  input?: {
    pattern?: string;
    path?: string;
    glob?: string;
  };
  /** Whether matches were truncated */
  truncated?: boolean;
}

export interface SearchRendererOutput {
  /** One-line compact summary */
  summary: string;
  /** Full expanded view */
  expanded: string;
  /** Parsed file groups for navigation */
  fileGroups: SearchFileGroup[];
}

/**
 * Parse grep-style output into file groups.
 * Format: "filepath:linenum:content" or "filepath:content"
 */
export function parseGrepOutput(content: string): SearchFileGroup[] {
  const groups = new Map<string, SearchMatch[]>();

  for (const line of content.split("\n")) {
    if (!line.trim()) continue;

    // Match "file:linenum:content" or "file:linenum-content" (rg style)
    const match = line.match(/^(.+?):(\d+)[::-](.*)$/);
    if (match) {
      const [, filePath, lineNum, lineContent] = match;
      if (!filePath || !lineNum) continue;

      const normalizedPath = filePath.replace(/\\/g, "/");
      if (!groups.has(normalizedPath)) {
        groups.set(normalizedPath, []);
      }
      groups.get(normalizedPath)!.push({
        line: parseInt(lineNum, 10),
        content: lineContent ?? "",
      });
      continue;
    }

    // Match "file:content" (no line number)
    const noLineNum = line.match(/^(.+?):(.*)$/);
    if (noLineNum) {
      const [, filePath, lineContent] = noLineNum;
      if (!filePath) continue;

      const normalizedPath = filePath.replace(/\\/g, "/");
      if (!groups.has(normalizedPath)) {
        groups.set(normalizedPath, []);
      }
      groups.get(normalizedPath)!.push({
        line: 0,
        content: lineContent ?? "",
      });
    }
  }

  return Array.from(groups.entries()).map(([path, matches]) => ({
    path,
    matches,
  }));
}

/**
 * Parse find-style output (one path per line).
 */
export function parseFindOutput(content: string): SearchFileGroup[] {
  const paths = content
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (paths.length === 0) return [];

  // Group by directory
  const groups = new Map<string, SearchMatch[]>();
  for (const p of paths) {
    const parts = p.split("/");
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : ".";
    const name = parts[parts.length - 1] ?? p;

    if (!groups.has(dir)) {
      groups.set(dir, []);
    }
    groups.get(dir)!.push({
      line: 0,
      content: name,
    });
  }

  return Array.from(groups.entries()).map(([path, matches]) => ({
    path,
    matches,
  }));
}

/**
 * Format a compact summary line.
 */
export function formatSearchSummary(
  fileGroups: SearchFileGroup[],
  toolName: string,
  truncated?: boolean,
): string {
  const totalMatches = fileGroups.reduce((sum, g) => sum + g.matches.length, 0);
  const fileCount = fileGroups.length;

  if (totalMatches === 0) return "No matches found";

  const truncMarker = truncated ? " (truncated)" : "";
  const label = toolName === "find" ? "files" : "matches";

  if (fileCount === 1) {
    const file = fileGroups[0]!;
    const basename = file.path.split("/").pop() ?? file.path;
    return `${totalMatches} ${label} in ${basename}${truncMarker}`;
  }

  return `${totalMatches} ${label} in ${fileCount} dirs${truncMarker}`;
}

/**
 * Render the full expanded view.
 */
export function renderSearchExpanded(
  fileGroups: SearchFileGroup[],
  showLineNumbers: boolean = true,
): string {
  const lines: string[] = [];

  for (const group of fileGroups) {
    // File header
    lines.push(group.path);

    for (const match of group.matches) {
      const lineNum = showLineNumbers && match.line > 0
        ? `${match.line}: `
        : "  ";
      lines.push(`  ${lineNum}${match.content}`);
    }
  }

  return lines.join("\n");
}

/**
 * Main render function.
 */
export function renderSearch(
  input: SearchRendererInput,
  options?: { showLineNumbers?: boolean },
): SearchRendererOutput {
  const fileGroups = input.toolName === "find"
    ? parseFindOutput(input.content)
    : parseGrepOutput(input.content);

  const summary = formatSearchSummary(fileGroups, input.toolName, input.truncated);
  const expanded = renderSearchExpanded(fileGroups, options?.showLineNumbers ?? true);

  return { summary, expanded, fileGroups };
}
