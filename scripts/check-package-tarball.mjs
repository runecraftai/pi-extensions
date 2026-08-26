#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function isCodeFile(path) {
  return /\.(?:[cm]?js|ts)$/.test(path);
}

export function checkPackageTarball(root = process.cwd()) {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const extensions = manifest.pi?.extensions;
  if (!Array.isArray(extensions) || extensions.length === 0) {
    throw new Error(`${manifest.name} does not declare a Pi extension entrypoint`);
  }

  const [pack] = JSON.parse(
    execFileSync("npm", ["pack", "--dry-run", "--json"], {
      cwd: root,
      encoding: "utf8",
    }),
  );
  const files = pack?.files ?? [];

  for (const extension of extensions) {
    const entrypoint = extension.replace(/^\.\//, "").replace(/\/$/, "");
    const included = files.filter(({ path }) => path === entrypoint || path.startsWith(`${entrypoint}/`));
    if (!included.some(({ path }) => isCodeFile(path))) {
      throw new Error(`${manifest.name} entrypoint ${extension} is missing from its tarball`);
    }
  }

  return pack;
}

if (import.meta.url === `file://${process.argv[1]}`) checkPackageTarball();
