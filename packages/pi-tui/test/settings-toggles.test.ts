/**
 * Tests for settings toggle effects and zone cycling.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

/* ── Types ── */

type FooterZone = "left" | "center" | "right";

interface FooterSegments {
  cwd: boolean; timer: boolean; gitBranch: boolean; gitStatus: boolean;
  gitCommit: boolean; runtime: boolean; contextBar: boolean; model: boolean;
  thinking: boolean; tokens: boolean; cost: boolean; extStatus: boolean;
}
type FooterSegmentKey = keyof FooterSegments;

interface FooterZoneConfig extends Record<FooterSegmentKey, FooterZone> {}

interface PiTuiConfig {
  enabled: boolean;
  header: { enabled: boolean; animateLogo: boolean };
  footer: {
    enabled: boolean;
    segments: FooterSegments;
    zones: FooterZoneConfig;
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
      cwd: true, timer: true, gitBranch: true, gitStatus: true, gitCommit: false,
      runtime: true, contextBar: true, model: true, thinking: true,
      tokens: true, cost: true, extStatus: true,
    },
    zones: {
      cwd: "left", timer: "left", gitBranch: "left", gitStatus: "left",
      gitCommit: "left", runtime: "left", contextBar: "center",
      model: "right", thinking: "right", tokens: "right", cost: "right", extStatus: "right",
    },
    context: { showBar: true, showCompact: false },
  },
  editor: { cursorStyle: "block" },
  icons: { mode: "auto" },
};

/* ── Toggle functions ── */

function toggleEnabled(c: PiTuiConfig): PiTuiConfig { return { ...c, enabled: !c.enabled }; }
function toggleHeader(c: PiTuiConfig): PiTuiConfig { return { ...c, header: { ...c.header, enabled: !c.header.enabled } }; }
function toggleFooter(c: PiTuiConfig): PiTuiConfig { return { ...c, footer: { ...c.footer, enabled: !c.footer.enabled } }; }

function toggleFooterSegment(c: PiTuiConfig, key: FooterSegmentKey): PiTuiConfig {
  const s = c.footer.segments;
  return { ...c, footer: { ...c.footer, segments: { ...s, [key]: !s[key] } } };
}

function cycleFooterZone(c: PiTuiConfig, key: FooterSegmentKey): PiTuiConfig {
  const order: FooterZone[] = ["left", "center", "right"];
  const zones = c.footer.zones;
  const current = zones[key] ?? "left";
  const next = order[(order.indexOf(current) + 1) % order.length]!;
  return { ...c, footer: { ...c.footer, zones: { ...zones, [key]: next } } };
}

function cycleIconMode(c: PiTuiConfig): PiTuiConfig {
  const order = ["auto", "nerd", "ascii"];
  const idx = order.indexOf(c.icons.mode);
  return { ...c, icons: { ...c.icons, mode: order[(idx + 1) % order.length]! } };
}

function cycleCursorStyle(c: PiTuiConfig): PiTuiConfig {
  const order = ["block", "bar", "underline"];
  const idx = order.indexOf(c.editor.cursorStyle);
  return { ...c, editor: { ...c.editor, cursorStyle: order[(idx + 1) % order.length] as PiTuiConfig["editor"]["cursorStyle"] } };
}

function toggleShowBar(c: PiTuiConfig): PiTuiConfig {
  return { ...c, footer: { ...c.footer, context: { ...c.footer.context, showBar: !c.footer.context.showBar } } };
}

function toggleShowCompact(c: PiTuiConfig): PiTuiConfig {
  return { ...c, footer: { ...c.footer, context: { ...c.footer.context, showCompact: !c.footer.context.showCompact } } };
}

/* ── Tests ── */

describe("Settings toggles", () => {
  describe("General tab", () => {
    it("toggleEnabled flips enabled", () => {
      const c = structuredClone(DEFAULT_CONFIG);
      assert.equal(toggleEnabled(c).enabled, false);
      assert.equal(toggleEnabled(toggleEnabled(c)).enabled, true);
    });

    it("toggleHeader flips header.enabled", () => {
      const c = structuredClone(DEFAULT_CONFIG);
      assert.equal(toggleHeader(c).header.enabled, false);
      assert.equal(toggleHeader(c).enabled, true);
    });

    it("toggleFooter flips footer.enabled", () => {
      assert.equal(toggleFooter(structuredClone(DEFAULT_CONFIG)).footer.enabled, false);
    });
  });

  describe("Appearance tab", () => {
    it("cycleIconMode cycles auto -> nerd -> ascii -> auto", () => {
      let c = structuredClone(DEFAULT_CONFIG);
      assert.equal(c.icons.mode, "auto");
      c = cycleIconMode(c); assert.equal(c.icons.mode, "nerd");
      c = cycleIconMode(c); assert.equal(c.icons.mode, "ascii");
      c = cycleIconMode(c); assert.equal(c.icons.mode, "auto");
    });

    it("cycleCursorStyle cycles block -> bar -> underline -> block", () => {
      let c = structuredClone(DEFAULT_CONFIG);
      assert.equal(c.editor.cursorStyle, "block");
      c = cycleCursorStyle(c); assert.equal(c.editor.cursorStyle, "bar");
      c = cycleCursorStyle(c); assert.equal(c.editor.cursorStyle, "underline");
      c = cycleCursorStyle(c); assert.equal(c.editor.cursorStyle, "block");
    });

    it("toggleShowBar flips context.showBar", () => {
      const c = toggleShowBar(structuredClone(DEFAULT_CONFIG));
      assert.equal(c.footer.context.showBar, false);
      assert.equal(c.footer.context.showCompact, false);
    });

    it("toggleShowCompact flips context.showCompact", () => {
      assert.equal(toggleShowCompact(structuredClone(DEFAULT_CONFIG)).footer.context.showCompact, true);
    });
  });

  const allKeys: FooterSegmentKey[] = [
    "cwd", "timer", "gitBranch", "gitStatus", "gitCommit",
    "runtime", "contextBar", "model", "thinking", "tokens", "cost", "extStatus",
  ];

  describe("Footer tab", () => {

    for (const key of allKeys) {
      it(`toggleFooterSegment("${key}") flips ${key}`, () => {
        const c = structuredClone(DEFAULT_CONFIG);
        const orig = c.footer.segments[key];
        const toggled = toggleFooterSegment(c, key);
        assert.equal(toggled.footer.segments[key], !orig);
        for (const other of allKeys) {
          if (other !== key) assert.equal(toggled.footer.segments[other], c.footer.segments[other]);
        }
      });
    }

    it("can toggle all segments", () => {
      let c = structuredClone(DEFAULT_CONFIG);
      for (const key of allKeys) c = toggleFooterSegment(c, key);
      for (const key of allKeys) {
        const expected = key === "gitCommit" ? true : false;
        assert.equal(c.footer.segments[key], expected, `${key} should be ${expected}`);
      }
    });

    it("double-toggle restores original state", () => {
      let c = structuredClone(DEFAULT_CONFIG);
      const orig = { ...c.footer.segments };
      for (const key of allKeys) { c = toggleFooterSegment(c, key); c = toggleFooterSegment(c, key); }
      for (const key of allKeys) assert.equal(c.footer.segments[key], orig[key]);
    });
  });

  describe("Zone cycling", () => {
    for (const key of ["cwd", "model", "contextBar"] as FooterSegmentKey[]) {
      it(`cycleFooterZone("${key}") cycles left -> center -> right -> left`, () => {
        let c = structuredClone(DEFAULT_CONFIG);
        assert.equal(c.footer.zones[key], key === "contextBar" ? "center" : key === "model" ? "right" : "left");
        // Cycle until we get back to start
        const start = c.footer.zones[key];
        c = cycleFooterZone(c, key);
        assert.notEqual(c.footer.zones[key], start, "zone should change after one cycle");
        c = cycleFooterZone(c, key);
        c = cycleFooterZone(c, key);
        assert.equal(c.footer.zones[key], start, "zone should return to start after 3 cycles");
      });
    }

    it("zone cycling does not affect other segments", () => {
      const c = structuredClone(DEFAULT_CONFIG);
      const newC = cycleFooterZone(c, "cwd");
      for (const key of allKeys) {
        if (key !== "cwd") assert.equal(newC.footer.zones[key], c.footer.zones[key]);
      }
    });

    it("can assign all segments to same zone", () => {
      let c = structuredClone(DEFAULT_CONFIG);
      for (const key of allKeys) c = { ...c, footer: { ...c.footer, zones: { ...c.footer.zones, [key]: "center" as FooterZone } } };
      for (const key of allKeys) assert.equal(c.footer.zones[key], "center");
    });
  });

  describe("Immutability", () => {
    it("toggleEnabled does not mutate original", () => {
      const c = structuredClone(DEFAULT_CONFIG);
      toggleEnabled(c);
      assert.equal(c.enabled, true);
    });

    it("toggleFooterSegment does not mutate original", () => {
      const c = structuredClone(DEFAULT_CONFIG);
      const orig = { ...c.footer.segments };
      toggleFooterSegment(c, "cwd");
      assert.deepEqual(c.footer.segments, orig);
    });

    it("cycleFooterZone does not mutate original", () => {
      const c = structuredClone(DEFAULT_CONFIG);
      const orig = { ...c.footer.zones };
      cycleFooterZone(c, "cwd");
      assert.deepEqual(c.footer.zones, orig);
    });
  });
});
