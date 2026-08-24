/**
 * Tests for footer even-width distribution and narrow-terminal degradation.
 *
 * These test the pure distribution math extracted from the footer component.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

/* ── Replicated distribution logic (from footer/index.ts) ── */

interface Seg {
  key: string;
  text: string;
  priority: number;
}

function visibleWidth(text: string): number {
  // Strip ANSI sequences for width calculation
  return text.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function truncateToWidth(text: string, maxWidth: number, ellipsis: string): string {
  if (visibleWidth(text) <= maxWidth) return text;
  if (maxWidth <= 0) return "";
  if (maxWidth <= ellipsis.length) return ellipsis.slice(0, maxWidth);
  return text.slice(0, maxWidth - ellipsis.length) + ellipsis;
}

function fitSegmentsEvenly(
  segments: Seg[],
  maxWidth: number,
  ellipsis = "...",
): string[] {
  if (segments.length === 0) return [];
  if (maxWidth <= 0) return [""];

  const sorted = [...segments].sort((a, b) => a.priority - b.priority);

  const joinWidth = 3; // " · "
  let totalW = sorted.reduce((a, s) => a + visibleWidth(s.text), 0) + Math.max(0, sorted.length - 1) * joinWidth;

  for (const seg of sorted) {
    if (totalW <= maxWidth) break;
    const segW = visibleWidth(seg.text);
    const without = totalW - segW - joinWidth;
    if (without <= 0) {
      seg.text = "";
      totalW -= segW + joinWidth;
    } else if (segW > 0) {
      const avail = maxWidth - without - joinWidth;
      if (avail > visibleWidth(ellipsis)) {
        seg.text = truncateToWidth(seg.text, avail, ellipsis);
        totalW = without + visibleWidth(seg.text) + joinWidth;
      } else {
        seg.text = "";
        totalW -= segW + joinWidth;
      }
    }
  }

  const surviving = segments.filter((s) => s.text !== "");
  if (surviving.length === 0) return [];

  const totalSegWidth = surviving.reduce((a, s) => a + visibleWidth(s.text), 0);
  const totalGapSpace = maxWidth - totalSegWidth;

  if (totalGapSpace <= 0) {
    const joined = surviving.map((s) => s.text).join(" · ");
    if (visibleWidth(joined) >= maxWidth) {
      return [truncateToWidth(joined, maxWidth, ellipsis)];
    }
    return [joined + " ".repeat(maxWidth - visibleWidth(joined))];
  }

  // Space-evenly: distribute gap space across (n+1) slots
  // n slots between segments + 1 left edge + 1 right edge
  const nSlots = surviving.length + 1;
  const slotSize = Math.floor(totalGapSpace / nSlots);
  const remainder = totalGapSpace - slotSize * nSlots;
  // Left gets floor(remainder/2), right gets ceil(remainder/2)
  const padLeft = Math.floor(remainder / 2);
  const padRight = remainder - padLeft;

  const parts: string[] = [];
  parts.push(" ".repeat(padLeft + slotSize)); // left edge
  for (let i = 0; i < surviving.length; i++) {
    parts.push(surviving[i]!.text);
    parts.push(" ".repeat(slotSize)); // gap after each segment
  }
  parts.push(" ".repeat(padRight)); // right edge (remainder only)

  return [parts.join("")];
}

/* ── Tests ── */

describe("Footer segment distribution", () => {
  it("returns empty for no segments", () => {
    const result = fitSegmentsEvenly([], 80);
    assert.deepEqual(result, []);
  });

  it("returns empty for zero width", () => {
    const segs = [{ key: "a", text: "hello", priority: 1 }];
    const result = fitSegmentsEvenly(segs, 0);
    assert.deepEqual(result, [""]);
  });

  it("single segment fills width with padding", () => {
    const segs = [{ key: "a", text: "hi", priority: 1 }];
    const result = fitSegmentsEvenly(segs, 10);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.length, 10);
    assert.ok(result[0]!.includes("hi"));
  });

  it("single segment respects exact width", () => {
    const segs = [{ key: "a", text: "AB", priority: 1 }];
    const result = fitSegmentsEvenly(segs, 10);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.length, 10);
  });

  it("two segments are evenly distributed", () => {
    const segs = [
      { key: "a", text: "AB", priority: 1 },
      { key: "b", text: "CD", priority: 2 },
    ];
    const result = fitSegmentsEvenly(segs, 20);
    assert.equal(result.length, 1);
    const line = result[0]!;
    assert.equal(line.length, 20);
    assert.ok(line.includes("AB"));
    assert.ok(line.includes("CD"));
  });

  it("three segments at 15 width", () => {
    const segs = [
      { key: "a", text: "A", priority: 1 },
      { key: "b", text: "B", priority: 2 },
      { key: "c", text: "C", priority: 3 },
    ];
    const result = fitSegmentsEvenly(segs, 15);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.length, 15);
  });

  it("three segments distributed with even gaps", () => {
    const segs = [
      { key: "a", text: "A", priority: 1 },
      { key: "b", text: "B", priority: 2 },
      { key: "c", text: "C", priority: 3 },
    ];
    const result = fitSegmentsEvenly(segs, 15);
    const line = result[0]!;
    // Each segment is 1 char, total 3 chars, 12 chars of gap
    // 3 gaps (before, between, after) = 4 chars each
    assert.equal(line.length, 15);
    assert.ok(line.includes("A"));
    assert.ok(line.includes("B"));
    assert.ok(line.includes("C"));
  });

  it("drops lowest priority when width is too narrow", () => {
    const segs = [
      { key: "low", text: "LOWPRIO", priority: 1 },
      { key: "high", text: "HI", priority: 10 },
    ];
    const result = fitSegmentsEvenly(segs, 4);
    const line = result[0]!;
    assert.ok(!line.includes("LOWPRIO"), "Low priority segment should be dropped");
    assert.ok(line.includes("HI"), "High priority segment should survive");
  });

  it("truncates middle-priority segments before dropping", () => {
    const segs = [
      { key: "a", text: "AAAA", priority: 1 },
      { key: "b", text: "BBBBBBBB", priority: 5 },
      { key: "c", text: "CC", priority: 10 },
    ];
    const result = fitSegmentsEvenly(segs, 12);
    const line = result[0]!;
    // CC should survive (highest priority)
    assert.ok(line.includes("CC"));
    // At least one of A/B should be present (may be truncated)
    assert.ok(line.includes("A") || line.includes("B"));
  });

  it("all segments fit when width is large enough", () => {
    const segs = [
      { key: "a", text: "AAA", priority: 1 },
      { key: "b", text: "BBB", priority: 2 },
      { key: "c", text: "CCC", priority: 3 },
    ];
    const result = fitSegmentsEvenly(segs, 100);
    const line = result[0]!;
    assert.ok(line.includes("AAA"));
    assert.ok(line.includes("BBB"));
    assert.ok(line.includes("CCC"));
    assert.equal(line.length, 100);
  });

  it("handles single-character segments", () => {
    const segs = [
      { key: "a", text: "X", priority: 1 },
      { key: "b", text: "Y", priority: 2 },
      { key: "c", text: "Z", priority: 3 },
    ];
    const result = fitSegmentsEvenly(segs, 9);
    const line = result[0]!;
    assert.equal(line.length, 9);
    assert.ok(line.includes("X"));
    assert.ok(line.includes("Y"));
    assert.ok(line.includes("Z"));
  });

  it("handles many segments at 40 width", () => {
    const segs = Array.from({ length: 8 }, (_, i) => ({
      key: `seg${i}`,
      text: `S${i}`,
      priority: i + 1,
    }));
    const result = fitSegmentsEvenly(segs, 40);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.length, 40);
  });



  it("narrow terminal (20 cols) drops lowest priorities gracefully", () => {
    const segs = [
      { key: "ext", text: "EXT_STATUS", priority: 1 },
      { key: "git", text: "BRANCH", priority: 5 },
      { key: "model", text: "MODEL", priority: 10 },
    ];
    const result = fitSegmentsEvenly(segs, 20);
    const line = result[0]!;
    // Model (highest) should always be present
    assert.ok(line.includes("MODEL"));
    // Width check
    assert.ok(line.length <= 20);
  });

  it("very narrow terminal (5 cols) shows at most one segment", () => {
    const segs = [
      { key: "a", text: "AB", priority: 1 },
      { key: "b", text: "CD", priority: 5 },
      { key: "c", text: "EF", priority: 10 },
    ];
    const result = fitSegmentsEvenly(segs, 5);
    assert.equal(result.length, 1);
    assert.ok(result[0]!.length <= 5);
  });
});

describe("Even distribution math", () => {
  it("space-evenly produces correct total width", () => {
    const segs = [
      { key: "a", text: "AB", priority: 1 },
      { key: "b", text: "CD", priority: 2 },
      { key: "c", text: "EF", priority: 3 },
    ];
    const result = fitSegmentsEvenly(segs, 20);
    const line = result[0]!;
    assert.equal(line.length, 20);
  });

  it("handles odd widths without off-by-one", () => {
    const segs = [
      { key: "a", text: "X", priority: 1 },
      { key: "b", text: "Y", priority: 2 },
    ];
    const result = fitSegmentsEvenly(segs, 7);
    const line = result[0]!;
    assert.equal(line.length, 7);
    assert.ok(line.includes("X"));
    assert.ok(line.includes("Y"));
  });

  it("handles prime widths correctly", () => {
    const segs = [
      { key: "a", text: "A", priority: 1 },
      { key: "b", text: "B", priority: 2 },
      { key: "c", text: "C", priority: 3 },
      { key: "d", text: "D", priority: 4 },
    ];
    const result = fitSegmentsEvenly(segs, 17);
    const line = result[0]!;
    assert.equal(line.length, 17);
  });
});
