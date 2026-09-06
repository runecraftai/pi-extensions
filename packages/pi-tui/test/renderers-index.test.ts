/**
 * Tests for renderer routing middleware — tool detection, chain intact.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canRender,
  getDefaultRendererConfig,
} from "../extensions/pi-tui/renderers/index.ts";

/* ── Helpers ── */

function makeToolResult(toolName: string, content: string, isError = false) {
  return {
    toolName,
    toolCallId: "test-123",
    input: {},
    content: [{ type: "text" as const, text: content }],
    isError,
  };
}

/* ── Fixtures ── */

const DIFF_CONTENT = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@
 import { foo } from "./foo";
+import { bar } from "./bar";
 
 export function main() {
`;

const NON_DIFF_CONTENT = `This is just some regular output from a command.`;

const EDIT_WITH_DIFF = `diff --git a/src/app.ts b/src/app.ts
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

/* ── Tests ── */

describe("canRender", () => {
  it("detects edit tool with diff content", () => {
    const event = makeToolResult("edit", EDIT_WITH_DIFF);
    assert.equal(canRender(event), true);
  });

  it("detects write tool with diff content", () => {
    const event = makeToolResult("write", DIFF_CONTENT);
    assert.equal(canRender(event), true);
  });

  it("detects bash tool with diff output", () => {
    const event = makeToolResult("bash", DIFF_CONTENT);
    assert.equal(canRender(event), true);
  });

  it("rejects non-diff content", () => {
    const event = makeToolResult("edit", NON_DIFF_CONTENT);
    assert.equal(canRender(event), false);
  });

  it("rejects when diff renderer is disabled", () => {
    const config = getDefaultRendererConfig();
    config.enabled.diff = false;
    const event = makeToolResult("edit", EDIT_WITH_DIFF);
    assert.equal(canRender(event, config), false);
  });

  it("rejects unknown tool names with non-diff content", () => {
    const event = makeToolResult("custom_tool", NON_DIFF_CONTENT);
    assert.equal(canRender(event), false);
  });
});

describe("getDefaultRendererConfig", () => {
  it("returns config with all renderers enabled", () => {
    const config = getDefaultRendererConfig();
    assert.equal(config.enabled.diff, true);
    assert.equal(config.enabled.read, true);
    assert.equal(config.enabled.search, true);
    assert.equal(config.enabled.listing, true);
    assert.equal(config.enabled.command, true);
  });

  it("returns config with sensible defaults", () => {
    const config = getDefaultRendererConfig();
    assert.equal(config.diff.mode, "auto");
    assert.equal(config.diff.minSplitWidth, 140);
    assert.equal(config.diff.highlight, true);
    assert.equal(config.diff.showLineNumbers, true);
  });

  it("returns independent copies (no shared references)", () => {
    const a = getDefaultRendererConfig();
    const b = getDefaultRendererConfig();
    a.enabled.diff = false;
    assert.equal(b.enabled.diff, true, "Modifying one should not affect the other");
  });
});

describe("chain integrity", () => {
  it("unknown tool returns undefined (chain continues)", () => {
    // The handler returns undefined for unknown tools, meaning
    // Pi's native renderer takes over. We verify this by checking
    // canRender returns false.
    const event = makeToolResult("unknown_tool", "some content");
    assert.equal(canRender(event), false);
  });

  it("read tool with non-diff content is not rendered", () => {
    const event = makeToolResult("read", NON_DIFF_CONTENT);
    assert.equal(canRender(event), false);
  });

  it("ls tool with non-diff content is not rendered", () => {
    const event = makeToolResult("ls", "file1.txt\nfile2.txt");
    assert.equal(canRender(event), false);
  });

  it("grep tool with non-diff content is not rendered", () => {
    const event = makeToolResult("grep", "match found on line 1");
    assert.equal(canRender(event), false);
  });
});
