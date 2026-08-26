import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readGitStatus } from "../extensions/pi-tui/footer/git.ts";

const exec = promisify(execFile);

describe("async git status", () => {
  it("reads normal-branch commit and working-tree state", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "pi-tui-git-"));
    await exec("git", ["init", "-q"], { cwd });
    await exec("git", ["config", "user.email", "test@example.com"], { cwd });
    await exec("git", ["config", "user.name", "Test"], { cwd });
    await writeFile(join(cwd, "tracked.txt"), "before\n");
    await exec("git", ["add", "tracked.txt"], { cwd });
    await exec("git", ["commit", "-qm", "initial"], { cwd });
    await writeFile(join(cwd, "tracked.txt"), "after\n");
    await writeFile(join(cwd, "new.txt"), "new\n");

    const status = await readGitStatus(cwd, { readCommit: true, readCounts: true });
    assert.ok(status.branch);
    assert.ok(status.commit?.oid);
    assert.equal(status.modified, 1);
    assert.equal(status.untracked, 1);
  });

  it("degrades cleanly for a non-repository", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "pi-tui-git-"));
    assert.deepEqual(await readGitStatus(cwd), {
      branch: undefined, ahead: 0, behind: 0, modified: 0, untracked: 0,
      staged: 0, stashed: 0, conflicted: 0, renamed: 0, deleted: 0, commit: null,
    });
  });
});
