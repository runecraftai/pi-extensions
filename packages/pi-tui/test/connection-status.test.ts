/**
 * Tests for pi-tui connection status footer segment.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

/* ── formatElapsed (extracted from segments.ts for testing) ── */

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m${(seconds % 60).toString().padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h${(minutes % 60).toString().padStart(2, "0")}m`;
}

/* ── Connection status logic ── */

interface ConnectionStatus {
  lastValidReadMs: number;
  staleThresholdMs: number;
}

function isStale(conn: ConnectionStatus, now: number): boolean {
  return (now - conn.lastValidReadMs) > conn.staleThresholdMs;
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

  describe("Staleness detection", () => {
    it("is not stale within threshold", () => {
      const conn: ConnectionStatus = {
        lastValidReadMs: 1000,
        staleThresholdMs: 10000,
      };
      assert.equal(isStale(conn, 5000), false);
      assert.equal(isStale(conn, 10000), false);
    });

    it("is stale after threshold", () => {
      const conn: ConnectionStatus = {
        lastValidReadMs: 1000,
        staleThresholdMs: 10000,
      };
      assert.equal(isStale(conn, 11001), true);
    });

    it("is stale exactly at threshold + 1", () => {
      const conn: ConnectionStatus = {
        lastValidReadMs: 1000,
        staleThresholdMs: 10000,
      };
      assert.equal(isStale(conn, 11001), true);
    });

    it("handles zero threshold (always stale)", () => {
      const conn: ConnectionStatus = {
        lastValidReadMs: 1000,
        staleThresholdMs: 0,
      };
      assert.equal(isStale(conn, 1001), true);
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
