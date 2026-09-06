/**
 * Tests for diff renderer.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  renderDiff,
  parseDiff,
  formatDiffSummary,
  renderDiffLine,
} from "../extensions/pi-tui/renderers/diff.ts";

describe("Diff Renderer", () => {
  describe("parseDiff", () => {
    it("parses simple unified diff", () => {
      const diff = `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 line1
+added line
 line2
 line3`;

      const files = parseDiff(diff);
      assert.equal(files.length, 1);
      assert.equal(files[0]!.oldPath, "src/index.ts");
      assert.equal(files[0]!.newPath, "src/index.ts");
      assert.equal(files[0]!.hunks.length, 1);
      assert.equal(files[0]!.hunks[0]!.lines.length, 4);
    });

    it("parses added lines", () => {
      const diff = `diff --git a/test.ts b/test.ts
--- a/test.ts
+++ b/test.ts
@@ -1 +1,2 @@
+new line
 existing`;

      const files = parseDiff(diff);
      const addedLines = files[0]!.hunks[0]!.lines.filter((l) => l.type === "add");
      assert.equal(addedLines.length, 1);
      assert.equal(addedLines[0]!.content, "new line");
    });

    it("parses deleted lines", () => {
      const diff = `diff --git a/test.ts b/test.ts
--- a/test.ts
+++ b/test.ts
@@ -1,2 +1 @@
-old line
 existing`;

      const files = parseDiff(diff);
      const delLines = files[0]!.hunks[0]!.lines.filter((l) => l.type === "del");
      assert.equal(delLines.length, 1);
      assert.equal(delLines[0]!.content, "old line");
    });

    it("handles rename detection", () => {
      const diff = `diff --git a/old.ts b/new.ts
--- a/old.ts
+++ b/new.ts
@@ -1 +1 @@
-content
+new content`;

      const files = parseDiff(diff);
      assert.equal(files[0]!.isRename, true);
      assert.equal(files[0]!.oldPath, "old.ts");
      assert.equal(files[0]!.newPath, "new.ts");
    });

    it("handles binary files", () => {
      const diff = `diff --git a/image.png b/image.png
Binary files /dev/null and b/image.png differ`;

      const files = parseDiff(diff);
      assert.equal(files[0]!.isBinary, true);
    });

    it("handles empty diff", () => {
      const files = parseDiff("");
      assert.equal(files.length, 0);
    });
  });

  describe("formatDiffSummary", () => {
    it("formats single file diff", () => {
      const files = [{
        oldPath: "src/test.ts",
        newPath: "src/test.ts",
        hunks: [{
          oldStart: 1, oldLines: 2, newStart: 1, newLines: 3,
          lines: [
            { type: "add" as const, content: "added" },
            { type: "del" as const, content: "removed" },
            { type: "context" as const, content: "kept" },
          ],
        }],
        isRename: false,
        isBinary: false,
      }];
      assert.equal(formatDiffSummary(files), "test.ts: +1/-1");
    });

    it("formats multi-file diff", () => {
      const files = [
        {
          oldPath: "a.ts", newPath: "a.ts",
          hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2,
            lines: [{ type: "add" as const, content: "x" }],
          }],
          isRename: false, isBinary: false,
        },
        {
          oldPath: "b.ts", newPath: "b.ts",
          hunks: [{ oldStart: 1, oldLines: 2, newStart: 1, newLines: 1,
            lines: [{ type: "del" as const, content: "y" }, { type: "del" as const, content: "z" }],
          }],
          isRename: false, isBinary: false,
        },
      ];
      assert.equal(formatDiffSummary(files), "2 files: +1/-2");
    });
  });

  describe("renderDiffLine", () => {
    it("renders added line", () => {
      const result = renderDiffLine({ type: "add", content: "new", newLineNum: 5 }, 4, true);
      assert.ok(result.includes("+new"));
      assert.ok(result.includes("5"));
    });

    it("renders deleted line", () => {
      const result = renderDiffLine({ type: "del", content: "old", oldLineNum: 3 }, 4, true);
      assert.ok(result.includes("-old"));
      assert.ok(result.includes("3"));
    });

    it("renders context line", () => {
      const result = renderDiffLine({ type: "context", content: "kept", newLineNum: 4, oldLineNum: 4 }, 4, true);
      assert.ok(result.includes("kept"));
    });

    it("renders without line numbers when disabled", () => {
      const result = renderDiffLine({ type: "add", content: "new" }, 4, false);
      assert.ok(result === "+new");
    });
  });

  describe("renderDiff", () => {
    it("renders full diff output", () => {
      const diff = `diff --git a/test.ts b/test.ts
--- a/test.ts
+++ b/test.ts
@@ -1,2 +1,3 @@
 line1
+added
 line2`;

      const result = renderDiff({ content: diff });
      assert.ok(result.summary.includes("test.ts"));
      assert.ok(result.expanded.includes("+added"));
      assert.ok(result.files.length === 1);
    });

    it("handles multiple files", () => {
      const diff = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-old
+new
diff --git a/b.ts b/b.ts
--- a/b.ts
+++ b/b.ts
@@ -1 +1 @@
-old2
+new2`;

      const result = renderDiff({ content: diff });
      assert.equal(result.files.length, 2);
      assert.ok(result.summary.includes("2 files"));
    });
  });
});
