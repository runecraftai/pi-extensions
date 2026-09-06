/**
 * Tests for diff parser — pure functions, no Pi dependency.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseDiff,
  looksLikeDiff,
  diffFileDisplayName,
} from "../extensions/pi-tui/renderers/diff.ts";

/* ── Fixtures ── */

const SIMPLE_DIFF = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,6 +1,7 @@
 import { foo } from "./foo";
 import { bar } from "./bar";
+import { baz } from "./baz";
 
 export function main() {
-  console.log("hello");
+  console.log("world");
 }
`;

const RENAME_DIFF = `diff --git a/old-name.ts b/new-name.ts
similarity index 80%
rename from old-name.ts
rename to new-name.ts
--- a/old-name.ts
+++ b/new-name.ts
@@ -1,3 +1,3 @@
-const old = 1;
+const updated = 1;
 const keep = 2;
 const also = 3;
`;

const BINARY_DIFF = `diff --git a/image.png b/image.png
Binary files a/image.png and b/image.png differ
`;

const CONFLICT_DIFF = `diff --git a/conflicted.ts b/conflicted.ts
--- a/conflicted.ts
+++ b/conflicted.ts
@@ -1,5 +1,7 @@
<<<<<<< HEAD
 const theirs = "theirs";
=======
 const ours = "ours";
>>>>>>> branch
 const common = "common";
`;

const MULTI_FILE_DIFF = `diff --git a/file1.ts b/file1.ts
--- a/file1.ts
+++ b/file1.ts
@@ -1,3 +1,3 @@
-const a = 1;
+const b = 1;
 const c = 2;
 const d = 3;
diff --git a/file2.ts b/file2.ts
--- a/file2.ts
+++ b/file2.ts
@@ -1,2 +1,2 @@
-const x = 1;
+const y = 1;
 const z = 2;
`;

const DEV_NULL_DIFF = `diff --git a/new-file.ts b/new-file.ts
new file mode 100644
--- /dev/null
+++ b/new-file.ts
@@ -0,0 +1,3 @@
+export function greet() {
+  return "hello";
+}
`;

/* ── Tests ── */

describe("parseDiff", () => {
  describe("simple diff", () => {
    it("parses file header correctly", () => {
      const result = parseDiff(SIMPLE_DIFF);
      assert.equal(result.files.length, 1);
      assert.equal(result.files[0].oldPath, "src/app.ts");
      assert.equal(result.files[0].newPath, "src/app.ts");
    });

    it("parses hunks", () => {
      const result = parseDiff(SIMPLE_DIFF);
      assert.equal(result.files[0].hunks.length, 1);
      const hunk = result.files[0].hunks[0];
      assert.equal(hunk.oldStart, 1);
      assert.equal(hunk.oldCount, 6);
      assert.equal(hunk.newStart, 1);
      assert.equal(hunk.newCount, 7);
    });

    it("parses diff lines with correct kinds", () => {
      const result = parseDiff(SIMPLE_DIFF);
      const lines = result.files[0].hunks[0].lines;
      assert.equal(lines[0].kind, "context"); // import { foo }
      assert.equal(lines[1].kind, "context"); // import { bar }
      assert.equal(lines[2].kind, "addition"); // +import { baz }
      assert.equal(lines[3].kind, "context"); // blank
      assert.equal(lines[4].kind, "context"); // export function
      assert.equal(lines[5].kind, "deletion"); // -console.log("hello")
      assert.equal(lines[6].kind, "addition"); // +console.log("world")
    });

    it("computes line numbers for context lines", () => {
      const result = parseDiff(SIMPLE_DIFF);
      const lines = result.files[0].hunks[0].lines;
      // First context line: old=1, new=1
      assert.equal(lines[0].oldLine, 1);
      assert.equal(lines[0].newLine, 1);
    });

    it("computes line numbers for additions", () => {
      const result = parseDiff(SIMPLE_DIFF);
      const lines = result.files[0].hunks[0].lines;
      // Third line is addition: new line number should be 3
      assert.equal(lines[2].kind, "addition");
      assert.equal(lines[2].newLine, 3);
    });

    it("parses deletion lines with leading spaces", () => {
      const result = parseDiff(SIMPLE_DIFF);
      const lines = result.files[0].hunks[0].lines;
      // Deletion line preserves indentation after the marker
      const deletion = lines.find((l) => l.kind === "deletion");
      assert.ok(deletion, "Should have a deletion line");
      assert.equal(deletion.raw, '-  console.log("hello");');
      assert.equal(deletion.text, '  console.log("hello");');
    });

    it("computes line numbers for deletions", () => {
      const result = parseDiff(SIMPLE_DIFF);
      const lines = result.files[0].hunks[0].lines;
      // Fifth line is deletion: old line number should be 5
      assert.equal(lines[5].kind, "deletion");
      assert.equal(lines[5].oldLine, 5);
    });

    it("strips the leading marker from text", () => {
      const result = parseDiff(SIMPLE_DIFF);
      const lines = result.files[0].hunks[0].lines;
      // Addition line: strips the + marker
      assert.equal(lines[2].text, 'import { baz } from "./baz";');
      // Context line: strips the space marker
      assert.equal(lines[0].text, 'import { foo } from "./foo";');
    });
  });

  describe("rename detection", () => {
    it("detects renames", () => {
      const result = parseDiff(RENAME_DIFF);
      assert.equal(result.files.length, 1);
      assert.equal(result.files[0].renameFrom, "old-name.ts");
      assert.equal(result.files[0].renameTo, "new-name.ts");
    });
  });

  describe("binary files", () => {
    it("detects binary files", () => {
      const result = parseDiff(BINARY_DIFF);
      assert.equal(result.files.length, 1);
      assert.equal(result.files[0].isBinary, true);
    });
  });

  describe("conflict markers", () => {
    it("detects conflict markers", () => {
      const result = parseDiff(CONFLICT_DIFF);
      assert.equal(result.hasConflicts, true);
    });

    it("parses conflict lines", () => {
      const result = parseDiff(CONFLICT_DIFF);
      const lines = result.files[0].hunks[0].lines;
      const conflicts = lines.filter((l) => l.kind === "conflict");
      assert.ok(conflicts.length > 0, "Should have conflict lines");
    });
  });

  describe("multi-file diffs", () => {
    it("parses multiple files", () => {
      const result = parseDiff(MULTI_FILE_DIFF);
      assert.equal(result.files.length, 2);
      assert.equal(result.files[0].oldPath, "file1.ts");
      assert.equal(result.files[1].oldPath, "file2.ts");
    });
  });

  describe("dev/null paths", () => {
    it("handles new files (--- /dev/null)", () => {
      const result = parseDiff(DEV_NULL_DIFF);
      assert.equal(result.files.length, 1);
      assert.equal(result.files[0].oldPath, "");
      assert.equal(result.files[0].newPath, "new-file.ts");
    });
  });

  describe("empty input", () => {
    it("returns empty result for empty string", () => {
      const result = parseDiff("");
      assert.equal(result.files.length, 0);
      assert.equal(result.hasConflicts, false);
    });

    it("returns empty result for non-diff text", () => {
      const result = parseDiff("just some regular text\nnot a diff");
      assert.equal(result.files.length, 0);
    });
  });
});

describe("looksLikeDiff", () => {
  it("detects git diff headers", () => {
    assert.equal(looksLikeDiff("diff --git a/foo b/foo"), true);
  });

  it("detects hunk headers", () => {
    assert.equal(looksLikeDiff("@@ -1,3 +1,3 @@"), true);
  });

  it("rejects empty string", () => {
    assert.equal(looksLikeDiff(""), false);
  });

  it("rejects non-diff text", () => {
    assert.equal(looksLikeDiff("just some code"), false);
  });
});

describe("diffFileDisplayName", () => {
  it("returns newPath when available", () => {
    const file = { newPath: "src/app.ts", oldPath: "src/old.ts" };
    assert.equal(diffFileDisplayName(file), "src/app.ts");
  });

  it("falls back to oldPath", () => {
    const file = { newPath: "", oldPath: "src/old.ts", hunks: [], header: "", isBinary: false };
    assert.equal(diffFileDisplayName(file), "src/old.ts");
  });

  it("shows rename info", () => {
    const file = {
      renameFrom: "old.ts",
      renameTo: "new.ts",
      newPath: "new.ts",
      oldPath: "old.ts",
      hunks: [],
      header: "",
      isBinary: false,
    };
    assert.equal(diffFileDisplayName(file), "old.ts → new.ts");
  });
});
