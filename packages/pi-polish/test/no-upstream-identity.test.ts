import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
// Encoded so the test fixture itself doesn't reintroduce the prohibited
// identities into the product tree checked by the acquisition gate.
const forbidden = ["cHJpbmdsZWQ=", "VGhvbWFzIHZhbiBEb25nZW4="]
  .map((value) => Buffer.from(value, "base64").toString("utf8").toLowerCase());

function assertOwnedSurface(path: string, content: string) {
  for (const identity of forbidden) {
    assert.equal(content.toLowerCase().includes(identity), false, `Unowned identity in distributable ${path}`);
  }
}

test("npm distributable satisfies the Runecraft identity byte contract", () => {
  // This is deliberately a distributable-text ownership contract, not a proxy
  // for program behavior. Ask the real npm pack consumer what will ship, then
  // check every delivered surface, including executable sources and metadata.
  const packed = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: fileURLToPath(root), encoding: "utf8",
  });
  assert.ifError(packed.error);
  assert.equal(packed.status, 0, packed.stderr);
  const [artifact] = JSON.parse(packed.stdout);
  assert.equal(artifact.name, "@runecraft/pi-polish");
  const paths = artifact.files.map((file: { path: string }) => file.path);
  assert.ok(paths.includes("extensions/chrome.ts"));
  assert.ok(paths.includes("extensions/tools.ts"));
  assert.ok(paths.includes("extensions/command.ts"));
  assert.ok(paths.includes("LICENSE"));
  assert.equal(paths.some((path: string) => path.startsWith("node_modules/")), false);
  for (const path of paths) assertOwnedSurface(path, readFileSync(new URL(path, root), "utf8"));

  const manifest = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
  assert.equal(manifest.author, "Runecraft");
  assert.equal(manifest.license, "MIT");
  assert.deepEqual(manifest.repository, {
    type: "git", url: "git+https://github.com/runecraftai/pi-extensions.git", directory: "packages/pi-polish",
  });
  assert.deepEqual(manifest.pi.extensions, ["./extensions/tools.ts", "./extensions/chrome.ts"]);
  assert.equal(manifest.pi.image, undefined);
  assert.equal(manifest.funding, undefined);
  assert.equal(readFileSync(new URL("LICENSE", root), "utf8"), readFileSync(new URL("../../../LICENSE", import.meta.url), "utf8"));
});

test("identity guard rejects reintroduced author, output, and support URLs", () => {
  for (const identity of forbidden) {
    for (const output of [identity, `console.error("${identity}")`, `https://example.invalid/${identity.toUpperCase()}/support`]) {
      assert.throws(() => assertOwnedSurface("surface", output), /Unowned identity/);
    }
  }
});
