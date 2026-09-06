/**
 * Diff renderer: parse unified diff and render with syntax highlighting.
 *
 * Supports both split and unified modes. Split for wide terminals,
 * unified for narrow ones.
 */

export interface DiffHunk {
  /** 1-based start line in new file */
  newStart: number;
  /** Number of lines in new file */
  newLines: number;
  /** 1-based start line in old file */
  oldStart: number;
  /** Number of lines in old file */
  oldLines: number;
  /** Lines in this hunk */
  lines: DiffLine[];
}

export interface DiffLine {
  /** '+' for added, '-' for removed, ' ' for context, '\' for hunk header */
  type: "add" | "del" | "context" | "header";
  /** The line content (without prefix) */
  content: string;
  /** 1-based line number in new file (for add/context) */
  newLineNum?: number;
  /** 1-based line number in old file (for del/context) */
  oldLineNum?: number;
}

export interface DiffFile {
  /** Old file path */
  oldPath?: string;
  /** New file path */
  newPath?: string;
  /** Hunks in this file */
  hunks: DiffHunk[];
  /** Whether this is a rename */
  isRename: boolean;
  /** Whether file is binary */
  isBinary: boolean;
}

export interface DiffRendererInput {
  /** Raw diff content */
  content: string;
}

export interface DiffRendererOutput {
  /** One-line compact summary */
  summary: string;
  /** Full expanded view (unified or split based on width) */
  expanded: string;
  /** Parsed file diffs */
  files: DiffFile[];
}

/**
 * Parse a unified diff string into structured data.
 */
export function parseDiff(content: string): DiffFile[] {
  const files: DiffFile[] = [];
  let currentFile: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let newLineNum = 0;
  let oldLineNum = 0;

  for (const rawLine of content.split("\n")) {
    // File header: diff --git a/path b/path
    const fileMatch = rawLine.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (fileMatch) {
      currentFile = {
        oldPath: fileMatch[1],
        newPath: fileMatch[2],
        hunks: [],
        isRename: fileMatch[1] !== fileMatch[2],
        isBinary: false,
      };
      files.push(currentFile);
      currentHunk = null;
      continue;
    }

    // Binary file
    if (rawLine === "Binary files /dev/null and b/... differ" || rawLine.match(/Binary files .+ and .+ differ/)) {
      if (currentFile) currentFile.isBinary = true;
      continue;
    }

    // --- line (old file)
    if (rawLine.startsWith("--- ")) {
      const path = rawLine.slice(4).replace(/\\/g, "").replace(/\t.*$/, "");
      if (currentFile && path !== "/dev/null") {
        currentFile.oldPath = path.replace(/^a\//, "");
      }
      continue;
    }

    // +++ line (new file)
    if (rawLine.startsWith("+++ ")) {
      const path = rawLine.slice(4).replace(/\\/g, "").replace(/\t.*$/, "");
      if (currentFile && path !== "/dev/null") {
        currentFile.newPath = path.replace(/^b\//, "");
      }
      continue;
    }

    // Hunk header: @@ -oldStart,oldLines +newStart,newLines @@
    const hunkMatch = rawLine.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
    if (hunkMatch && currentFile) {
      currentHunk = {
        oldStart: parseInt(hunkMatch[1]!, 10),
        oldLines: parseInt(hunkMatch[2] ?? "1", 10),
        newStart: parseInt(hunkMatch[3]!, 10),
        newLines: parseInt(hunkMatch[4] ?? "1", 10),
        lines: [],
      };
      currentFile.hunks.push(currentHunk);
      newLineNum = currentHunk.newStart;
      oldLineNum = currentHunk.oldStart;
      continue;
    }

    // Diff lines
    if (currentHunk) {
      if (rawLine.startsWith("+")) {
        currentHunk.lines.push({
          type: "add",
          content: rawLine.slice(1),
          newLineNum: newLineNum++,
        });
      } else if (rawLine.startsWith("-")) {
        currentHunk.lines.push({
          type: "del",
          content: rawLine.slice(1),
          oldLineNum: oldLineNum++,
        });
      } else if (rawLine.startsWith(" ")) {
        currentHunk.lines.push({
          type: "context",
          content: rawLine.slice(1),
          newLineNum: newLineNum++,
          oldLineNum: oldLineNum++,
        });
      } else if (rawLine.startsWith("\\")) {
        currentHunk.lines.push({
          type: "header",
          content: rawLine.slice(1),
        });
      } else if (rawLine.trim() === "") {
        // Empty line in diff = context line with empty content
        currentHunk.lines.push({
          type: "context",
          content: "",
          newLineNum: newLineNum++,
          oldLineNum: oldLineNum++,
        });
      }
    }
  }

  return files;
}

/**
 * Format a compact summary for diff.
 */
export function formatDiffSummary(files: DiffFile[]): string {
  const totalAdds = files.reduce((sum, f) =>
    sum + f.hunks.reduce((s, h) => s + h.lines.filter((l) => l.type === "add").length, 0), 0);
  const totalDels = files.reduce((sum, f) =>
    sum + f.hunks.reduce((s, h) => s + h.lines.filter((l) => l.type === "del").length, 0), 0);

  const fileCount = files.length;
  const fileLabel = fileCount === 1 ? "file" : "files";

  if (files.length === 1) {
    const name = files[0]!.newPath ?? files[0]!.oldPath ?? "unknown";
    const basename = name.split("/").pop() ?? name;
    return `${basename}: +${totalAdds}/-${totalDels}`;
  }

  return `${fileCount} files: +${totalAdds}/-${totalDels}`;
}

/**
 * Render a single diff line with formatting.
 */
export function renderDiffLine(
  line: DiffLine,
  gutterWidth: number = 4,
  showLineNumbers: boolean = true,
): string {
  const prefix = line.type === "add" ? "+" : line.type === "del" ? "-" : " ";

  if (!showLineNumbers) {
    return `${prefix}${line.content}`;
  }

  const oldNum = line.oldLineNum != null ? String(line.oldLineNum).padStart(gutterWidth) : " ".repeat(gutterWidth);
  const newNum = line.newLineNum != null ? String(line.newLineNum).padStart(gutterWidth) : " ".repeat(gutterWidth);

  return `${oldNum} ${newNum} ${prefix}${line.content}`;
}

/**
 * Render diff in unified mode.
 */
export function renderDiffUnified(
  files: DiffFile[],
  showLineNumbers: boolean = true,
): string {
  const lines: string[] = [];

  for (const file of files) {
    const name = file.newPath ?? file.oldPath ?? "unknown";
    if (file.isRename) {
      lines.push(`--- ${file.oldPath}`);
      lines.push(`+++ ${file.newPath}`);
    } else {
      lines.push(`--- ${name}`);
      lines.push(`+++ ${name}`);
    }

    if (file.isBinary) {
      lines.push("Binary file changed");
      lines.push("");
      continue;
    }

    for (const hunk of file.hunks) {
      lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
      for (const line of hunk.lines) {
        lines.push(renderDiffLine(line, 4, showLineNumbers));
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Main render function.
 */
export function renderDiff(
  input: DiffRendererInput,
  options?: { showLineNumbers?: boolean; prefer?: "auto" | "split" | "unified"; width?: number },
): DiffRendererOutput {
  const files = parseDiff(input.content);
  const summary = formatDiffSummary(files);
  const expanded = renderDiffUnified(files, options?.showLineNumbers ?? true);

  return { summary, expanded, files };
}
