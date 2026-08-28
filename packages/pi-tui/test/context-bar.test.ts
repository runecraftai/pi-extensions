import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderContextBar, renderContextCompact } from "../extensions/pi-tui/footer/context-bar.ts";

const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };

describe("context bar", () => {
  it("renders smart, warm, and dumb zones", () => {
    assert.ok(renderContextBar(theme, 25, 25_000, 100_000, 40).includes("│"));
    assert.ok(renderContextBar(theme, 55, 55_000, 100_000, 40).includes("warm 45% left"));
    assert.ok(renderContextBar(theme, 80, 80_000, 100_000, 40).includes("dumb 20% left"));
  });

  it("supports compact output and invalid windows", () => {
    assert.equal(renderContextCompact(theme, 25), "🧠 25.0%");
    assert.equal(renderContextBar(theme, 20, 0, 0, 40), "");
  });
});
