/**
 * Tests for shiki lazy loader — fallback, cache, timeout.
 *
 * Since Shiki is not installed in the test environment, these tests
 * verify the fallback behavior (returns plain text when Shiki unavailable).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  highlight,
  highlightSync,
  clearCache,
  extensionToLanguage,
  canHighlight,
} from "../extensions/pi-tui/renderers/shiki.ts";

describe("shiki", () => {
  describe("highlight", () => {
    it("returns plain text when Shiki is not available", async () => {
      const code = 'const x = 1;\nconsole.log(x);';
      const result = await highlight(code, "typescript", "github-dark");
      // Without Shiki installed, should return plain text
      assert.equal(result, code);
    });

    it("returns empty string for empty input", async () => {
      const result = await highlight("", "typescript", "github-dark");
      assert.equal(result, "");
    });

    it("returns plain text on abort signal", async () => {
      const controller = new AbortController();
      controller.abort();
      const code = 'const x = 1;';
      const result = await highlight(code, "typescript", "github-dark", controller.signal);
      assert.equal(result, code);
    });
  });

  describe("highlightSync", () => {
    it("returns input unchanged", () => {
      const code = 'const x = 1;';
      assert.equal(highlightSync(code), code);
    });

    it("returns empty string for empty input", () => {
      assert.equal(highlightSync(""), "");
    });
  });

  describe("extensionToLanguage", () => {
    it("maps TypeScript extensions", () => {
      assert.equal(extensionToLanguage(".ts"), "typescript");
      assert.equal(extensionToLanguage(".tsx"), "typescript");
    });

    it("maps JavaScript extensions", () => {
      assert.equal(extensionToLanguage(".js"), "javascript");
      assert.equal(extensionToLanguage(".jsx"), "javascript");
      assert.equal(extensionToLanguage(".mjs"), "javascript");
      assert.equal(extensionToLanguage(".cjs"), "javascript");
    });

    it("maps Python extensions", () => {
      assert.equal(extensionToLanguage(".py"), "python");
      assert.equal(extensionToLanguage(".pyw"), "python");
    });

    it("maps Go extension", () => {
      assert.equal(extensionToLanguage(".go"), "go");
    });

    it("maps Rust extension", () => {
      assert.equal(extensionToLanguage(".rs"), "rust");
    });

    it("maps C/C++ extensions", () => {
      assert.equal(extensionToLanguage(".c"), "c");
      assert.equal(extensionToLanguage(".h"), "c");
      assert.equal(extensionToLanguage(".cpp"), "cpp");
      assert.equal(extensionToLanguage(".cxx"), "cpp");
    });

    it("maps Ruby extension", () => {
      assert.equal(extensionToLanguage(".rb"), "ruby");
    });

    it("maps shell extensions", () => {
      assert.equal(extensionToLanguage(".bash"), "bash");
      assert.equal(extensionToLanguage(".sh"), "bash");
      assert.equal(extensionToLanguage(".zsh"), "bash");
    });

    it("maps config formats", () => {
      assert.equal(extensionToLanguage(".json"), "json");
      assert.equal(extensionToLanguage(".yaml"), "yaml");
      assert.equal(extensionToLanguage(".yml"), "yaml");
      assert.equal(extensionToLanguage(".toml"), "toml");
      assert.equal(extensionToLanguage(".md"), "markdown");
    });

    it("returns undefined for unknown extensions", () => {
      assert.equal(extensionToLanguage(".xyz"), undefined);
      assert.equal(extensionToLanguage(".unknown"), undefined);
    });

    it("handles case insensitive extensions", () => {
      assert.equal(extensionToLanguage(".TS"), "typescript");
      assert.equal(extensionToLanguage(".JS"), "javascript");
      assert.equal(extensionToLanguage(".PY"), "python");
    });
  });

  describe("clearCache", () => {
    it("does not throw", () => {
      clearCache(); // Should not throw
    });
  });

  describe("canHighlight", () => {
    it("returns false when Shiki is not installed", async () => {
      const result = await canHighlight();
      assert.equal(result, false);
    });

    it("returns false on abort signal", async () => {
      const controller = new AbortController();
      controller.abort();
      const result = await canHighlight(controller.signal);
      assert.equal(result, false);
    });
  });
});
