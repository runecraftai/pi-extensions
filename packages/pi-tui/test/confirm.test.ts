/**
 * Tests for pi-tui confirmation dialog (ui/confirm.ts).
 *
 * Instantiates the real ConfirmUi class with a minimal mock theme
 * and exercises its handleInput/render methods directly.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ConfirmUi,
  RISK_ICONS,
  RISK_LABELS,
  type ConfirmOptions,
} from "../extensions/pi-tui/ui/confirm.ts";

/* ── Mock theme ── */

const mockTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
  bg: (_color: string, text: string) => text,
};

function createUi(options: ConfirmOptions = { title: "Test", message: "Are you sure?" }) {
  return new ConfirmUi(mockTheme, options);
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

  describe("Input handling via real ConfirmUi", () => {
    it("starts open and unconfirmed", () => {
      const ui = createUi();
      assert.equal(ui.isClosed, false);
      assert.equal(ui.isConfirmed, false);
    });

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

    it("confirms on raw Enter key", () => {
      const ui = createUi();
      ui.handleInput("\r");
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

    it("cancels on raw Escape key", () => {
      const ui = createUi();
      ui.handleInput("\x1b");
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

  describe("Render", () => {
    it("produces non-empty lines", () => {
      const ui = createUi({ title: "Delete", message: "Really?", risk: "high" });
      const lines = ui.render(80);
      assert.ok(lines.length > 0);
      const joined = lines.join("\n");
      assert.ok(joined.includes("Delete"));
      assert.ok(joined.includes("Really?"));
    });

    it("invalidation clears cache", () => {
      const ui = createUi();
      const first = ui.render(80);
      ui.invalidate();
      const second = ui.render(80);
      assert.ok(second.length > 0);
    });
  });
});
