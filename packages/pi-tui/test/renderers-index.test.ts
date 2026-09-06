/**
 * Tests for renderer registry and router.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectRendererType,
  runRenderer,
  createToolResultHandler,
  defaultRenderersConfig,
} from "../extensions/pi-tui/renderers/index.ts";

describe("Renderer Registry", () => {
  describe("detectRendererType", () => {
    it("detects read tool", () => {
      assert.equal(detectRendererType("read", "content"), "read");
    });

    it("detects grep tool", () => {
      assert.equal(detectRendererType("grep", "src/test.ts:5:line"), "search");
    });

    it("detects find tool", () => {
      assert.equal(detectRendererType("find", "src/a.ts\nsrc/b.ts"), "search");
    });

    it("detects ls tool", () => {
      assert.equal(detectRendererType("ls", "file1.ts\nfile2.ts"), "listing");
    });

    it("detects bash tool", () => {
      assert.equal(detectRendererType("bash", "output"), "command");
    });

    it("detects diff content from edit tool", () => {
      const diff = `diff --git a/test.ts b/test.ts
--- a/test.ts
+++ b/test.ts
@@ -1 +1 @@
-old
+new`;
      assert.equal(detectRendererType("edit", diff), "diff");
    });

    it("detects diff content by pattern", () => {
      const diff = `--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 context
+added`;
      assert.equal(detectRendererType("unknown", diff), "diff");
    });

    it("detects grep output by pattern", () => {
      const output = "src/a.ts:1:line1\nsrc/b.ts:2:line2\nsrc/c.ts:3:line3";
      assert.equal(detectRendererType("unknown", output), "search");
    });

    it("returns null for unknown content", () => {
      assert.equal(detectRendererType("unknown", "This is a longer paragraph of text that has many words and does not match any specific tool output pattern."), null);
    });
  });

  describe("runRenderer", () => {
    it("renders read output", () => {
      const result = runRenderer("read", "line 1\nline 2", { path: "test.ts" });
      assert.ok(result);
      assert.equal(result.rendererType, "read");
      assert.ok(result.summary.includes("test.ts"));
    });

    it("renders search output", () => {
      const result = runRenderer("search", "src/test.ts:5:content", { pattern: "content" });
      assert.ok(result);
      assert.equal(result.rendererType, "search");
    });

    it("renders listing output", () => {
      const result = runRenderer("listing", "file1.ts\nfile2.ts");
      assert.ok(result);
      assert.equal(result.rendererType, "listing");
    });

    it("renders command output", () => {
      const result = runRenderer("command", "output", { command: "ls", exitCode: 0 });
      assert.ok(result);
      assert.equal(result.rendererType, "command");
      assert.equal(result.isError, false);
    });

    it("renders failed command as error", () => {
      const result = runRenderer("command", "error", { command: "fail", exitCode: 1 });
      assert.ok(result);
      assert.equal(result.isError, true);
    });

    it("renders diff output", () => {
      const diff = `--- a/test.ts
+++ b/test.ts
@@ -1 +1 @@
-old
+new`;
      const result = runRenderer("diff", diff);
      assert.ok(result);
      assert.equal(result.rendererType, "diff");
    });

    it("returns null for unknown renderer", () => {
      const result = runRenderer("unknown", "content");
      assert.equal(result, null);
    });
  });

  describe("createToolResultHandler", () => {
    it("returns a function", () => {
      const handler = createToolResultHandler();
      assert.equal(typeof handler, "function");
    });

    it("handler returns undefined for truly unknown content", () => {
      const handler = createToolResultHandler();
      const result = handler({
        toolName: "unknown",
        content: [{ type: "text", text: "This is a longer text block that does not look like any specific tool output format" }],
        isError: false,
        input: {},
      }, {});
      assert.equal(result, undefined);
    });

    it("handler processes read tool results", () => {
      const handler = createToolResultHandler();
      const result = handler({
        toolName: "read",
        content: [{ type: "text", text: "file content" }],
        isError: false,
        input: { path: "test.ts" },
      }, {});
      assert.ok(result);
      assert.ok(result.content[0]!.text);
    });

    it("handler respects enabled config", () => {
      const handler = createToolResultHandler({
        enabled: { read: false, search: true, listing: true, command: true, diff: true, image: false },
      });
      const result = handler({
        toolName: "read",
        content: [{ type: "text", text: "content" }],
        isError: false,
        input: {},
      }, {});
      assert.equal(result, undefined);
    });

    it("handler expands errors by default", () => {
      const handler = createToolResultHandler();
      const result = handler({
        toolName: "bash",
        content: [{ type: "text", text: "Error output" }],
        isError: true,
        input: { command: "fail" },
      }, {});
      assert.ok(result);
      assert.equal(result.details.isExpanded, true);
    });

    it("handler compacts successful commands by default", () => {
      const handler = createToolResultHandler();
      const result = handler({
        toolName: "bash",
        content: [{ type: "text", text: "success" }],
        isError: false,
        input: { command: "ls", exitCode: 0 },
      }, {});
      assert.ok(result);
      assert.equal(result.details.isExpanded, false);
    });
  });

  describe("defaultRenderersConfig", () => {
    it("returns valid config", () => {
      const config = defaultRenderersConfig();
      assert.equal(config.enabled.read, true);
      assert.equal(config.defaultExpanded.diff, true);
      assert.equal(config.diff.showLineNumbers, true);
    });
  });
});
