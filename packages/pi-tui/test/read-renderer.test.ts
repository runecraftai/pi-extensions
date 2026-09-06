/**
 * Tests for read renderer.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  renderRead,
  extractFilePath,
  parseLineRange,
  formatReadSummary,
} from "../extensions/pi-tui/renderers/read.ts";

describe("Read Renderer", () => {
  describe("extractFilePath", () => {
    it("returns input path when provided", () => {
      const result = extractFilePath("content", "/path/to/file.ts");
      assert.equal(result, "/path/to/file.ts");
    });

    it("extracts path from comment header", () => {
      const result = extractFilePath("// src/index.ts\nconsole.log('hello');");
      assert.equal(result, "src/index.ts");
    });

    it("extracts path from hash header", () => {
      const result = extractFilePath("# README.md\n# Hello");
      assert.equal(result, "README.md");
    });

    it("returns undefined for no header", () => {
      const result = extractFilePath("just content\nno header here");
      assert.equal(result, undefined);
    });
  });

  describe("parseLineRange", () => {
    it("defaults to full file range", () => {
      const result = parseLineRange("line1\nline2\nline3");
      assert.deepEqual(result, { start: 1, end: 3, total: 3 });
    });

    it("handles offset", () => {
      const result = parseLineRange("line1\nline2\nline3", 1);
      assert.deepEqual(result, { start: 2, end: 3, total: 3 });
    });

    it("handles limit", () => {
      const result = parseLineRange("line1\nline2\nline3\nline4", 0, 2);
      assert.deepEqual(result, { start: 1, end: 2, total: 4 });
    });

    it("caps end at total", () => {
      const result = parseLineRange("line1\nline2", 0, 100);
      assert.deepEqual(result, { start: 1, end: 2, total: 2 });
    });
  });

  describe("formatReadSummary", () => {
    it("formats full file summary", () => {
      const result = formatReadSummary("/path/file.ts", { start: 1, end: 10, total: 10 });
      assert.equal(result, "file.ts (10 lines)");
    });

    it("formats line range summary", () => {
      const result = formatReadSummary("/path/file.ts", { start: 5, end: 15, total: 100 });
      assert.equal(result, "file.ts L5-15 of 100");
    });

    it("handles no path", () => {
      const result = formatReadSummary(undefined, { start: 1, end: 10, total: 10 });
      assert.equal(result, "File content");
    });
  });

  describe("renderRead", () => {
    it("renders simple file content", () => {
      const result = renderRead({
        content: "line 1\nline 2\nline 3",
        filePath: "test.ts",
      });
      assert.ok(result.summary.includes("test.ts"));
      assert.ok(result.summary.includes("3 lines"));
      assert.ok(result.expanded.includes("line 1"));
    });

    it("renders with line numbers", () => {
      const result = renderRead({
        content: "const x = 1;\nconst y = 2;",
        filePath: "test.ts",
      }, { showLineNumbers: true });
      // Should include line number gutter
      assert.ok(result.expanded.includes("│"));
    });

    it("renders without line numbers when disabled", () => {
      const result = renderRead({
        content: "const x = 1;\nconst y = 2;",
        filePath: "test.ts",
      }, { showLineNumbers: false });
      assert.ok(!result.expanded.includes("│"));
    });

    it("handles content with offset", () => {
      const content = "line 1\nline 2\nline 3\nline 4\nline 5";
      const result = renderRead({
        content,
        filePath: "test.ts",
        offset: 2,
        limit: 2,
      });
      assert.ok(result.summary.includes("L3-4"));
    });
  });
});
