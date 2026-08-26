import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { packSegments, FOOTER_SEPARATOR } from "../extensions/pi-tui/footer/index.ts";
import { visibleWidth } from "@earendil-works/pi-tui";

const segment = (key: string, text: string, priority: number) => ({ key: key as any, text, priority });

describe("canonical footer packing", () => {
  it("keeps configured order when all segments fit", () => {
    const result = packSegments([
      segment("cwd", "CWD", 10),
      segment("model", "MODEL", 9),
      segment("extStatus", "STATUS", 3),
    ], 40);
    assert.equal(result, `CWD${FOOTER_SEPARATOR}MODEL${FOOTER_SEPARATOR}STATUS`);
  });

  it("drops lower-priority segments before higher-priority segments", () => {
    const result = packSegments([
      segment("extStatus", "STATUS", 1),
      segment("cwd", "CWD", 10),
      segment("model", "MODEL", 9),
    ], 9);
    assert.ok(result.includes("CWD"));
    assert.ok(!result.includes("STATUS"));
    assert.ok(visibleWidth(result) <= 9);
  });

  it("truncates a segment without exceeding the width", () => {
    const result = packSegments([segment("cwd", "a very long working directory", 10)], 8);
    assert.ok(visibleWidth(result) <= 8);
    assert.ok(result.includes("…"));
  });

  it("returns empty at zero width", () => {
    assert.equal(packSegments([segment("cwd", "CWD", 10)], 0), "");
  });
});
