#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function getPublishablePackages(root = process.cwd()) {
  return readdirSync(join(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, "packages", entry.name, "package.json"))
    .filter(existsSync)
    .map((file) => JSON.parse(readFileSync(file, "utf8")))
    .filter((pkg) => !pkg.private && ["@runecraft/pi-tui", "@runecraft/graphify-pi"].includes(pkg.name));
}

export function publish(root = process.cwd()) {
  for (const pkg of getPublishablePackages(root)) {
    try {
      execFileSync("npm", ["view", `${pkg.name}@${pkg.version}`, "version"], { cwd: root, stdio: "ignore" });
      console.log(`Skipping ${pkg.name}@${pkg.version}: already published`);
      continue;
    } catch {}
    console.log(`Publishing ${pkg.name}@${pkg.version}`);
    execFileSync("npm", ["publish", "--provenance", "--access", "public"], { cwd: join(root, "packages", pkg.name.split("/").pop()), stdio: "inherit" });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) publish();
