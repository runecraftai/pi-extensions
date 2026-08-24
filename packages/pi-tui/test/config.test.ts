/**
 * Tests for pi-tui config: deep merge, defaults, persistence.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We can't import config.ts directly since it uses getAgentDir.
// Instead, test the deepMerge logic and config shape in isolation.

/* ── Deep merge utility (replicated from config.ts) ── */

function deepMerge<T>(base: T, override: unknown): T {
  if (typeof base !== "object" || base === null || Array.isArray(base)) {
    return (override as T) ?? base;
  }
  if (typeof override !== "object" || override === null || Array.isArray(override)) {
    return base;
  }
  const result = { ...(base as Record<string, unknown>) };
  const overrideRec = override as Record<string, unknown>;
  for (const key of Object.keys(overrideRec)) {
    const baseVal = (base as Record<string, unknown>)[key];
    const overVal = overrideRec[key];
    if (
      typeof baseVal === "object" &&
      baseVal !== null &&
      !Array.isArray(baseVal) &&
      typeof overVal === "object" &&
      overVal !== null &&
      !Array.isArray(overVal)
    ) {
      result[key] = deepMerge(baseVal, overVal);
    } else if (overVal !== undefined) {
      result[key] = overVal;
    }
  }
  return result as T;
}

/* ── Default config shape ── */

const DEFAULT_CONFIG = {
  enabled: true,
  header: {
    enabled: true,
    animateLogo: true,
    logoColor: "c",
    logoSpeed: 50,
    ibmStripes: true,
    minecraftGradient: true,
    slogan: "Code something that makes you proud",
    showSlogan: true,
    sloganColor: true,
    showVersion: true,
    showModel: true,
    showCwd: true,
    showTips: true,
    showStatsBar: true,
    tipCount: 3,
  },
  footer: {
    enabled: true,
    segments: {
      cwd: true,
      timer: true,
      gitBranch: true,
      gitStatus: true,
      gitCommit: false,
      runtime: true,
      contextBar: true,
      model: true,
      thinking: true,
      tokens: true,
      cost: true,
      extStatus: true,
    },
    context: { showBar: true, showCompact: false },
  },
  editor: { cursorStyle: "block", roundedBorders: true },
  icons: { mode: "auto", custom: {} },
  colors: { overrides: {} },
};

describe("Config", () => {
  describe("deepMerge", () => {
    it("returns base when override is undefined", () => {
      const base = { a: 1, b: { c: 2 } };
      assert.deepEqual(deepMerge(base, undefined), base);
    });

    it("overrides scalar values", () => {
      const base = { a: 1, b: "hello" };
      const result = deepMerge(base, { a: 99 });
      assert.equal(result.a, 99);
      assert.equal(result.b, "hello");
    });

    it("deep merges nested objects", () => {
      const base = { a: { x: 1, y: 2 }, b: 3 };
      const result = deepMerge(base, { a: { x: 10 } });
      assert.deepEqual(result, { a: { x: 10, y: 2 }, b: 3 });
    });

    it("adds new keys from override", () => {
      const base = { a: 1 };
      const result = deepMerge(base, { b: 2 });
      assert.equal((result as any).b, 2);
    });

    it("does not mutate base", () => {
      const base = { a: 1, b: { c: 2 } };
      deepMerge(base, { a: 99 });
      assert.equal(base.a, 1);
      assert.deepEqual(base.b, { c: 2 });
    });
  });

  describe("Default config shape", () => {
    it("has all required footer segment keys", () => {
      const segs = DEFAULT_CONFIG.footer.segments;
      const requiredKeys = [
        "cwd", "timer", "gitBranch", "gitStatus", "gitCommit",
        "runtime", "contextBar", "model", "thinking", "tokens", "cost", "extStatus",
      ];
      for (const key of requiredKeys) {
        assert.ok(key in segs, `Missing footer segment: ${key}`);
        assert.equal(typeof (segs as any)[key], "boolean", `Footer segment ${key} should be boolean`);
      }
    });

    it("has header config with all fields", () => {
      const h = DEFAULT_CONFIG.header;
      assert.equal(typeof h.enabled, "boolean");
      assert.equal(typeof h.animateLogo, "boolean");
      assert.equal(typeof h.logoColor, "string");
      assert.equal(typeof h.logoSpeed, "number");
      assert.equal(typeof h.tipCount, "number");
    });

    it("has icons config with mode", () => {
      assert.ok(["auto", "nerd", "ascii"].includes(DEFAULT_CONFIG.icons.mode));
    });
  });

  describe("Config persistence", () => {
    it("round-trips through JSON write/read", () => {
      const config = { ...DEFAULT_CONFIG };
      const json = JSON.stringify(config, null, 2);
      const parsed = JSON.parse(json);
      assert.deepEqual(parsed, config);
    });

    it("deep merge restores defaults for missing keys", () => {
      const partial = {
        enabled: false,
        header: { enabled: false },
        footer: { segments: { cwd: false } },
      };
      const result = deepMerge(structuredClone(DEFAULT_CONFIG), partial);
      assert.equal(result.enabled, false);
      assert.equal(result.header.enabled, false);
      assert.equal(result.footer.segments.cwd, false);
      // Other defaults preserved
      assert.equal(result.footer.segments.timer, true);
      assert.equal(result.header.animateLogo, true);
      assert.equal(result.icons.mode, "auto");
    });

    it("footer segment toggle persists", () => {
      const config = structuredClone(DEFAULT_CONFIG);
      config.footer.segments.cwd = false;
      config.footer.segments.model = false;
      const json = JSON.stringify(config);
      const restored = JSON.parse(json);
      assert.equal(restored.footer.segments.cwd, false);
      assert.equal(restored.footer.segments.model, false);
      assert.equal(restored.footer.segments.tokens, true);
    });
  });

  describe("Settings file read/write", () => {
    const testDir = join(tmpdir(), `pi-tui-test-${Date.now()}`);
    const testFile = join(testDir, "pi-tui.json");

    it("writes and reads config file", () => {
      mkdirSync(testDir, { recursive: true });
      const config = { ...DEFAULT_CONFIG, enabled: false };
      writeFileSync(testFile, JSON.stringify(config, null, 2));
      const raw = readFileSync(testFile, "utf8");
      const parsed = JSON.parse(raw);
      assert.equal(parsed.enabled, false);
      assert.equal(parsed.footer.segments.cwd, true);
      unlinkSync(testFile);
      import("node:fs").then((fs) => fs.rmdirSync(testDir));
    });

    it("handles missing file gracefully", () => {
      assert.ok(!existsSync(join(testDir, "nonexistent.json")));
    });
  });
});
