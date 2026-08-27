import test from "node:test";
import assert from "node:assert/strict";
import {
  determineBump,
  getPublishablePackages,
  parseCommitLog,
  shouldSkipReleaseCommit,
} from "../scripts/generate-changesets.mjs";

test("release commits do not generate another changeset", () => {
  assert.equal(shouldSkipReleaseCommit("chore: version packages"), true);
  assert.equal(shouldSkipReleaseCommit("feat(pi-tui): update"), false);
});

test("conventional commit types map to independent semver bumps", () => {
  assert.equal(determineBump({ type: "feat" }), "minor");
  assert.equal(determineBump({ type: "fix" }), "patch");
  assert.equal(determineBump({ type: "fix", breaking: true }), "major");
});

test("publishable packages are selected deterministically", () => {
  assert.deepEqual(
    getPublishablePackages().map((pkg) => pkg.name),
    ["@runecraft/graphify-pi", "@runecraftai/pi-tui"],
  );
});

test("multiline breaking footers produce major bumps", () => {
  const [commit] = parseCommitLog(
    "abc123\0fix(pi-tui): correct rendering\0\nBREAKING CHANGE: update the extension API\0",
  );
  assert.equal(determineBump(commit.parsed), "major");
});
