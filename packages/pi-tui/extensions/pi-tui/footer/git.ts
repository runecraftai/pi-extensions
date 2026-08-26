/** Async git status fetching for the footer. */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 2000;

export interface GitCommitInfo {
  oid: string | null;
  detached: boolean;
  tag: string | null;
  subject: string | null;
}

export interface GitStatus {
  branch: string | undefined;
  ahead: number;
  behind: number;
  modified: number;
  untracked: number;
  staged: number;
  stashed: number;
  conflicted: number;
  renamed: number;
  deleted: number;
  commit: GitCommitInfo | null;
}

export function emptyGitStatus(): GitStatus {
  return {
    branch: undefined, ahead: 0, behind: 0, modified: 0, untracked: 0,
    staged: 0, stashed: 0, conflicted: 0, renamed: 0, deleted: 0, commit: null,
  };
}

async function gitExec(args: string[], cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 1024 * 1024,
    });
    return stdout;
  } catch {
    return null;
  }
}

export async function readGitStatus(
  cwd: string,
  options: { readCommit?: boolean; readTag?: boolean; readCounts?: boolean } = {},
): Promise<GitStatus> {
  const stdout = await gitExec(["status", "--porcelain=v1", "--branch", "--show-stash"], cwd);
  if (stdout === null) return emptyGitStatus();

  const status = emptyGitStatus();
  for (const line of stdout.split("\n")) {
    if (line.startsWith("## ")) {
      const branchPart = line.slice(3);
      if (branchPart.startsWith("HEAD (no branch)")) {
        status.commit = { oid: null, detached: true, tag: null, subject: null };
      } else {
        const branchMatch = branchPart.match(/^(\S+?)(?:\.\.\.(\S+))?(?:\s+\[(.+?)\])?$/);
        if (branchMatch) {
          status.branch = branchMatch[1];
          const trackingInfo = branchMatch[3] ?? "";
          const ahead = trackingInfo.match(/ahead (\d+)/)?.[1];
          const behind = trackingInfo.match(/behind (\d+)/)?.[1];
          if (ahead) status.ahead = Number(ahead);
          if (behind) status.behind = Number(behind);
        }
      }
      continue;
    }
    if (line.startsWith("# stash ")) {
      const count = Number.parseInt(line.slice(8).trim(), 10);
      if (!Number.isNaN(count)) status.stashed = count;
      continue;
    }
    if (options.readCounts === false || line.length < 3) continue;
    const x = line[0]!;
    const y = line[1]!;
    if (
      x === "U" || y === "U" || (x === "C" && y === "C") ||
      (x === "A" && y === "A") || (x === "D" && y === "D")
    ) status.conflicted++;
    else if (x === "?" && y === "?") status.untracked++;
    else if (x === "R") status.renamed++;
    else if (x === "D" || y === "D") status.deleted++;
    else {
      if (x !== " " && x !== "?") status.staged++;
      if (y === "M" || y === "D") status.modified++;
    }
  }

  if (options.readCounts !== false && status.stashed === 0 && !stdout.includes("# stash")) {
    const stashOut = await gitExec(["stash", "list"], cwd);
    if (stashOut !== null) status.stashed = stashOut.trim() ? stashOut.trim().split("\n").length : 0;
  }

  // Commit information is useful on normal branches too, not only detached HEADs.
  if (options.readCommit) {
    const oid = await gitExec(["rev-parse", "HEAD"], cwd);
    if (oid) {
      status.commit ??= { oid: null, detached: false, tag: null, subject: null };
      status.commit.oid = oid.trim();
    }
    const subject = await gitExec(["log", "-1", "--format=%s"], cwd);
    if (subject !== null) {
      status.commit ??= { oid: null, detached: false, tag: null, subject: null };
      status.commit.subject = subject.trim();
    }
    if (options.readTag) {
      const tag = await gitExec(["describe", "--tags", "--exact-match", "HEAD"], cwd);
      if (tag) {
        status.commit ??= { oid: null, detached: false, tag: null, subject: null };
        status.commit.tag = tag.trim();
      }
    }
  }
  return status;
}
