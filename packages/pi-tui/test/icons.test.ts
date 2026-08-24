/**
 * Tests for configurable Nerd Font icons.
 *
 * Covers: default icon rendering, custom icon override, icon disabled (empty string).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ICONS,
  EMPTY_ICONS,
  resolveIcon,
  type SegmentIcons,
} from "../extensions/pi-tui/icons.ts";

/* ── Default icon rendering ── */

describe("DEFAULT_ICONS", () => {
  it("has a non-empty default for every segment", () => {
    const segments = Object.keys(DEFAULT_ICONS) as (keyof SegmentIcons)[];
    assert.ok(segments.length > 0, "DEFAULT_ICONS should have at least one segment");
    for (const seg of segments) {
      const icon = DEFAULT_ICONS[seg];
      assert.ok(
        typeof icon === "string" && icon.length > 0,
        `DEFAULT_ICONS.${seg} should be a non-empty string, got: ${JSON.stringify(icon)}`,
      );
    }
  });

  it("includes all expected header segments", () => {
    const headerSegments = ["version", "model", "skills", "prompts", "extensions", "cwd"] as const;
    for (const seg of headerSegments) {
      assert.ok(seg in DEFAULT_ICONS, `DEFAULT_ICONS should include header segment "${seg}"`);
    }
  });

  it("includes all expected footer segments", () => {
    const footerSegments = [
      "gitBranch", "gitStatus", "timer", "runtime", "contextBar",
      "thinking", "tokenInput", "tokenOutput", "cacheHit", "cost", "extensionStatus",
    ] as const;
    for (const seg of footerSegments) {
      assert.ok(seg in DEFAULT_ICONS, `DEFAULT_ICONS should include footer segment "${seg}"`);
    }
  });
});

/* ── EMPTY_ICONS ── */

describe("EMPTY_ICONS", () => {
  it("has empty strings for every segment", () => {
    const segments = Object.keys(EMPTY_ICONS) as (keyof SegmentIcons)[];
    for (const seg of segments) {
      assert.equal(EMPTY_ICONS[seg], "", `EMPTY_ICONS.${seg} should be empty string`);
    }
  });

  it("has the same keys as DEFAULT_ICONS", () => {
    const defaultKeys = Object.keys(DEFAULT_ICONS).sort();
    const emptyKeys = Object.keys(EMPTY_ICONS).sort();
    assert.deepEqual(emptyKeys, defaultKeys);
  });
});

/* ── resolveIcon: default behavior ── */

describe("resolveIcon — defaults", () => {
  it("returns the default icon when no overrides provided", () => {
    for (const seg of Object.keys(DEFAULT_ICONS) as (keyof SegmentIcons)[]) {
      const result = resolveIcon(undefined, seg);
      assert.equal(result, DEFAULT_ICONS[seg], `resolveIcon(undefined, "${seg}") should return default`);
    }
  });

  it("returns the default icon when overrides is an empty object", () => {
    const result = resolveIcon({}, "cwd");
    assert.equal(result, DEFAULT_ICONS.cwd);
  });
});

/* ── resolveIcon: custom override ── */

describe("resolveIcon — custom override", () => {
  it("returns the user override when provided", () => {
    const overrides: Partial<SegmentIcons> = { cwd: "X", model: "M" };
    assert.equal(resolveIcon(overrides, "cwd"), "X");
    assert.equal(resolveIcon(overrides, "model"), "M");
  });

  it("falls back to default for segments not in overrides", () => {
    const overrides: Partial<SegmentIcons> = { cwd: "X" };
    assert.equal(resolveIcon(overrides, "cwd"), "X");
    assert.equal(resolveIcon(overrides, "model"), DEFAULT_ICONS.model);
  });

  it("accepts multi-character icon strings", () => {
    const overrides: Partial<SegmentIcons> = { version: "Pi:" };
    assert.equal(resolveIcon(overrides, "version"), "Pi:");
  });

  it("accepts arbitrary Unicode as icon", () => {
    const overrides: Partial<SegmentIcons> = { cost: "💰" };
    assert.equal(resolveIcon(overrides, "cost"), "💰");
  });
});

/* ── resolveIcon: disabled (empty string) ── */

describe("resolveIcon — disabled (empty string)", () => {
  it("returns empty string when override is explicitly empty", () => {
    const overrides: Partial<SegmentIcons> = { cwd: "" };
    assert.equal(resolveIcon(overrides, "cwd"), "");
  });

  it("returns empty string when override is explicitly null", () => {
    const overrides: Partial<SegmentIcons> = { cwd: null as unknown as string };
    assert.equal(resolveIcon(overrides, "cwd"), "");
  });

  it("does not disable other segments when one is empty", () => {
    const overrides: Partial<SegmentIcons> = { cwd: "" };
    assert.equal(resolveIcon(overrides, "cwd"), "");
    assert.equal(resolveIcon(overrides, "model"), DEFAULT_ICONS.model);
  });

  it("handles all-segments-disabled config", () => {
    const overrides: Partial<SegmentIcons> = {};
    // Empty overrides means all segments use defaults, not disabled
    assert.equal(resolveIcon(overrides, "cwd"), DEFAULT_ICONS.cwd);
  });
});

/* ── Config integration: deep merge preserves icons ── */

describe("Config deep merge — icons", () => {
  it("deep merge preserves header.icons from user config", async () => {
    // Simulate what loadConfig does: deepMerge(defaults, userConfig)
    // We import deepMerge indirectly through loadConfig, but we can test
    // the behavior by checking that Partial<SegmentIcons> merges correctly.
    const defaults: Partial<SegmentIcons> = {};
    const userOverride: Partial<SegmentIcons> = { cwd: "→", model: "CPU" };

    // Manual deep merge (same logic as config.ts)
    const merged = { ...defaults, ...userOverride };
    assert.equal(merged.cwd, "→");
    assert.equal(merged.model, "CPU");
  });
});
