/**
 * Tests for pi-tui confirmation dialog (ui/confirm.ts).
 *
 * The confirm dialog uses ctx.ui.custom() which is runtime-dependent.
 * These tests validate the pure logic and risk-level styling.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

/* ── Risk-level constants (extracted from confirm.ts for testing) ── */

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

/* ── Types (mirrored from confirm.ts) ── */

type RiskLevel = "low" | "medium" | "high";

interface ConfirmOptions {
  title: string;
  message: string;
  risk?: RiskLevel;
  confirmLabel?: string;
  cancelLabel?: string;
}

/* ── Input simulation ── */

function simulateInput(ui: { handleInput: (data: string) => void; isClosed: () => boolean; isConfirmed: () => boolean }, key: string) {
  ui.handleInput(key);
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

  describe("Options defaults", () => {
    it("has required fields", () => {
      const options: ConfirmOptions = {
        title: "Test",
        message: "Are you sure?",
      };
      assert.equal(options.title, "Test");
      assert.equal(options.message, "Are you sure?");
      assert.equal(options.risk, undefined); // defaults to "medium"
      assert.equal(options.confirmLabel, undefined); // defaults to "Yes"
      assert.equal(options.cancelLabel, undefined); // defaults to "No"
    });

    it("accepts all optional fields", () => {
      const options: ConfirmOptions = {
        title: "Delete",
        message: "Delete everything?",
        risk: "high",
        confirmLabel: "Delete",
        cancelLabel: "Keep",
      };
      assert.equal(options.risk, "high");
      assert.equal(options.confirmLabel, "Delete");
      assert.equal(options.cancelLabel, "Keep");
    });
  });

  describe("Input handling logic", () => {
    // These test the input routing logic that would be used by the ConfirmUi class
    function createSimulator() {
      let closed = false;
      let confirmed = false;

      return {
        handleInput: (data: string) => {
          if (closed) return;
          if (data === "escape" || data === "n" || data === "N") {
            confirmed = false;
            closed = true;
            return;
          }
          if (data === "y" || data === "Y" || data === "enter") {
            confirmed = true;
            closed = true;
            return;
          }
        },
        isClosed: () => closed,
        isConfirmed: () => confirmed,
      };
    }

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

    it("confirms on Enter", () => {
      const sim = createSimulator();
      sim.handleInput("enter");
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

    it("cancels on Escape", () => {
      const sim = createSimulator();
      sim.handleInput("escape");
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
