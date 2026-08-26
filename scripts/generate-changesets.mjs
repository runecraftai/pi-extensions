#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CommitParser } from "conventional-commits-parser";

export function shouldSkipReleaseCommit(subject) {
  return subject.startsWith("chore: version packages") || subject.includes("changeset-release/");
}

export function determineBump(commit) {
  if (commit.breaking || commit.type === "!" || commit.header?.includes("!:") || commit.body?.includes("BREAKING CHANGE:")) return "major";
  if (commit.type === "feat") return "minor";
  return "patch";
}

export function getPublishablePackages(root = process.cwd()) {
  const packagesDir = join(root, "packages");
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packagesDir, entry.name, "package.json"))
    .map((file) => JSON.parse(readFileSync(file, "utf8")))
    .filter((pkg) => !pkg.private && pkg.name?.startsWith("@runecraft/"));
}

function changedPackages(root, sha) {
  const files = execFileSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", sha], { cwd: root, encoding: "utf8" }).trim().split("\n");
  return getPublishablePackages(root)
    .filter((pkg) => files.some((file) => file.startsWith(`packages/${pkg.name.split("/").pop()}/`)))
    .map((pkg) => pkg.name);
}

function lastRelease(root) {
  try { return execFileSync("git", ["describe", "--tags", "--abbrev=0", "--match", "@runecraft/*@*"], { cwd: root, encoding: "utf8" }).trim(); } catch {}
  return execFileSync("git", ["rev-list", "--max-parents=0", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}

export function buildChangesetContent(changes) {
  return `---\n${[...changes].map(([name, bump]) => `"${name}": ${bump}`).join("\n")}\n---\n\nGenerated from conventional commits.\n`;
}

export function generate(root = process.cwd()) {
  const headSubject = execFileSync("git", ["log", "-1", "--format=%s"], { cwd: root, encoding: "utf8" }).trim();
  if (shouldSkipReleaseCommit(headSubject)) return new Map();
  const commits = execFileSync("git", ["log", "--format=%H|||%s|||%b", `${lastRelease(root)}..HEAD`], { cwd: root, encoding: "utf8" }).trim();
  const parser = new CommitParser();
  const changes = new Map();
  for (const line of commits ? commits.split("\n") : []) {
    const [sha, subject, body = ""] = line.split("|||");
    const parsed = parser.parse(`${subject}\n${body}`);
    if (!parsed.type || !["feat", "fix", "perf", "refactor"].includes(parsed.type)) continue;
    for (const name of changedPackages(root, sha)) {
      const bump = determineBump(parsed);
      const current = changes.get(name);
      if (!current || ["patch", "minor", "major"].indexOf(bump) > ["patch", "minor", "major"].indexOf(current)) changes.set(name, bump);
    }
  }
  if (changes.size) writeFileSync(join(root, ".changeset", `${randomUUID().slice(0, 8)}.md`), buildChangesetContent(changes));
  return changes;
}

if (import.meta.url === `file://${process.argv[1]}`) generate();
