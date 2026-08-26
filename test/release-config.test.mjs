import test from "node:test";
import assert from "node:assert/strict";
import { determineBump, shouldSkipReleaseCommit } from "../scripts/generate-changesets.mjs";
import { getPublishablePackages } from "../scripts/publish-packages.mjs";

test("release commits do not generate another changeset", () => {
  assert.equal(shouldSkipReleaseCommit("chore: version packages"), true);
  assert.equal(shouldSkipReleaseCommit("feat(pi-tui): update"), false);
});

test("conventional commit types map to independent semver bumps", () => {
  assert.equal(determineBump({ type: "feat" }), "minor");
  assert.equal(determineBump({ type: "fix" }), "patch");
  assert.equal(determineBump({ type: "fix", breaking: true }), "major");
});

test("publish helper selects only the two public packages", () => {
  assert.deepEqual(
    getPublishablePackages().map((pkg) => pkg.name),
    ["@runecraft/graphify-pi", "@runecraft/pi-tui"]
  );
});
