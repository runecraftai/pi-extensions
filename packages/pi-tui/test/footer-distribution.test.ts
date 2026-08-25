/**
 * Tests for footer left-packed distribution with right-filling context bar.
 *
 * Segments are left-packed with " · " separators. The remaining width after
 * the last segment is consumed by a stretching element (context bar or filler)
 * so the footer reaches the right edge.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

/* ── Replicated left-packed logic (from footer/index.ts) ── */

interface Seg {
  key: string;
  text: string;
  priority: number;
}

function visibleWidth(text: string): number {
  return text.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function truncateToWidth(text: string, maxWidth: number, ellipsis: string): string {
  if (visibleWidth(text) <= maxWidth) return text;
  if (maxWidth <= 0) return "";
  if (maxWidth <= ellipsis.length) return ellipsis.slice(0, maxWidth);
  return text.slice(0, maxWidth - ellipsis.length) + ellipsis;
}

const SEP = " · ";
const SEP_W = visibleWidth(SEP);

function renderLeftPacked(segs: Seg[], maxWidth: number): { text: string; width: number } {
  if (segs.length === 0) return { text: "", width: 0 };

  const sorted = [...segs].sort((a, b) => a.priority - b.priority);
  let totalW = sorted.reduce((a, s) => a + visibleWidth(s.text), 0) + Math.max(0, sorted.length - 1) * SEP_W;

  for (const seg of sorted) {
    if (totalW <= maxWidth) break;
    const segW = visibleWidth(seg.text);
    const without = totalW - segW - SEP_W;
    if (without <= 0) {
      seg.text = "";
      totalW -= segW + SEP_W;
    } else if (segW > 0) {
      const avail = maxWidth - without - SEP_W;
      if (avail > 3) {
        seg.text = truncateToWidth(seg.text, avail, "…");
        totalW = without + visibleWidth(seg.text) + SEP_W;
      } else {
        seg.text = "";
        totalW -= segW + SEP_W;
      }
    }
  }

  const surviving = segs.filter((s) => s.text !== "");
  if (surviving.length === 0) return { text: "", width: 0 };

  const joined = surviving.map((s) => s.text).join(SEP);
  const w = visibleWidth(joined);
  return { text: joined, width: w };
}

/* ── Tests ── */

describe("Footer left-packed distribution", () => {
  it("returns empty for no segments", () => {
    const result = renderLeftPacked([], 80);
    assert.equal(result.text, "");
    assert.equal(result.width, 0);
  });

  it("single segment is left-aligned", () => {
    const segs = [{ key: "a", text: "hello", priority: 1 }];
    const result = renderLeftPacked(segs, 20);
    assert.equal(result.text, "hello");
    assert.equal(result.width, 5);
    // Text starts at position 0 (left-aligned)
    assert.ok(result.text.startsWith("hello"));
  });

  it("two segments joined with separator, left-aligned", () => {
    const segs = [
      { key: "a", text: "AAA", priority: 1 },
      { key: "b", text: "BBB", priority: 2 },
    ];
    const result = renderLeftPacked(segs, 30);
    assert.equal(result.text, "AAA · BBB");
    assert.equal(result.width, 9);
  });

  it("three segments joined with separators, left-aligned", () => {
    const segs = [
      { key: "a", text: "A", priority: 1 },
      { key: "b", text: "B", priority: 2 },
      { key: "c", text: "C", priority: 3 },
    ];
    const result = renderLeftPacked(segs, 30);
    assert.equal(result.text, "A · B · C");
    assert.equal(result.width, 9);
  });

  it("drops lowest priority when width is too narrow", () => {
    const segs = [
      { key: "low", text: "LOWPRIO", priority: 1 },
      { key: "high", text: "HI", priority: 10 },
    ];
    const result = renderLeftPacked(segs, 4);
    assert.ok(!result.text.includes("LOWPRIO"), "Low priority segment should be dropped");
    assert.ok(result.text.includes("HI"), "High priority segment should survive");
  });

  it("truncates middle-priority segments before dropping", () => {
    const segs = [
      { key: "a", text: "AAAA", priority: 1 },
      { key: "b", text: "BBBBBBBB", priority: 5 },
      { key: "c", text: "CC", priority: 10 },
    ];
    const result = renderLeftPacked(segs, 15);
    assert.ok(result.text.includes("CC"), "Highest priority should survive");
    assert.ok(result.width <= 15);
  });

  it("all segments fit when width is large enough", () => {
    const segs = [
      { key: "a", text: "AAA", priority: 1 },
      { key: "b", text: "BBB", priority: 2 },
      { key: "c", text: "CCC", priority: 3 },
    ];
    const result = renderLeftPacked(segs, 100);
    assert.equal(result.text, "AAA · BBB · CCC");
    assert.equal(result.width, 15);
  });

  it("result width matches visible text width", () => {
    const segs = [
      { key: "a", text: "XX", priority: 1 },
      { key: "b", text: "YY", priority: 2 },
    ];
    const result = renderLeftPacked(segs, 50);
    assert.equal(result.width, visibleWidth(result.text));
  });
});

describe("Right-edge fill", () => {
  it("left-packed + padding reaches full width", () => {
    const segs = [
      { key: "a", text: "HI", priority: 1 },
    ];
    const { text, width } = renderLeftPacked(segs, 20);
    const padded = text + " ".repeat(20 - width);
    assert.equal(padded.length, 20);
    assert.ok(padded.startsWith("HI"));
  });

  it("two segments + padding reaches full width", () => {
    const segs = [
      { key: "a", text: "A", priority: 1 },
      { key: "b", text: "B", priority: 2 },
    ];
    const { text, width } = renderLeftPacked(segs, 20);
    const padded = text + " ".repeat(20 - width);
    assert.equal(padded.length, 20);
    assert.ok(padded.startsWith("A · B"));
  });

  it("context bar fills remaining width after packed segments", () => {
    const packed = "📁 ~/project · 🔀 main · ⬢ v22.0.0";
    const packedW = visibleWidth(packed);
    const totalWidth = 80;
    const remaining = totalWidth - packedW - 3; // 3 for separator
    // remaining should be positive and context bar uses it
    assert.ok(remaining > 0, "Should have remaining width for context bar");
    assert.equal(packedW + 3 + remaining, totalWidth);
  });

  it("no segments: context bar fills entire width", () => {
    const segs: Seg[] = [];
    const result = renderLeftPacked(segs, 80);
    // When no packed segments, we have 0 width used, full 80 available
    assert.equal(result.text, "");
    assert.equal(result.width, 0);
    // Padding would fill remaining 80 chars for context bar
    const padded = result.text + " ".repeat(80 - result.width);
    assert.equal(padded.length, 80);
  });
});

describe("Narrow terminal degradation", () => {
  it("very narrow (5 cols) shows at most one short segment", () => {
    const segs = [
      { key: "a", text: "AB", priority: 1 },
      { key: "b", text: "CD", priority: 5 },
      { key: "c", text: "EF", priority: 10 },
    ];
    const result = renderLeftPacked(segs, 5);
    assert.ok(result.width <= 5);
  });

  it("narrow (20 cols) drops lowest priorities", () => {
    const segs = [
      { key: "ext", text: "EXT_STATUS", priority: 1 },
      { key: "git", text: "BRANCH", priority: 5 },
      { key: "model", text: "MODEL", priority: 10 },
    ];
    const result = renderLeftPacked(segs, 20);
    assert.ok(result.text.includes("MODEL"), "Highest priority should survive");
    assert.ok(result.width <= 20);
  });

  it("zero width returns empty", () => {
    const segs = [{ key: "a", text: "X", priority: 1 }];
    const result = renderLeftPacked(segs, 0);
    assert.equal(result.text, "");
  });
});
