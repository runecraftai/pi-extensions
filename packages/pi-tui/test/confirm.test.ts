/**
 * Tests for pi-tui confirmation dialog (ui/confirm.ts).
 *
 * Tests the pure input handling logic and risk-level constants by importing
 * from source where possible, and validating the behavioral contract.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

/* ── Risk-level constants imported from source contract ── */

import { RISK_ICONS, RISK_LABELS, type RiskLevel } from "../extensions/pi-tui/ui/confirm.ts";
import { Key, matchesKey } from "@earendil-works/pi-tui";

/* ── Real ConfirmUi with mock theme ── */

import { ConfirmUi } from "../extensions/pi-tui/ui/confirm.ts";

function createUi() {
  const theme = {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
    bg: (_color: string, text: string) => text,
  };
  return new ConfirmUi(theme as any, { title: "Test", message: "Proceed?" });
}

/* ── Tests ── */

describe("Confirm Dialog", () => {
  describe("Risk levels", () => {
    it("has icons for all risk levels", () => {
      const levels: RiskLevel[] = ["low", "medium", "high"];
      for (const level of levels) {
        assert.equal(typeof RISK_ICONS[level], "string");
        assert.ok(RISK_ICONS[level].length > 0);
      }
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

  describe("Input handling via ConfirmUi", () => {
    it("confirms on 'y'", () => {
      const ui = createUi();
      ui.handleInput("y");
      assert.equal(ui.isClosed, true);
      assert.equal(ui.isConfirmed, true);
    });

    it("confirms on 'Y'", () => {
      const ui = createUi();
      ui.handleInput("Y");
      assert.equal(ui.isClosed, true);
      assert.equal(ui.isConfirmed, true);
    });

    it("confirms on Enter via matchesKey", () => {
      const ui = createUi();
      ui.handleInput(matchesKey("", Key.enter) ? "enter" : "\r");
      if (!ui.isClosed) {
        ui.handleInput("\r");
      }
      assert.equal(ui.isClosed, true);
      assert.equal(ui.isConfirmed, true);
    });

    it("cancels on 'n'", () => {
      const ui = createUi();
      ui.handleInput("n");
      assert.equal(ui.isClosed, true);
      assert.equal(ui.isConfirmed, false);
    });

    it("cancels on 'N'", () => {
      const ui = createUi();
      ui.handleInput("N");
      assert.equal(ui.isClosed, true);
      assert.equal(ui.isConfirmed, false);
    });

    it("cancels on Escape via matchesKey", () => {
      const ui = createUi();
      ui.handleInput(matchesKey("", Key.escape) ? "escape" : "\x1b");
      if (!ui.isClosed) {
        ui.handleInput("\x1b");
      }
      assert.equal(ui.isClosed, true);
      assert.equal(ui.isConfirmed, false);
    });

    it("ignores other keys", () => {
      const ui = createUi();
      ui.handleInput("a");
      assert.equal(ui.isClosed, false);
      ui.handleInput("1");
      assert.equal(ui.isClosed, false);
      ui.handleInput(" ");
      assert.equal(ui.isClosed, false);
    });

    it("ignores input after close", () => {
      const ui = createUi();
      ui.handleInput("y");
      assert.equal(ui.isClosed, true);
      ui.handleInput("n");
      assert.equal(ui.isConfirmed, true);
    });
  });
});
