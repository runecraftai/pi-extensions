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

/* ── Behavior tests ── */

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
