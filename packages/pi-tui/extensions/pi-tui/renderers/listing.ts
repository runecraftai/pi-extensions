/**
 * Listing renderer: compact tree view of directories and files.
 *
 * Renders ls/find output as a compact tree with collapsible
 * large directories.
 */

export interface ListingEntry {
  /** Entry name */
  name: string;
  /** Whether this is a directory */
  isDirectory: boolean;
  /** Full path */
  path?: string;
}

export interface ListingRendererInput {
  /** Raw tool result content */
  content: string;
  /** Tool name (ls, find, etc.) */
  toolName: string;
  /** Tool input */
  input?: {
    path?: string;
    limit?: number;
  };
  /** Whether output was truncated */
  truncated?: boolean;
}

export interface ListingRendererOutput {
  /** One-line compact summary */
  summary: string;
  /** Full expanded view */
  expanded: string;
  /** Parsed entries */
  entries: ListingEntry[];
}

/**
 * Parse ls-style output into entries.
 */
export function parseLsOutput(content: string): ListingEntry[] {
  const entries: ListingEntry[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip headers and metadata lines
    if (trimmed.startsWith("total ") || trimmed.startsWith("d-------") || trimmed.startsWith("-")) continue;

    // Try to detect directory from trailing / or by common patterns
    const isDir = trimmed.endsWith("/") || trimmed.endsWith(":");

    // Clean up common ls formatting
    const name = trimmed
      .replace(/\/$/, "")
      .replace(/:\s*$/, "")
      .replace(/^\s*\.\.?\s*/, "")
      .trim();

    if (name && !name.match(/^[@|#|~|%|&|\*|!|-]+$/)) {
      entries.push({
        name,
        isDirectory: isDir,
      });
    }
  }

  return entries;
}

/**
 * Parse find-style output into entries.
 */
export function parseFindEntries(content: string): ListingEntry[] {
  return content
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((path) => {
      const parts = path.split("/");
      const name = parts[parts.length - 1] ?? path;
      // Heuristic: no extension = likely directory
      const isDir = !name.includes(".");
      return { name, isDirectory: isDir, path };
    });
}

/**
 * Format a compact summary line.
 */
export function formatListingSummary(
  entries: ListingEntry[],
  truncated?: boolean,
): string {
  const dirs = entries.filter((e) => e.isDirectory).length;
  const files = entries.filter((e) => !e.isDirectory).length;
  const truncMarker = truncated ? " (truncated)" : "";

  const parts: string[] = [];
  if (dirs > 0) parts.push(`${dirs} dir${dirs > 1 ? "s" : ""}`);
  if (files > 0) parts.push(`${files} file${files > 1 ? "s" : ""}`);

  return parts.length > 0
    ? `${parts.join(", ")}${truncMarker}`
    : "Empty directory";
}

/**
 * Render expanded tree view with collapsing.
 */
export function renderListingExpanded(
  entries: ListingEntry[],
  collapseThreshold: number = 50,
): string {
  if (entries.length === 0) return "(empty)";

  const dirs = entries.filter((e) => e.isDirectory);
  const files = entries.filter((e) => !e.isDirectory);

  const lines: string[] = [];

  // Show directories first
  if (dirs.length > 0) {
    if (dirs.length > collapseThreshold) {
      lines.push(`${dirs.length} directories (collapsed)`);
      // Show first few as preview
      for (const d of dirs.slice(0, 5)) {
        lines.push(`  ${d.name}/`);
      }
      lines.push(`  ... (${dirs.length - 5} more)`);
    } else {
      for (const d of dirs) {
        lines.push(`${d.name}/`);
      }
    }
  }

  // Then files
  if (files.length > 0) {
    if (dirs.length > 0) lines.push("");

    if (files.length > collapseThreshold) {
      lines.push(`${files.length} files (collapsed)`);
      for (const f of files.slice(0, 5)) {
        lines.push(`  ${f.name}`);
      }
      lines.push(`  ... (${files.length - 5} more)`);
    } else {
      for (const f of files) {
        lines.push(f.name);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Main render function.
 */
export function renderListing(
  input: ListingRendererInput,
  options?: { collapseThreshold?: number },
): ListingRendererOutput {
  const entries = input.toolName === "find"
    ? parseFindEntries(input.content)
    : parseLsOutput(input.content);

  const summary = formatListingSummary(entries, input.truncated);
  const expanded = renderListingExpanded(entries, options?.collapseThreshold ?? 50);

  return { summary, expanded, entries };
}
