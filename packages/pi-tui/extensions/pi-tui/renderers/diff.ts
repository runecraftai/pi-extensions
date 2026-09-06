/**
 * Unified diff parser — pure functions, no Pi dependency.
 *
 * Parses unified diff text into structured DiffFile/DiffHunk/DiffLine objects.
 * Supports rename detection, binary markers, and conflict markers.
 */

/* ── Types ── */

export type DiffLineKind = "context" | "addition" | "deletion" | "hunk_header" | "file_header" | "binary" | "conflict";

export interface DiffLine {
  /** 0-based line index within the hunk */
  index: number;
  /** Raw text of the line including the leading +/-/space */
  raw: string;
  /** Stripped text (without leading marker) */
  text: string;
  kind: DiffLineKind;
  /** New-file line number (1-based), undefined for deletions */
  newLine?: number;
  /** Old-file line number (1-based), undefined for additions */
  oldLine?: number;
}

export interface DiffHunk {
  /** Hunk header line: @@ -oldStart,oldCount +newStart,newCount @@ */
  header: string;
  /** Parsed old-range start */
  oldStart: number;
  /** Parsed old-range line count */
  oldCount: number;
  /** Parsed new-range start */
  newStart: number;
  /** Parsed new-range line count */
  newCount: number;
  /** Context text after the @@ range (e.g. function name) */
  context: string;
  lines: DiffLine[];
}

export interface DiffFile {
  /** "diff --git a/path b/path" header */
  header: string;
  /** Source path (from --- line or diff header) */
  oldPath: string;
  /** Destination path (from +++ line or diff header) */
  newPath: string;
  /** Rename source if detected */
  renameFrom?: string;
  /** Rename dest if detected */
  renameTo?: string;
  /** True if binary file */
  isBinary: boolean;
  /** Hunks in this file */
  hunks: DiffHunk[];
}

export interface DiffParseResult {
  /** All parsed files */
  files: DiffFile[];
  /** Raw input text */
  raw: string;
  /** True if any conflict markers were found */
  hasConflicts: boolean;
}

/* ── Parsing ── */

const FILE_HEADER_RE = /^diff --git (.+) (.+)$/;
const OLD_PATH_RE = /^--- (.+?)(?:\s+(.+))?$/;
const NEW_PATH_RE = /^\+\+\+ (.+?)(?:\s+(.+))?$/;
const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;
const RENAME_RE = /^rename from (.+)$/i;
const RENAME_TO_RE = /^rename to (.+)$/i;
const BINARY_RE = /^Binary files .+ and .+ differ$/;
const CONFLICT_MARKER_RE = /^(<{7}|>{7}|={7})/;

function stripDevNull(path: string): string {
  // Paths like "a/foo.js" or "/dev/null"
  if (path === "/dev/null") return "";
  if (path.startsWith("a/")) return path.slice(2);
  if (path.startsWith("b/")) return path.slice(2);
  return path;
}

function parseHunkHeader(line: string): Omit<DiffHunk, "lines"> | undefined {
  const m = HUNK_HEADER_RE.exec(line);
  if (!m) return undefined;
  return {
    header: line,
    oldStart: parseInt(m[1], 10),
    oldCount: m[2] ? parseInt(m[2], 10) : 1,
    newStart: parseInt(m[3], 10),
    newCount: m[4] ? parseInt(m[4], 10) : 1,
    context: m[5]?.trim() ?? "",
    lines: [],
  };
}

function classifyLine(raw: string): DiffLineKind {
  if (raw.startsWith("+")) return "addition";
  if (raw.startsWith("-")) return "deletion";
  if (raw.startsWith(" ")) return "context";
  if (raw.startsWith("@@")) return "hunk_header";
  if (raw.startsWith("diff ")) return "file_header";
  if (raw.startsWith("Binary")) return "binary";
  if (CONFLICT_MARKER_RE.test(raw)) return "conflict";
  return "context";
}

/**
 * Parse unified diff text into structured result.
 *
 * Handles:
 * - Standard unified diff format (git diff, diff -u)
 * - Rename detection (rename from/to)
 * - Binary file markers
 * - Conflict markers
 */
export function parseDiff(text: string): DiffParseResult {
  const lines = text.split("\n");
  const files: DiffFile[] = [];
  let hasConflicts = false;
  let currentFile: DiffFile | undefined;
  let currentHunk: DiffHunk | undefined;

  for (const rawLine of lines) {
    const trimmed = rawLine;

    // Conflict markers
    if (CONFLICT_MARKER_RE.test(trimmed)) {
      hasConflicts = true;
    }

    // File header: diff --git a/... b/...
    const fileMatch = FILE_HEADER_RE.exec(trimmed);
    if (fileMatch) {
      currentFile = {
        header: trimmed,
        oldPath: stripDevNull(fileMatch[1]),
        newPath: stripDevNull(fileMatch[2]),
        isBinary: false,
        hunks: [],
      };
      files.push(currentFile);
      currentHunk = undefined;
      continue;
    }

    // If we haven't seen a file header, skip non-diff content
    if (!currentFile) continue;

    // --- line
    const oldMatch = OLD_PATH_RE.exec(trimmed);
    if (oldMatch) {
      currentFile.oldPath = stripDevNull(oldMatch[1]);
      continue;
    }

    // +++ line
    const newMatch = NEW_PATH_RE.exec(trimmed);
    if (newMatch) {
      currentFile.newPath = stripDevNull(newMatch[1]);
      continue;
    }

    // Rename detection
    const renameMatch = RENAME_RE.exec(trimmed);
    if (renameMatch) {
      currentFile.renameFrom = renameMatch[1];
      continue;
    }
    const renameToMatch = RENAME_TO_RE.exec(trimmed);
    if (renameToMatch) {
      currentFile.renameTo = renameToMatch[1];
      continue;
    }

    // Binary marker
    if (BINARY_RE.test(trimmed)) {
      currentFile.isBinary = true;
      continue;
    }

    // Hunk header
    const hunk = parseHunkHeader(trimmed);
    if (hunk) {
      currentHunk = hunk;
      currentFile.hunks.push(currentHunk);
      continue;
    }

    // Diff line within a hunk
    if (currentHunk) {
      const kind = classifyLine(trimmed);
      const line: DiffLine = {
        index: currentHunk.lines.length,
        raw: trimmed,
        text: trimmed.slice(1),
        kind,
      };

      // Compute line numbers
      const isAdd = kind === "addition";
      const isDel = kind === "deletion";
      const isContext = kind === "context";

      if (isAdd || isContext) {
        line.newLine = currentHunk.newStart + currentHunk.lines.filter(
          (l) => l.kind === "addition" || l.kind === "context",
        ).length;
      }
      if (isDel || isContext) {
        line.oldLine = currentHunk.oldStart + currentHunk.lines.filter(
          (l) => l.kind === "deletion" || l.kind === "context",
        ).length;
      }

      currentHunk.lines.push(line);
    }
  }

  return { files, raw: text, hasConflicts };
}

/**
 * Detect if a tool result content looks like a diff.
 * Checks for common diff markers in the text content.
 */
export function looksLikeDiff(content: string): boolean {
  if (!content) return false;
  // Quick check for unified diff markers
  if (/^diff --git /m.test(content)) return true;
  if (/^@@ -\d+.*\+\d+.* @@/m.test(content)) return true;
  return false;
}

/**
 * Get the display name for a file in the diff.
 * Prefers newPath, falls back to oldPath, shows rename info.
 */
export function diffFileDisplayName(file: DiffFile): string {
  if (file.renameFrom && file.renameTo) {
    return `${file.renameFrom} → ${file.renameTo}`;
  }
  return file.newPath || file.oldPath || "(unknown)";
}
