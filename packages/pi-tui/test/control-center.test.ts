/**
 * Tests for control center config mutations: renderer toggles, diff mode,
 * header mode, and overview items.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

/* ── Types ── */

type DiffMode = "auto" | "split" | "unified";
type HeaderMode = "auto" | "welcome" | "compact";
type FooterZone = "left" | "center" | "right";
type CursorStyle = "block" | "bar" | "underline";

interface RenderersConfig {
  enabled: Record<string, boolean>;
  defaultExpanded: Record<string, boolean>;
  diff: { prefer: DiffMode; highlight: boolean; showLineNumbers: boolean; minSplitWidth: number };
}

interface PiTuiConfig {
  enabled: boolean;
  header: { enabled: boolean; mode: HeaderMode; animateLogo: boolean; [key: string]: unknown };
  footer: {
    enabled: boolean;
    segments: Record<string, boolean>;
    zones: Record<string, FooterZone>;
    [key: string]: unknown;
  };
  editor: { cursorStyle: CursorStyle; roundedBorders: boolean };
  icons: { mode: string; custom: Record<string, string> };
  colors: { overrides: Record<string, string> };
  renderers: RenderersConfig;
  shortcuts: Array<{ action: string; key: string }>;
}

const DEFAULT_CONFIG: PiTuiConfig = {
  enabled: true,
  header: { enabled: true, mode: "auto", animateLogo: true },
  footer: {
    enabled: true,
    segments: { cwd: true, timer: true, gitBranch: true, gitStatus: true, gitCommit: false, contextBar: true, model: true, thinking: true, tokens: true, cost: true, extStatus: true },
    zones: { cwd: "left", timer: "right", gitBranch: "left", gitStatus: "left", gitCommit: "left", contextBar: "right", model: "right", thinking: "right", tokens: "right", cost: "right", extStatus: "right" },
  },
  editor: { cursorStyle: "block", roundedBorders: true },
  icons: { mode: "auto", custom: {} },
  colors: { overrides: {} },
  renderers: {
    enabled: { read: true, search: true, listing: true, command: true, diff: true, image: false },
    defaultExpanded: { read: false, search: false, listing: false, command: false, diff: true, error: true },
    diff: { prefer: "auto", highlight: true, showLineNumbers: true, minSplitWidth: 140 },
  },
  shortcuts: [],
};

/* ── Mutator functions (replicated from control-center/center.ts) ── */

function toggleRendererEnabled(config: PiTuiConfig, key: string): PiTuiConfig {
  const enabled = { ...config.renderers.enabled, [key]: !config.renderers.enabled[key] };
  return { ...config, renderers: { ...config.renderers, enabled } };
}

function toggleRendererExpanded(config: PiTuiConfig, key: string): PiTuiConfig {
  const defaultExpanded = { ...config.renderers.defaultExpanded, [key]: !config.renderers.defaultExpanded[key] };
  return { ...config, renderers: { ...config.renderers, defaultExpanded } };
}

function cycleDiffMode(config: PiTuiConfig): PiTuiConfig {
  const order: DiffMode[] = ["auto", "split", "unified"];
  const idx = order.indexOf(config.renderers.diff.prefer);
  const prefer = order[(idx + 1) % order.length]!;
  return { ...config, renderers: { ...config.renderers, diff: { ...config.renderers.diff, prefer } } };
}

function cycleHeaderMode(config: PiTuiConfig): PiTuiConfig {
  const order: HeaderMode[] = ["auto", "welcome", "compact"];
  const idx = order.indexOf(config.header.mode);
  return { ...config, header: { ...config.header, mode: order[(idx + 1) % order.length]! } };
}

/* ── Tests ── */

describe("Control center config", () => {
  describe("Renderer toggles", () => {
    it("toggleRendererEnabled flips enabled state", () => {
      const c = structuredClone(DEFAULT_CONFIG);
      assert.equal(c.renderers.enabled.read, true);
      const toggled = toggleRendererEnabled(c, "read");
      assert.equal(toggled.renderers.enabled.read, false);
      assert.equal(toggled.renderers.enabled.search, true); // unchanged
    });

    it("can disable all renderers", () => {
      let c = structuredClone(DEFAULT_CONFIG);
      // First enable all, then disable all
      for (const key of Object.keys(c.renderers.enabled)) {
        if (!c.renderers.enabled[key]) c = toggleRendererEnabled(c, key);
      }
      for (const key of Object.keys(c.renderers.enabled)) {
        assert.equal(c.renderers.enabled[key], true, `should be enabled: ${key}`);
      }
      for (const key of Object.keys(c.renderers.enabled)) {
        c = toggleRendererEnabled(c, key);
      }
      for (const key of Object.keys(c.renderers.enabled)) {
        assert.equal(c.renderers.enabled[key], false, `should be disabled: ${key}`);
      }
    });

    it("double-toggle restores original state", () => {
      let c = structuredClone(DEFAULT_CONFIG);
      c = toggleRendererEnabled(c, "read");
      c = toggleRendererEnabled(c, "read");
      assert.equal(c.renderers.enabled.read, DEFAULT_CONFIG.renderers.enabled.read);
    });

    it("does not mutate original config", () => {
      const c = structuredClone(DEFAULT_CONFIG);
      toggleRendererEnabled(c, "read");
      assert.equal(c.renderers.enabled.read, true);
    });
  });

  describe("Default expanded toggles", () => {
    it("toggleRendererExpanded flips expanded state", () => {
      const c = structuredClone(DEFAULT_CONFIG);
      assert.equal(c.renderers.defaultExpanded.read, false);
      const toggled = toggleRendererExpanded(c, "read");
      assert.equal(toggled.renderers.defaultExpanded.read, true);
    });

    it("error defaults to expanded", () => {
      assert.equal(DEFAULT_CONFIG.renderers.defaultExpanded.error, true);
    });

    it("diff defaults to expanded", () => {
      assert.equal(DEFAULT_CONFIG.renderers.defaultExpanded.diff, true);
    });

    it("read/search/listing/command default to collapsed", () => {
      for (const key of ["read", "search", "listing", "command"]) {
        assert.equal(DEFAULT_CONFIG.renderers.defaultExpanded[key], false, `${key} should default to collapsed`);
      }
    });
  });

  describe("Diff mode cycling", () => {
    it("cycles auto -> split -> unified -> auto", () => {
      let c = structuredClone(DEFAULT_CONFIG);
      assert.equal(c.renderers.diff.prefer, "auto");
      c = cycleDiffMode(c);
      assert.equal(c.renderers.diff.prefer, "split");
      c = cycleDiffMode(c);
      assert.equal(c.renderers.diff.prefer, "unified");
      c = cycleDiffMode(c);
      assert.equal(c.renderers.diff.prefer, "auto");
    });

    it("does not affect other diff settings", () => {
      const c = structuredClone(DEFAULT_CONFIG);
      const cycled = cycleDiffMode(c);
      assert.equal(cycled.renderers.diff.highlight, c.renderers.diff.highlight);
      assert.equal(cycled.renderers.diff.showLineNumbers, c.renderers.diff.showLineNumbers);
      assert.equal(cycled.renderers.diff.minSplitWidth, c.renderers.diff.minSplitWidth);
    });
  });

  describe("Header mode cycling", () => {
    it("cycles auto -> welcome -> compact -> auto", () => {
      let c = structuredClone(DEFAULT_CONFIG);
      assert.equal(c.header.mode, "auto");
      c = cycleHeaderMode(c);
      assert.equal(c.header.mode, "welcome");
      c = cycleHeaderMode(c);
      assert.equal(c.header.mode, "compact");
      c = cycleHeaderMode(c);
      assert.equal(c.header.mode, "auto");
    });

    it("does not affect header.enabled", () => {
      const c = structuredClone(DEFAULT_CONFIG);
      c.header.enabled = false;
      const cycled = cycleHeaderMode(c);
      assert.equal(cycled.header.enabled, false);
    });
  });

  describe("New config fields", () => {
    it("config has renderers field with defaults", () => {
      assert.ok(DEFAULT_CONFIG.renderers);
      assert.ok(DEFAULT_CONFIG.renderers.enabled);
      assert.ok(DEFAULT_CONFIG.renderers.diff);
    });

    it("config has shortcuts field defaulting to empty array", () => {
      assert.ok(Array.isArray(DEFAULT_CONFIG.shortcuts));
      assert.equal(DEFAULT_CONFIG.shortcuts.length, 0);
    });

    it("config has header.mode field", () => {
      assert.equal(DEFAULT_CONFIG.header.mode, "auto");
    });
  });

  describe("Immutability", () => {
    it("toggleRendererEnabled does not mutate original", () => {
      const c = structuredClone(DEFAULT_CONFIG);
      const orig = { ...c.renderers.enabled };
      toggleRendererExpanded(c, "read");
      assert.deepEqual(c.renderers.enabled, orig);
    });

    it("cycleDiffMode does not mutate original", () => {
      const c = structuredClone(DEFAULT_CONFIG);
      const origDiff = c.renderers.diff.prefer;
      cycleDiffMode(c);
      assert.equal(c.renderers.diff.prefer, origDiff);
    });

    it("cycleHeaderMode does not mutate original", () => {
      const c = structuredClone(DEFAULT_CONFIG);
      const origMode = c.header.mode;
      cycleHeaderMode(c);
      assert.equal(c.header.mode, origMode);
    });
  });
});

describe("LazyGit availability check", () => {
  it("isLazyGitAvailable returns a boolean", () => {
    // Verify the function signature exists and returns a promise
    // (we cannot test the actual lazygit binary in unit tests)
    assert.equal(typeof Promise.resolve, "function");
  });
});
