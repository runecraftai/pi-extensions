/**
 * Tests for diff view rendering — layout, line numbers, colors.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  renderDiff,
  effectiveViewMode,
  toggleViewMode,
  DEFAULT_DIFF_VIEW_CONFIG,
} from "../extensions/pi-tui/renderers/diff-view.ts";
import type { DiffViewConfig } from "../extensions/pi-tui/renderers/diff-view.ts";

/* ── Fixtures ── */

const SIMPLE_DIFF = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,5 +1,6 @@
 import { foo } from "./foo";
+import { bar } from "./bar";

 export function main() {
-  console.log("hello");
+  console.log("world");
 }
`;

const BINARY_DIFF = `diff --git a/image.png b/image.png
Binary files a/image.png and b/image.png differ
`;

const MULTI_HUNK_DIFF = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@
 import { foo } from "./foo";
+import { bar } from "./bar";

 export function main() {
@@ -10,5 +11,6 @@
   const a = 1;
   const b = 2;
+  const c = 3;
   const d = 4;
   const e = 5;
`;

/* ── Helpers ── */

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

/* ── Theme stub ── */

const stubTheme = {
  fg: (color: string, text: string) => `\x1b[${colorCode(color)}m${text}\x1b[0m`,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
  dim: (text: string) => `\x1b[2m${text}\x1b[0m`,
} as any;

function colorCode(color: string): string {
  const codes: Record<string, string> = {
    green: "32",
    red: "31",
    cyan: "36",
    dim: "90",
    accent: "36",
    muted: "90",
  };
  return codes[color] ?? "0";
}

/* ── Tests ── */

describe("renderDiff", () => {
  describe("unified mode", () => {
    const config: DiffViewConfig = {
      ...DEFAULT_DIFF_VIEW_CONFIG,
      mode: "unified",
      highlight: false,
    };

    it("renders file header", async () => {
      const lines = await renderDiff(SIMPLE_DIFF, config, stubTheme);
      assert.ok(lines.some((l) => l.includes("src/app.ts")), "Should include filename");
    });

    it("renders hunk header", async () => {
      const lines = await renderDiff(SIMPLE_DIFF, config, stubTheme);
      // Hunk headers may be wrapped in ANSI codes, so check for @@
      assert.ok(lines.some((l) => stripAnsi(l).includes("@@")), "Should include hunk header");
    });

    it("renders addition lines with +", async () => {
      const lines = await renderDiff(SIMPLE_DIFF, config, stubTheme);
      const additions = lines.filter((l) => l.includes("+") && l.includes("import { bar }"));
      assert.ok(additions.length > 0, "Should have addition lines");
    });

    it("renders deletion lines with -", async () => {
      const lines = await renderDiff(SIMPLE_DIFF, config, stubTheme);
      const deletions = lines.filter((l) => l.includes("-") && l.includes('console.log("hello")'));
      assert.ok(deletions.length > 0, "Should have deletion lines");
    });

    it("includes line numbers when enabled", async () => {
      const lines = await renderDiff(SIMPLE_DIFF, config, stubTheme);
      // Line numbers are padded to 5 chars, may have ANSI codes before them
      const hasLineNumbers = lines.some((l) => {
        const stripped = stripAnsi(l);
        return /^\s*\d+\s+\d+/.test(stripped);
      });
      assert.ok(hasLineNumbers, "Should include line numbers");
    });
  });

  describe("split mode", () => {
    const config: DiffViewConfig = {
      ...DEFAULT_DIFF_VIEW_CONFIG,
      mode: "split",
      highlight: false,
    };

    it("renders with gutter separator", async () => {
      const lines = await renderDiff(SIMPLE_DIFF, config, stubTheme);
      // Split view uses │ as gutter
      const gutterLines = lines.filter((l) => l.includes("│"));
      assert.ok(gutterLines.length > 0, "Should have gutter separator lines");
    });
  });

  describe("auto mode", () => {
    it("auto mode respects minSplitWidth threshold", () => {
      // effectiveViewMode tests the actual terminal width logic
      const narrowConfig: DiffViewConfig = { ...DEFAULT_DIFF_VIEW_CONFIG, mode: "auto", minSplitWidth: 140 };
      assert.equal(effectiveViewMode(100, narrowConfig), "unified");
      assert.equal(effectiveViewMode(160, narrowConfig), "split");
    });
  });

  describe("binary files", () => {
    it("shows binary file message", async () => {
      const config: DiffViewConfig = {
        ...DEFAULT_DIFF_VIEW_CONFIG,
        mode: "unified",
        highlight: false,
      };
      const lines = await renderDiff(BINARY_DIFF, config, stubTheme);
      assert.ok(lines.some((l) => l.includes("Binary")), "Should show binary file message");
    });
  });

  describe("multi-hunk", () => {
    it("renders multiple hunks", async () => {
      const config: DiffViewConfig = {
        ...DEFAULT_DIFF_VIEW_CONFIG,
        mode: "unified",
        highlight: false,
      };
      const lines = await renderDiff(MULTI_HUNK_DIFF, config, stubTheme);
      // Hunk headers may have ANSI codes, check for @@
      const hunkHeaders = lines.filter((l) => stripAnsi(l).includes("@@"));
      assert.equal(hunkHeaders.length, 2, "Should have 2 hunk headers");
    });
  });
});

describe("effectiveViewMode", () => {
  it("returns split when mode is split", () => {
    const config: DiffViewConfig = { ...DEFAULT_DIFF_VIEW_CONFIG, mode: "split" };
    assert.equal(effectiveViewMode(80, config), "split");
  });

  it("returns unified when mode is unified", () => {
    const config: DiffViewConfig = { ...DEFAULT_DIFF_VIEW_CONFIG, mode: "unified" };
    assert.equal(effectiveViewMode(200, config), "unified");
  });

  it("returns split when auto and width >= minSplitWidth", () => {
    const config: DiffViewConfig = { ...DEFAULT_DIFF_VIEW_CONFIG, mode: "auto", minSplitWidth: 140 };
    assert.equal(effectiveViewMode(160, config), "split");
  });

  it("returns unified when auto and width < minSplitWidth", () => {
    const config: DiffViewConfig = { ...DEFAULT_DIFF_VIEW_CONFIG, mode: "auto", minSplitWidth: 140 };
    assert.equal(effectiveViewMode(100, config), "unified");
  });
});

describe("toggleViewMode", () => {
  it("toggles split to unified", () => {
    assert.equal(toggleViewMode("split"), "unified");
  });

  it("toggles unified to split", () => {
    assert.equal(toggleViewMode("unified"), "split");
  });

  it("keeps auto as auto", () => {
    assert.equal(toggleViewMode("auto"), "auto");
  });
});
