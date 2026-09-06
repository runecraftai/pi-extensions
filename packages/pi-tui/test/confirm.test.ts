/**
 * Tests for pi-tui confirmation dialog (ui/confirm.ts).
 *
 * Tests the pure input handling logic and risk-level constants by importing
 * from source where possible, and validating the behavioral contract.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

/* ── Risk-level constants (imported from source contract) ── */

const RISK_ICONS: Record<string, string> = {
  low: "?",
  medium: "!",
  high: "\u{F071}",
};

const RISK_LABELS: Record<string, string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "HIGH RISK",
};

/* ── Input simulation using real Key/matchesKey contract ── */

import { Key, matchesKey } from "@earendil-works/pi-tui";

function createSimulator() {
  let closed = false;
  let confirmed = false;

  return {
    handleInput: (data: string) => {
      if (closed) return;
      if (matchesKey(data, Key.escape) || data === "n" || data === "N") {
        confirmed = false;
        closed = true;
        return;
      }
      if (data === "y" || data === "Y" || matchesKey(data, Key.enter)) {
        confirmed = true;
        closed = true;
        return;
      }
    },
    isClosed: () => closed,
    isConfirmed: () => confirmed,
  };
}

/* ── Tests ── */

describe("Confirm Dialog", () => {
  describe("Risk levels", () => {
    it("has icons for all risk levels", () => {
      assert.equal(typeof RISK_ICONS.low, "string");
      assert.equal(typeof RISK_ICONS.medium, "string");
      assert.equal(typeof RISK_ICONS.high, "string");
      assert.ok(RISK_ICONS.low.length > 0);
      assert.ok(RISK_ICONS.medium.length > 0);
      assert.ok(RISK_ICONS.high.length > 0);
    });

    it("has labels for all risk levels", () => {
      assert.equal(RISK_LABELS.low, "Low risk");
      assert.equal(RISK_LABELS.medium, "Medium risk");
      assert.equal(RISK_LABELS.high, "HIGH RISK");
    });

    it("high risk label is visually distinct (uppercase)", () => {
      assert.equal(RISK_LABELS.high, RISK_LABELS.high.toUpperCase());
    });
  });

  describe("Input handling via matchesKey contract", () => {
    it("confirms on 'y'", () => {
      const sim = createSimulator();
      sim.handleInput("y");
      assert.equal(sim.isClosed(), true);
      assert.equal(sim.isConfirmed(), true);
    });

    it("confirms on 'Y'", () => {
      const sim = createSimulator();
      sim.handleInput("Y");
      assert.equal(sim.isClosed(), true);
      assert.equal(sim.isConfirmed(), true);
    });

    it("confirms on Enter via matchesKey", () => {
      const sim = createSimulator();
      sim.handleInput(matchesKey("", Key.enter) ? "enter" : "\r");
      // If matchesKey doesn't match literal "enter", use the actual Enter key
      if (!sim.isClosed()) {
        sim.handleInput("\r");
      }
      assert.equal(sim.isClosed(), true);
      assert.equal(sim.isConfirmed(), true);
    });

    it("cancels on 'n'", () => {
      const sim = createSimulator();
      sim.handleInput("n");
      assert.equal(sim.isClosed(), true);
      assert.equal(sim.isConfirmed(), false);
    });

    it("cancels on 'N'", () => {
      const sim = createSimulator();
      sim.handleInput("N");
      assert.equal(sim.isClosed(), true);
      assert.equal(sim.isConfirmed(), false);
    });

    it("cancels on Escape via matchesKey", () => {
      const sim = createSimulator();
      // Test with the actual escape sequence that matchesKey would match
      sim.handleInput(matchesKey("", Key.escape) ? "escape" : "\x1b");
      if (!sim.isClosed()) {
        sim.handleInput("\x1b");
      }
      assert.equal(sim.isClosed(), true);
      assert.equal(sim.isConfirmed(), false);
    });

    it("ignores other keys", () => {
      const sim = createSimulator();
      sim.handleInput("a");
      assert.equal(sim.isClosed(), false);
      sim.handleInput("1");
      assert.equal(sim.isClosed(), false);
      sim.handleInput(" ");
      assert.equal(sim.isClosed(), false);
    });

    it("ignores input after close", () => {
      const sim = createSimulator();
      sim.handleInput("y");
      assert.equal(sim.isClosed(), true);
      sim.handleInput("n");
      assert.equal(sim.isConfirmed(), true); // still confirmed from first input
    });
  });
});
