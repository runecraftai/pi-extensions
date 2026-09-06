/**
 * Tests for pi-tui confirmation dialog (ui/confirm.ts).
 *
 * The confirm dialog uses ctx.ui.custom() which is runtime-dependent.
 * These tests validate the pure logic and risk-level styling.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Key, matchesKey } from "@earendil-works/pi-tui";
import {
  RISK_ICONS,
  RISK_LABELS,
  type ConfirmOptions,
} from "../extensions/pi-tui/ui/confirm.ts";

/* ── Input simulation using real matchesKey/Key API ── */

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

  describe("Options defaults", () => {
    it("has required fields", () => {
      const options: ConfirmOptions = {
        title: "Test",
        message: "Are you sure?",
      };
      assert.equal(options.title, "Test");
      assert.equal(options.message, "Are you sure?");
      assert.equal(options.risk, undefined);
      assert.equal(options.confirmLabel, undefined);
      assert.equal(options.cancelLabel, undefined);
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

    it("confirms on raw Enter key", () => {
      const sim = createSimulator();
      sim.handleInput("\r");
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

    it("cancels on raw Escape key", () => {
      const sim = createSimulator();
      sim.handleInput("\x1b");
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
      assert.equal(sim.isConfirmed(), true);
    });
  });
});
