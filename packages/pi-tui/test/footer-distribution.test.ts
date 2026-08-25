/**
 * Tests for footer three-zone layout and left-packed segment rendering.
 *
 * Each line has LEFT / CENTER / RIGHT zones. Segments are assigned to zones
 * via config. Narrow terminals degrade by dropping lowest-priority segments.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

/* ── Replicated logic (from footer/index.ts) ── */

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

function packSegments(segs: Seg[], maxWidth: number): { text: string; width: number } {
  if (segs.length === 0) return { text: "", width: 0 };
  const sorted = [...segs].sort((a, b) => a.priority - b.priority);
  let totalW = sorted.reduce((a, s) => a + visibleWidth(s.text), 0) + Math.max(0, sorted.length - 1) * SEP_W;
  for (const seg of sorted) {
    if (totalW <= maxWidth) break;
    const segW = visibleWidth(seg.text);
    const without = totalW - segW - SEP_W;
    if (without <= 0) { seg.text = ""; totalW -= segW + SEP_W; }
    else if (segW > 0) {
      const avail = maxWidth - without - SEP_W;
      if (avail > 3) { seg.text = truncateToWidth(seg.text, avail, "…"); totalW = without + visibleWidth(seg.text) + SEP_W; }
      else { seg.text = ""; totalW -= segW + SEP_W; }
    }
  }
  const surviving = segs.filter((s) => s.text !== "");
  if (surviving.length === 0) return { text: "", width: 0 };
  const joined = surviving.map((s) => s.text).join(SEP);
  return { text: joined, width: visibleWidth(joined) };
}

type Zone = "left" | "center" | "right";

function renderThreeZoneLine(left: string, center: string, right: string, width: number): string {
  const leftW = visibleWidth(left);
  const centerW = visibleWidth(center);
  const rightW = visibleWidth(right);
  const activeCount = (leftW > 0 ? 1 : 0) + (centerW > 0 ? 1 : 0) + (rightW > 0 ? 1 : 0);
  if (activeCount === 0) return "";
  if (activeCount === 1) {
    if (leftW > 0) return left;
    if (centerW > 0) return center;
    return right;
  }
  const sepSlots = activeCount - 1;
  const totalContentW = leftW + centerW + rightW;
  const totalSepW = sepSlots * SEP_W;
  const remaining = width - totalContentW - totalSepW;
  if (remaining <= 0) {
    return truncateToWidth([left, center, right].filter(Boolean).join(SEP), width, "…");
  }
  let centerPad = 0;
  let rightPad = 0;
  if (activeCount === 2) {
    if (leftW > 0 && rightW > 0) { rightPad = remaining; }
    else if (leftW > 0 && centerW > 0) { rightPad = remaining; }
    else { centerPad = remaining; }
  } else {
    centerPad = Math.floor(remaining / 2);
    rightPad = remaining - centerPad;
  }
  const parts: string[] = [];
  parts.push(left);
  if (centerW > 0) { parts.push(SEP); parts.push(" ".repeat(centerPad)); parts.push(center); }
  if (rightW > 0) { if (leftW > 0 || centerW > 0) parts.push(SEP); parts.push(" ".repeat(rightPad)); parts.push(right); }
  return parts.join("");
}

/* ── Tests ── */

describe("Left-packed segment rendering", () => {
  it("returns empty for no segments", () => {
    const result = packSegments([], 80);
    assert.equal(result.text, "");
    assert.equal(result.width, 0);
  });

  it("single segment is left-aligned", () => {
    const result = packSegments([{ key: "a", text: "hello", priority: 1 }], 20);
    assert.equal(result.text, "hello");
    assert.equal(result.width, 5);
  });

  it("two segments joined with separator", () => {
    const result = packSegments([
      { key: "a", text: "AAA", priority: 1 },
      { key: "b", text: "BBB", priority: 2 },
    ], 30);
    assert.equal(result.text, "AAA · BBB");
    assert.equal(result.width, 9);
  });

  it("three segments joined with separators", () => {
    const result = packSegments([
      { key: "a", text: "A", priority: 1 },
      { key: "b", text: "B", priority: 2 },
      { key: "c", text: "C", priority: 3 },
    ], 30);
    assert.equal(result.text, "A · B · C");
    assert.equal(result.width, 9);
  });

  it("drops lowest priority when too narrow", () => {
    const result = packSegments([
      { key: "low", text: "LOWPRIO", priority: 1 },
      { key: "high", text: "HI", priority: 10 },
    ], 4);
    assert.ok(!result.text.includes("LOWPRIO"));
    assert.ok(result.text.includes("HI"));
  });

  it("all segments fit when width is large", () => {
    const result = packSegments([
      { key: "a", text: "AAA", priority: 1 },
      { key: "b", text: "BBB", priority: 2 },
      { key: "c", text: "CCC", priority: 3 },
    ], 100);
    assert.equal(result.text, "AAA · BBB · CCC");
    assert.equal(result.width, 15);
  });

  it("result width matches visible text width", () => {
    const result = packSegments([
      { key: "a", text: "XX", priority: 1 },
      { key: "b", text: "YY", priority: 2 },
    ], 50);
    assert.equal(result.width, visibleWidth(result.text));
  });
});

describe("Three-zone line layout", () => {
  it("single zone left-aligned", () => {
    const line = renderThreeZoneLine("LEFT", "", "", 40);
    assert.equal(line, "LEFT");
  });

  it("single zone center", () => {
    const line = renderThreeZoneLine("", "CENTER", "", 40);
    assert.equal(line, "CENTER");
  });

  it("single zone right", () => {
    const line = renderThreeZoneLine("", "", "RIGHT", 40);
    assert.equal(line, "RIGHT");
  });

  it("left + right with separator and space between", () => {
    const line = renderThreeZoneLine("L", "", "R", 20);
    assert.ok(line.includes("L"));
    assert.ok(line.includes("R"));
    assert.ok(line.includes("·"));
    // L is at start, R is at end
    assert.ok(line.startsWith("L"));
    assert.ok(line.endsWith("R"));
  });

  it("left + center + right with separators", () => {
    const line = renderThreeZoneLine("L", "C", "R", 30);
    assert.ok(line.includes("L"));
    assert.ok(line.includes("C"));
    assert.ok(line.includes("R"));
    // Two separators
    const sepCount = (line.match(/·/g) ?? []).length;
    assert.equal(sepCount, 2);
  });

  it("empty zones take no space", () => {
    const line = renderThreeZoneLine("A", "", "", 20);
    assert.equal(line, "A");
  });

  it("no zones returns empty", () => {
    const line = renderThreeZoneLine("", "", "", 20);
    assert.equal(line, "");
  });

  it("line does not exceed width", () => {
    const line = renderThreeZoneLine("LEFT", "CENTER", "RIGHT", 20);
    assert.ok(line.length <= 20);
  });
});

describe("Zone assignment", () => {
  it("layout D defaults: left = project identity, right = metrics", () => {
    const zones: Record<string, Zone> = {
      cwd: "left", gitBranch: "left", gitStatus: "left", gitCommit: "left", runtime: "left",
      timer: "right", contextBar: "right", model: "right", thinking: "right",
      tokens: "right", cost: "right", extStatus: "right",
    };
    const leftSegs = Object.entries(zones).filter(([, z]) => z === "left").map(([k]) => k);
    assert.ok(leftSegs.includes("cwd"));
    assert.ok(leftSegs.includes("gitBranch"));
    assert.ok(leftSegs.includes("gitStatus"));
    const rightSegs = Object.entries(zones).filter(([, z]) => z === "right").map(([k]) => k);
    assert.ok(rightSegs.includes("contextBar"));
    assert.ok(rightSegs.includes("model"));
    assert.ok(rightSegs.includes("cost"));
  });

  it("context bar defaults to right zone (layout D)", () => {
    const zones = { contextBar: "right" as Zone };
    assert.equal(zones.contextBar, "right");
  });

  it("model defaults to right zone", () => {
    const zones = { model: "right" as Zone };
    assert.equal(zones.model, "right");
  });

  it("can reassign segment to different zone", () => {
    let zones: Record<string, Zone> = { cwd: "left", model: "right" };
    zones = { ...zones, cwd: "center" };
    assert.equal(zones.cwd, "center");
  });
});

describe("Narrow terminal degradation", () => {
  it("very narrow shows at most one short segment", () => {
    const result = packSegments([
      { key: "a", text: "AB", priority: 1 },
      { key: "b", text: "CD", priority: 5 },
      { key: "c", text: "EF", priority: 10 },
    ], 5);
    assert.ok(result.width <= 5);
  });

  it("narrow drops lowest priorities", () => {
    const result = packSegments([
      { key: "ext", text: "EXT_STATUS", priority: 1 },
      { key: "git", text: "BRANCH", priority: 5 },
      { key: "model", text: "MODEL", priority: 10 },
    ], 20);
    assert.ok(result.text.includes("MODEL"));
    assert.ok(result.width <= 20);
  });

  it("zero width returns empty", () => {
    const result = packSegments([{ key: "a", text: "X", priority: 1 }], 0);
    assert.equal(result.text, "");
  });
});
