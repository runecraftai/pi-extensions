import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = new URL("../", import.meta.url);
const forbidden = ["YWxtb2dkZXBheg==", "cGktYXN5bmMtY29tcGFjdGlvbg==", "YXN0cmE=", "Y2hhdGdwdC5jb20="]
  .map(value => Buffer.from(value, "base64").toString("utf8"));

function owned(path: string, content: string) {
  const text = content.toLowerCase().replaceAll("pi-async-compaction-lite", "");
  for (const identity of forbidden) {
    assert.equal(text.includes(identity), false, `Unowned identity or remote mode in distributable ${path}`);
  }
}

test("npm distributable obeys the Runecraft identity byte contract", () => {
  const pack = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: fileURLToPath(root), encoding: "utf8",
  });
  assert.ifError(pack.error);
  assert.equal(pack.status, 0, pack.stderr);
  const [artifact] = JSON.parse(pack.stdout);
  assert.equal(artifact.name, "@runecraft/pi-async-compaction-lite");
  const paths = artifact.files.map((file: { path: string }) => file.path);
  assert.ok(paths.includes("src/index.ts"));
  assert.ok(paths.includes("src/core.ts"));
  for (const path of paths) owned(path, readFileSync(new URL(path, root), "utf8"));
  const manifest = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
  assert.equal(manifest.author, "Runecraft");
  assert.equal(manifest.license, "MIT");
  assert.equal(manifest.private, true, "Publication requires a separate decision");
  assert.deepEqual(manifest.pi.extensions, ["./src/index.ts"]);
  assert.deepEqual(Object.keys(manifest.exports), [".", "./core"]);
  for (const range of Object.values(manifest.peerDependencies)) assert.equal(range, ">=1.4.0 <1.5.0");
  assert.equal(readFileSync(new URL("LICENSE", root), "utf8"), readFileSync(new URL("../../../LICENSE", import.meta.url), "utf8"));
});

test("identity guard rejects an upstream name in output, imports, and support links", () => {
  for (const name of forbidden) {
    for (const surface of [`console.warn("${name}")`, `import "${name}"`, `https://example.invalid/${name}`]) {
      assert.throws(() => owned("source.ts", surface), /Unowned identity or remote mode/);
    }
  }
});
