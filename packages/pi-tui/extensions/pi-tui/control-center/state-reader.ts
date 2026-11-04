/**
 * Squad state file reader — reads *.meta and *.status files from the
 * local state directory. Read-only; never writes to Squad state.
 *
 * State directory: /home/rehem/Projects/squad/state/
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/* ── Types ── */

export interface TaskMeta {
  /** Task slug (filename without extension) */
  slug: string;
  /** Window name */
  window?: string;
  /** Endpoint task ID */
  endpointTaskId?: string;
  /** Worktree path */
  worktree?: string;
  /** Project path */
  project?: string;
  /** Harness (e.g., "pi") */
  harness?: string;
  /** Kind (e.g., "strike") */
  kind?: string;
  /** Mode (e.g., "drill") */
  mode?: string;
  /** YOLO setting */
  yolo?: string;
  /** Task temp directory */
  tasktmp?: string;
  /** Model used */
  model?: string;
  /** Effort level */
  effort?: string;
  /** Busy generation (unique session marker) */
  busyGen?: string;
  /** Raw key=value lines */
  raw: Record<string, string>;
  /** File modification time */
  mtimeMs: number;
}

export interface TaskStatus {
  /** Task slug (filename without extension) */
  slug: string;
  /** Latest status line */
  latestStatus?: string;
  /** Status state (working, done, blocked, failed, paused, needs-decision) */
  state?: string;
  /** All status lines */
  lines: string[];
  /** File modification time */
  mtimeMs: number;
}

export interface TaskInfo {
  /** Combined meta + status */
  slug: string;
  meta?: TaskMeta;
  status?: TaskStatus;
  /** Derived state for display */
  displayState: "running" | "parked" | "done" | "failed" | "unknown";
  /** Elapsed time since first status or meta creation */
  elapsedMs: number;
  /** Model from meta */
  model: string;
  /** Project short name */
  project: string;
}

/* ── State directory ── */

const STATE_DIR = "/home/rehem/Projects/squad/state";

function getStateDir(): string {
  return STATE_DIR;
}

/* ── Parsing ── */

export function parseMetaFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    result[key] = value;
  }
  return result;
}

export function parseStatusFile(content: string): string[] {
  return content.split("\n").filter((line) => line.trim().length > 0);
}

export function deriveState(statusLines: string[]): TaskInfo["displayState"] {
  if (statusLines.length === 0) return "unknown";
  const lastLine = statusLines[statusLines.length - 1]!.trim();
  if (lastLine.startsWith("done:")) return "done";
  if (lastLine.startsWith("failed:")) return "failed";
  if (lastLine.startsWith("blocked:")) return "parked";
  if (lastLine.startsWith("paused:")) return "parked";
  if (lastLine.startsWith("needs-decision:")) return "parked";
  if (lastLine.startsWith("working:")) return "running";
  if (lastLine.startsWith("resolved:")) return "running";
  return "unknown";
}

function deriveLatestStatus(statusLines: string[]): string | undefined {
  if (statusLines.length === 0) return undefined;
  return statusLines[statusLines.length - 1]!.trim();
}

function extractStateFromStatus(latestStatus: string): string | undefined {
  if (!latestStatus) return undefined;
  for (const prefix of ["done:", "failed:", "blocked:", "paused:", "needs-decision:", "working:", "resolved:"]) {
    if (latestStatus.startsWith(prefix)) return prefix.slice(0, -1);
  }
  return undefined;
}

export function shortProject(projectPath?: string): string {
  if (!projectPath) return "—";
  const parts = projectPath.split("/");
  // Get last 2 meaningful parts
  const meaningful = parts.filter((p) => p.length > 0 && p !== "Projects" && p !== "home" && p !== "rehem");
  return meaningful.slice(-2).join("/") || "—";
}

/* ── Reading ── */

function readMetaFiles(): Map<string, TaskMeta> {
  const result = new Map<string, TaskMeta>();
  try {
    const dir = getStateDir();
    const files = readdirSync(dir);
    for (const file of files) {
      if (!file.endsWith(".meta")) continue;
      const slug = file.slice(0, -5); // remove .meta
      try {
        const filePath = join(dir, file);
        const content = readFileSync(filePath, "utf8");
        const raw = parseMetaFile(content);
        const stat = statSync(filePath);
        result.set(slug, {
          slug,
          window: raw.window,
          endpointTaskId: raw.endpoint_task_id,
          worktree: raw.worktree,
          project: raw.project,
          harness: raw.harness,
          kind: raw.kind,
          mode: raw.mode,
          yolo: raw.yolo,
          tasktmp: raw.tasktmp,
          model: raw.model,
          effort: raw.effort,
          busyGen: raw.busy_gen,
          raw,
          mtimeMs: stat.mtimeMs,
        });
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // State directory doesn't exist or isn't readable
  }
  return result;
}

function readStatusFiles(): Map<string, TaskStatus> {
  const result = new Map<string, TaskStatus>();
  try {
    const dir = getStateDir();
    const files = readdirSync(dir);
    for (const file of files) {
      if (!file.endsWith(".status")) continue;
      const slug = file.slice(0, -7); // remove .status
      try {
        const filePath = join(dir, file);
        const content = readFileSync(filePath, "utf8");
        const lines = parseStatusFile(content);
        const stat = statSync(filePath);
        result.set(slug, {
          slug,
          latestStatus: deriveLatestStatus(lines),
          state: extractStateFromStatus(deriveLatestStatus(lines) ?? ""),
          lines,
          mtimeMs: stat.mtimeMs,
        });
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // State directory doesn't exist or isn't readable
  }
  return result;
}

/* ── Public API ── */

/**
 * Read all tasks from the Squad state directory.
 * Returns merged meta + status info for each task.
 */
export function readAllTasks(): TaskInfo[] {
  const metas = readMetaFiles();
  const statuses = readStatusFiles();

  // Collect all unique slugs
  const allSlugs = new Set([...metas.keys(), ...statuses.keys()]);
  const tasks: TaskInfo[] = [];

  for (const slug of allSlugs) {
    const meta = metas.get(slug);
    const status = statuses.get(slug);
    const statusLines = status?.lines ?? [];
    const displayState = deriveState(statusLines);
    const latestStatus = status?.latestStatus ?? "";

    // Elapsed time: from first status line timestamp or meta mtime
    const baseTime = meta?.mtimeMs ?? status?.mtimeMs ?? Date.now();
    const elapsedMs = Date.now() - baseTime;

    tasks.push({
      slug,
      meta,
      status,
      displayState,
      elapsedMs,
      model: meta?.model ?? "—",
      project: shortProject(meta?.project),
    });
  }

  // Sort by most recently modified (descending)
  tasks.sort((a, b) => {
    const aTime = a.meta?.mtimeMs ?? a.status?.mtimeMs ?? 0;
    const bTime = b.meta?.mtimeMs ?? b.status?.mtimeMs ?? 0;
    return bTime - aTime;
  });

  return tasks;
}

/**
 * Get state icons for display.
 */
export function getStateIcon(state: TaskInfo["displayState"]): string {
  switch (state) {
    case "running": return "\u{F04B}"; // ▶ nerd icon
    case "parked": return "\u{F04C}"; // ⏸ nerd icon
    case "done": return "\u{F00C}"; // ✓ nerd icon
    case "failed": return "\u{F00D}"; // ✗ nerd icon
    case "unknown": return "?";
  }
}

/**
 * Format elapsed time for display.
 */
export function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h${(minutes % 60).toString().padStart(2, "0")}m`;
}
