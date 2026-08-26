#!/usr/bin/env node
import { execFileSync } from "node:child_process";

export function publish(root = process.cwd()) {
  execFileSync("npx", ["--no-install", "changeset", "publish"], {
    cwd: root,
    stdio: "inherit",
  });
}

if (import.meta.url === `file://${process.argv[1]}`) publish();
