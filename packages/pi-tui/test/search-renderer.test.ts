/**
 * Tests for search renderer.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  renderSearch,
  parseGrepOutput,
  parseFindOutput,
  formatSearchSummary,
} from "../extensions/pi-tui/renderers/search.ts";

describe("Search Renderer", () => {
  describe("parseGrepOutput", () => {
    it("parses file:line:content format", () => {
      const result = parseGrepOutput("src/index.ts:5:console.log('hello');");
      assert.equal(result.length, 1);
      assert.equal(result[0]!.path, "src/index.ts");
      assert.equal(result[0]!.matches.length, 1);
      assert.equal(result[0]!.matches[0]!.line, 5);
      assert.equal(result[0]!.matches[0]!.content, "console.log('hello');");
    });

    it("groups matches by file", () => {
      const result = parseGrepOutput(
        "src/a.ts:1:line1\nsrc/b.ts:2:line2\nsrc/a.ts:3:line3"
      );
      assert.equal(result.length, 2);
      assert.equal(result[0]!.path, "src/a.ts");
      assert.equal(result[0]!.matches.length, 2);
      assert.equal(result[1]!.path, "src/b.ts");
      assert.equal(result[1]!.matches.length, 1);
    });

    it("handles ripgrep column format", () => {
      const result = parseGrepOutput("src/test.ts:10-const x = 1;");
      assert.equal(result.length, 1);
      assert.equal(result[0]!.matches[0]!.line, 10);
    });

    it("handles content without line numbers", () => {
      const result = parseGrepOutput("src/config.json:{}");
      assert.equal(result.length, 1);
      assert.equal(result[0]!.matches[0]!.line, 0);
    });

    it("skips empty lines", () => {
      const result = parseGrepOutput("src/a.ts:1:line1\n\nsrc/b.ts:2:line2\n");
      assert.equal(result.length, 2);
    });
  });

  describe("parseFindOutput", () => {
    it("parses file paths", () => {
      const result = parseFindOutput("src/index.ts\nsrc/config.ts\nREADME.md");
      assert.equal(result.length, 2); // grouped by directory
      assert.equal(result[0]!.matches.length, 2); // src files
      assert.equal(result[1]!.matches.length, 1); // root file
    });

    it("handles empty output", () => {
      const result = parseFindOutput("");
      assert.equal(result.length, 0);
    });
  });

  describe("formatSearchSummary", () => {
    it("formats single file matches", () => {
      const groups = [{
        path: "src/index.ts",
        matches: [{ line: 5, content: "test" }, { line: 10, content: "test" }],
      }];
      assert.equal(formatSearchSummary(groups, "grep"), "2 matches in index.ts");
    });

    it("formats multiple file matches", () => {
      const groups = [
        { path: "src/a.ts", matches: [{ line: 1, content: "x" }] },
        { path: "src/b.ts", matches: [{ line: 2, content: "x" }] },
      ];
      assert.equal(formatSearchSummary(groups, "grep"), "2 matches in 2 dirs");
    });

    it("formats truncated results", () => {
      const groups = [{ path: "a.ts", matches: [{ line: 1, content: "x" }] }];
      assert.equal(formatSearchSummary(groups, "grep", true), "1 matches in a.ts (truncated)");
    });

    it("formats no matches", () => {
      assert.equal(formatSearchSummary([], "grep"), "No matches found");
    });

    it("formats find results", () => {
      const groups = [
        { path: "src", matches: [{ line: 0, content: "a.ts" }, { line: 0, content: "b.ts" }] },
      ];
      assert.equal(formatSearchSummary(groups, "find"), "2 files in src");
    });
  });

  describe("renderSearch", () => {
    it("renders grep output with file grouping", () => {
      const result = renderSearch({
        content: "src/test.ts:5:const x = 1;\nsrc/test.ts:10:const y = 2;",
        toolName: "grep",
        input: { pattern: "const" },
      });
      assert.ok(result.summary.includes("2 matches"));
      assert.ok(result.expanded.includes("src/test.ts"));
      assert.ok(result.expanded.includes("const x = 1;"));
    });

    it("renders with line numbers", () => {
      const result = renderSearch({
        content: "src/test.ts:5:const x = 1;",
        toolName: "grep",
      }, { showLineNumbers: true });
      assert.ok(result.expanded.includes("5:"));
    });

    it("renders find output", () => {
      const result = renderSearch({
        content: "src/a.ts\nsrc/b.ts",
        toolName: "find",
      });
      assert.ok(result.summary.includes("files"));
    });
  });
});
