/**
 * Tests for command renderer.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  renderCommand,
  formatDuration,
  stripAnsi,
  truncateOutput,
  formatCommandSummary,
} from "../extensions/pi-tui/renderers/command.ts";

describe("Command Renderer", () => {
  describe("formatDuration", () => {
    it("formats milliseconds", () => {
      assert.equal(formatDuration(500), "500ms");
    });

    it("formats seconds", () => {
      assert.equal(formatDuration(1500), "1.5s");
    });

    it("formats minutes", () => {
      assert.equal(formatDuration(90000), "1m 30s");
    });
  });

  describe("stripAnsi", () => {
    it("removes ANSI escape codes", () => {
      const input = "\x1B[31mred text\x1B[0m";
      assert.equal(stripAnsi(input), "red text");
    });

    it("preserves plain text", () => {
      assert.equal(stripAnsi("hello world"), "hello world");
    });
  });

  describe("truncateOutput", () => {
    it("returns full text when under limit", () => {
      const result = truncateOutput("short text", 100);
      assert.equal(result.text, "short text");
      assert.equal(result.truncated, false);
    });

    it("truncates with marker when over limit", () => {
      const result = truncateOutput("a".repeat(200), 100);
      assert.ok(result.text.length < 200);
      assert.ok(result.text.includes("truncated"));
      assert.equal(result.truncated, true);
    });
  });

  describe("formatCommandSummary", () => {
    it("formats successful command", () => {
      const result = formatCommandSummary("ls -la", 0, 100);
      assert.equal(result, "ls -la (100ms)");
    });

    it("formats failed command with exit code", () => {
      const result = formatCommandSummary("grep -r pattern .", 1, 500);
      assert.ok(result.includes("[exit 1]"));
    });

    it("truncates long commands", () => {
      const cmd = "a".repeat(100);
      const result = formatCommandSummary(cmd, 0, 100);
      assert.ok(result.length < 60);
      assert.ok(result.includes("..."));
    });

    it("formats command without duration", () => {
      const result = formatCommandSummary("echo hello", 0);
      assert.equal(result, "echo hello");
    });
  });

  describe("renderCommand", () => {
    it("renders successful command", () => {
      const result = renderCommand({
        content: "file1.ts\nfile2.ts",
        command: "ls",
        exitCode: 0,
        durationMs: 100,
      });
      assert.equal(result.success, true);
      assert.ok(result.summary.includes("ls"));
      assert.ok(result.expanded.includes("$ ls"));
    });

    it("renders failed command", () => {
      const result = renderCommand({
        content: "Error: file not found",
        command: "cat missing.txt",
        exitCode: 1,
        durationMs: 50,
      });
      assert.equal(result.success, false);
      assert.ok(result.summary.includes("[exit 1]"));
    });

    it("preserves ANSI output in expanded view", () => {
      const result = renderCommand({
        content: "\x1B[32msuccess\x1B[0m",
        command: "test",
        exitCode: 0,
      });
      assert.ok(result.expanded.includes("\x1B[32m"));
    });

    it("truncates long output", () => {
      const result = renderCommand({
        content: "x".repeat(5000),
        command: "generate",
        exitCode: 0,
      }, { maxChars: 100 });
      assert.ok(result.expanded.length < 200);
      assert.ok(result.expanded.includes("truncated"));
    });

    it("handles unknown exit code", () => {
      const result = renderCommand({
        content: "output",
        command: "timeout-cmd",
        exitCode: null,
      });
      assert.equal(result.success, true);
    });
  });
});
