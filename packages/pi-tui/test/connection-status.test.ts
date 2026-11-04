/**
 * Tests for pi-tui connection status footer segment.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderConnectionStatus, formatElapsed } from "../extensions/pi-tui/footer/segments.ts";
import type { SegmentContext } from "../extensions/pi-tui/footer/segments.ts";

/* ── Mock helpers ── */

function createCtx(overrides?: Partial<SegmentContext>): SegmentContext {
  return {
    theme: {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
      bg: (_color: string, text: string) => text,
    } as any,
    cwd: "/tmp",
    width: 80,
    footerData: { getExtensionStatuses: () => new Map(), getGitBranch: () => undefined } as any,
    config: {
      git: { showBranch: false, showStatus: false, showCommit: false } as any,
      context: { showBar: false, showCompact: false } as any,
      tokens: { showInput: false, showOutput: false, showCache: false } as any,
      telemetry: {} as any,
      connectionStatus: { enabled: true, stalenessThresholdMs: 10_000 },
    },
    ...overrides,
  };
}

let nowMs = 1_000_000;
const OrigDateNow = Date.now;

function freezeNow(ms: number) {
  nowMs = ms;
  Date.now = () => nowMs;
}

function restoreNow() {
  Date.now = OrigDateNow;
}

/* ── Tests ── */

describe("Connection Status", () => {
  describe("formatElapsed", () => {
    it("formats seconds", () => {
      assert.equal(formatElapsed(0), "0s");
      assert.equal(formatElapsed(5000), "5s");
      assert.equal(formatElapsed(59000), "59s");
    });

    it("formats minutes", () => {
      assert.equal(formatElapsed(60000), "1m00s");
      assert.equal(formatElapsed(90000), "1m30s");
      assert.equal(formatElapsed(3599000), "59m59s");
    });

    it("formats hours", () => {
      assert.equal(formatElapsed(3600000), "1h00m");
      assert.equal(formatElapsed(5400000), "1h30m");
    });
  });

  describe("renderConnectionStatus", () => {
    it("returns empty when no connectionStatus in context", () => {
      const ctx = createCtx({ connectionStatus: undefined });
      assert.equal(renderConnectionStatus(ctx), "");
    });

    it("renders fresh when within threshold", () => {
      freezeNow(1_000_000);
      try {
        const ctx = createCtx({
          connectionStatus: { lastValidReadMs: 990_000, staleThresholdMs: 100_000 },
        });
        const result = renderConnectionStatus(ctx);
        assert.ok(result.includes("fresh"));
        assert.ok(!result.includes("stale"));
      } finally {
        restoreNow();
      }
    });

    it("renders stale when past threshold", () => {
      freezeNow(2_000_000);
      try {
        const ctx = createCtx({
          connectionStatus: { lastValidReadMs: 1_000_000, staleThresholdMs: 10_000 },
        });
        const result = renderConnectionStatus(ctx);
        assert.ok(result.includes("stale"));
        assert.ok(!result.includes("fresh"));
      } finally {
        restoreNow();
      }
    });

    it("stale at threshold + 1 ms", () => {
      freezeNow(1_010_001);
      try {
        const ctx = createCtx({
          connectionStatus: { lastValidReadMs: 1_000_000, staleThresholdMs: 10_000 },
        });
        const result = renderConnectionStatus(ctx);
        assert.ok(result.includes("stale"));
      } finally {
        restoreNow();
      }
    });

    it("fresh at exactly threshold (not stale)", () => {
      freezeNow(1_010_000);
      try {
        const ctx = createCtx({
          connectionStatus: { lastValidReadMs: 1_000_000, staleThresholdMs: 10_000 },
        });
        const result = renderConnectionStatus(ctx);
        assert.ok(result.includes("fresh"));
      } finally {
        restoreNow();
      }
    });

    it("handles zero threshold (always stale)", () => {
      freezeNow(1_000_001);
      try {
        const ctx = createCtx({
          connectionStatus: { lastValidReadMs: 1_000_000, staleThresholdMs: 0 },
        });
        const result = renderConnectionStatus(ctx);
        assert.ok(result.includes("stale"));
      } finally {
        restoreNow();
      }
    });
  });

  describe("Config defaults", () => {
    it("default connectionStatus config has correct shape", () => {
      const config = {
        enabled: false,
        stalenessThresholdMs: 10_000,
      };
      assert.equal(config.enabled, false);
      assert.equal(config.stalenessThresholdMs, 10000);
    });
  });
});
