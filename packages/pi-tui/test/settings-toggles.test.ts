/**
 * Tests for settings toggle effects — verifying that toggling each
 * setting produces the expected config state.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

/* ── Config types and defaults (replicated from config.ts) ── */

interface FooterSegments {
  cwd: boolean;
  timer: boolean;
  gitBranch: boolean;
  gitStatus: boolean;
  gitCommit: boolean;
  runtime: boolean;
  contextBar: boolean;
  model: boolean;
  thinking: boolean;
  tokens: boolean;
  cost: boolean;
  extStatus: boolean;
}

type FooterSegmentKey = keyof FooterSegments;

interface PiTuiConfig {
  enabled: boolean;
  header: { enabled: boolean; animateLogo: boolean };
  footer: {
    enabled: boolean;
    segments: FooterSegments;
    context: { showBar: boolean; showCompact: boolean };
  };
  editor: { cursorStyle: "block" | "bar" | "underline" };
  icons: { mode: string };
}

const DEFAULT_CONFIG: PiTuiConfig = {
  enabled: true,
  header: { enabled: true, animateLogo: true },
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
  editor: { cursorStyle: "block" },
  icons: { mode: "auto" },
};

/* ── Toggle functions (replicated from settings-command.ts) ── */

function toggleEnabled(config: PiTuiConfig): PiTuiConfig {
  return { ...config, enabled: !config.enabled };
}

function toggleHeader(config: PiTuiConfig): PiTuiConfig {
  return { ...config, header: { ...config.header, enabled: !config.header.enabled } };
}

function toggleFooter(config: PiTuiConfig): PiTuiConfig {
  return { ...config, footer: { ...config.footer, enabled: !config.footer.enabled } };
}

function toggleFooterSegment(config: PiTuiConfig, key: FooterSegmentKey): PiTuiConfig {
  const segs = config.footer.segments;
  return { ...config, footer: { ...config.footer, segments: { ...segs, [key]: !segs[key] } } };
}

function cycleIconMode(config: PiTuiConfig): PiTuiConfig {
  const order = ["auto", "nerd", "ascii"];
  const idx = order.indexOf(config.icons.mode);
  return { ...config, icons: { ...config.icons, mode: order[(idx + 1) % order.length]! } };
}

function cycleCursorStyle(config: PiTuiConfig): PiTuiConfig {
  const order = ["block", "bar", "underline"];
  const idx = order.indexOf(config.editor.cursorStyle);
  return { ...config, editor: { ...config.editor, cursorStyle: order[(idx + 1) % order.length] as PiTuiConfig["editor"]["cursorStyle"] } };
}

function toggleShowBar(config: PiTuiConfig): PiTuiConfig {
  return { ...config, footer: { ...config.footer, context: { ...config.footer.context, showBar: !config.footer.context.showBar } } };
}

function toggleShowCompact(config: PiTuiConfig): PiTuiConfig {
  return { ...config, footer: { ...config.footer, context: { ...config.footer.context, showCompact: !config.footer.context.showCompact } } };
}

/* ── Tests ── */

describe("Settings toggles", () => {
  describe("General tab", () => {
    it("toggleEnabled flips enabled", () => {
      const config = structuredClone(DEFAULT_CONFIG);
      const toggled = toggleEnabled(config);
      assert.equal(toggled.enabled, false);
      const toggledBack = toggleEnabled(toggled);
      assert.equal(toggledBack.enabled, true);
    });

    it("toggleHeader flips header.enabled", () => {
      const config = structuredClone(DEFAULT_CONFIG);
      const toggled = toggleHeader(config);
      assert.equal(toggled.header.enabled, false);
      assert.equal(toggled.enabled, true);
    });

    it("toggleFooter flips footer.enabled", () => {
      const config = structuredClone(DEFAULT_CONFIG);
      const toggled = toggleFooter(config);
      assert.equal(toggled.footer.enabled, false);
    });
  });

  describe("Appearance tab", () => {
    it("cycleIconMode cycles through auto -> nerd -> ascii -> auto", () => {
      let config = structuredClone(DEFAULT_CONFIG);
      assert.equal(config.icons.mode, "auto");
      config = cycleIconMode(config);
      assert.equal(config.icons.mode, "nerd");
      config = cycleIconMode(config);
      assert.equal(config.icons.mode, "ascii");
      config = cycleIconMode(config);
      assert.equal(config.icons.mode, "auto");
    });

    it("cycleCursorStyle cycles through block -> bar -> underline -> block", () => {
      let config = structuredClone(DEFAULT_CONFIG);
      assert.equal(config.editor.cursorStyle, "block");
      config = cycleCursorStyle(config);
      assert.equal(config.editor.cursorStyle, "bar");
      config = cycleCursorStyle(config);
      assert.equal(config.editor.cursorStyle, "underline");
      config = cycleCursorStyle(config);
      assert.equal(config.editor.cursorStyle, "block");
    });

    it("toggleShowBar flips context.showBar", () => {
      const config = structuredClone(DEFAULT_CONFIG);
      const toggled = toggleShowBar(config);
      assert.equal(toggled.footer.context.showBar, false);
      assert.equal(toggled.footer.context.showCompact, false);
    });

    it("toggleShowCompact flips context.showCompact", () => {
      const config = structuredClone(DEFAULT_CONFIG);
      const toggled = toggleShowCompact(config);
      assert.equal(toggled.footer.context.showCompact, true);
    });
  });

  describe("Footer tab", () => {
    const allSegmentKeys: FooterSegmentKey[] = [
      "cwd", "timer", "gitBranch", "gitStatus", "gitCommit",
      "runtime", "contextBar", "model", "thinking", "tokens", "cost", "extStatus",
    ];

    for (const key of allSegmentKeys) {
      it(`toggleFooterSegment("${key}") flips ${key}`, () => {
        const config = structuredClone(DEFAULT_CONFIG);
        const original = config.footer.segments[key];
        const toggled = toggleFooterSegment(config, key);
        assert.equal(toggled.footer.segments[key], !original);
        for (const other of allSegmentKeys) {
          if (other !== key) {
            assert.equal(toggled.footer.segments[other], config.footer.segments[other]);
          }
        }
      });
    }

    it("can toggle all segments", () => {
      let config = structuredClone(DEFAULT_CONFIG);
      for (const key of allSegmentKeys) {
        config = toggleFooterSegment(config, key);
      }
      for (const key of allSegmentKeys) {
        const expected = key === "gitCommit" ? true : false;
        assert.equal(config.footer.segments[key], expected, `${key} should be ${expected}`);
      }
    });

    it("double-toggle restores original state", () => {
      let config = structuredClone(DEFAULT_CONFIG);
      const original = { ...config.footer.segments };
      for (const key of allSegmentKeys) {
        config = toggleFooterSegment(config, key);
        config = toggleFooterSegment(config, key);
      }
      for (const key of allSegmentKeys) {
        assert.equal(config.footer.segments[key], original[key], `${key} should restore to ${original[key]}`);
      }
    });
  });

  describe("Immutability", () => {
    it("toggleEnabled does not mutate original", () => {
      const config = structuredClone(DEFAULT_CONFIG);
      const original = config.enabled;
      toggleEnabled(config);
      assert.equal(config.enabled, original);
    });

    it("toggleFooterSegment does not mutate original", () => {
      const config = structuredClone(DEFAULT_CONFIG);
      const original = { ...config.footer.segments };
      toggleFooterSegment(config, "cwd");
      assert.deepEqual(config.footer.segments, original);
    });

    it("cycleIconMode does not mutate original", () => {
      const config = structuredClone(DEFAULT_CONFIG);
      const original = config.icons.mode;
      cycleIconMode(config);
      assert.equal(config.icons.mode, original);
    });
  });
});
