/**
 * Tests for listing renderer.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  renderListing,
  parseLsOutput,
  parseFindEntries,
  formatListingSummary,
  renderListingExpanded,
} from "../extensions/pi-tui/renderers/listing.ts";

describe("Listing Renderer", () => {
  describe("parseLsOutput", () => {
    it("parses simple file list", () => {
      const result = parseLsOutput("file1.ts\nfile2.ts\nfile3.ts");
      assert.equal(result.length, 3);
      assert.equal(result[0]!.name, "file1.ts");
      assert.equal(result[0]!.isDirectory, false);
    });

    it("detects directories by trailing slash", () => {
      const result = parseLsOutput("src/\nREADME.md\npackage.json");
      assert.equal(result.length, 3);
      assert.equal(result[0]!.isDirectory, true);
      assert.equal(result[1]!.isDirectory, false);
    });

    it("skips total lines", () => {
      const result = parseLsOutput("total 8\nfile1.ts\nfile2.ts");
      assert.equal(result.length, 2);
    });

    it("handles empty output", () => {
      const result = parseLsOutput("");
      assert.equal(result.length, 0);
    });
  });

  describe("parseFindEntries", () => {
    it("parses file paths", () => {
      const result = parseFindEntries("src/index.ts\nsrc/config.ts");
      assert.equal(result.length, 2);
      assert.equal(result[0]!.name, "index.ts");
      assert.equal(result[0]!.isDirectory, false);
    });

    it("detects directories by heuristic", () => {
      const result = parseFindEntries("src\nlib\nREADME.md");
      assert.equal(result[0]!.isDirectory, true);
      assert.equal(result[2]!.isDirectory, false);
    });
  });

  describe("formatListingSummary", () => {
    it("formats dirs and files", () => {
      const entries = [
        { name: "src", isDirectory: true },
        { name: "lib", isDirectory: true },
        { name: "index.ts", isDirectory: false },
      ];
      assert.equal(formatListingSummary(entries), "2 dirs, 1 file");
    });

    it("formats files only", () => {
      const entries = [
        { name: "a.ts", isDirectory: false },
        { name: "b.ts", isDirectory: false },
      ];
      assert.equal(formatListingSummary(entries), "2 files");
    });

    it("formats dirs only", () => {
      const entries = [{ name: "src", isDirectory: true }];
      assert.equal(formatListingSummary(entries), "1 dir");
    });

    it("formats empty listing", () => {
      assert.equal(formatListingSummary([]), "Empty directory");
    });

    it("adds truncated marker", () => {
      const entries = [{ name: "a.ts", isDirectory: false }];
      assert.equal(formatListingSummary(entries, true), "1 file (truncated)");
    });
  });

  describe("renderListingExpanded", () => {
    it("renders directories first then files", () => {
      const entries = [
        { name: "b.ts", isDirectory: false },
        { name: "src", isDirectory: true },
        { name: "a.ts", isDirectory: false },
      ];
      const result = renderListingExpanded(entries);
      const lines = result.split("\n");
      assert.ok(lines[0]!.includes("src"));
      assert.ok(lines.includes("a.ts"));
      assert.ok(lines.includes("b.ts"));
    });

    it("collapses large directories", () => {
      const entries = Array.from({ length: 100 }, (_, i) => ({
        name: `file${i}.ts`,
        isDirectory: false,
      }));
      const result = renderListingExpanded(entries, 10);
      assert.ok(result.includes("collapsed"));
      assert.ok(result.includes("... (95 more)"));
    });

    it("handles empty entries", () => {
      assert.equal(renderListingExpanded([]), "(empty)");
    });
  });

  describe("renderListing", () => {
    it("renders simple directory listing", () => {
      const result = renderListing({
        content: "src/\nREADME.md\npackage.json",
        toolName: "ls",
      });
      assert.ok(result.summary.includes("1 dir"));
      assert.ok(result.summary.includes("2 files"));
      assert.ok(result.expanded.includes("src/"));
    });

    it("renders find output", () => {
      const result = renderListing({
        content: "src/a.ts\nsrc/b.ts",
        toolName: "find",
      });
      assert.ok(result.summary.includes("files"));
    });

    it("handles truncated output", () => {
      const result = renderListing({
        content: "file.ts",
        toolName: "ls",
        truncated: true,
      });
      assert.ok(result.summary.includes("truncated"));
    });
  });
});
