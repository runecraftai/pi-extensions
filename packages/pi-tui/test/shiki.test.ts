/**
 * Tests for shiki lazy loader — fallback, cache, timeout.
 *
 * Exercise unavailable-dependency and abort paths in isolated processes so
 * installed workspace dependencies and earlier module caches cannot mask them.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  highlight,
  highlightSync,
  clearCache,
  extensionToLanguage,
  canHighlight,
} from "../extensions/pi-tui/renderers/shiki.ts";

function isolatedShiki(expression: string, unavailable = false) {
  const moduleUrl = new URL("../extensions/pi-tui/renderers/shiki.ts", import.meta.url).href;
  const output = execFileSync(process.execPath, ["--input-type=module", "--eval", `
    import { registerHooks } from "node:module";
    ${unavailable ? `registerHooks({ resolve(specifier, context, next) {
      if (specifier === "shiki") throw new Error("Shiki deliberately unavailable");
      return next(specifier, context);
    } });` : ""}
    const shiki = await import(${JSON.stringify(moduleUrl)});
    console.log(JSON.stringify(await (${expression})));
  `], { encoding: "utf8" });
  return JSON.parse(output);
}

describe("shiki", () => {
  describe("highlight", () => {
    it("returns plain text when Shiki is not available", async () => {
      const code = 'const x = 1;\nconsole.log(x);';
      const result = isolatedShiki(`shiki.highlight(${JSON.stringify(code)}, "typescript", "github-dark")`, true);
      assert.equal(result, code);
    });

    it("returns empty string for empty input", async () => {
      const result = await highlight("", "typescript", "github-dark");
      assert.equal(result, "");
    });

    it("returns plain text on abort signal", async () => {
      const code = 'const x = 1;';
      const result = isolatedShiki(`shiki.highlight(${JSON.stringify(code)}, "typescript", "github-dark", AbortSignal.abort())`);
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
    it("reports whether Shiki is installed", async () => {
      const installed = await import("shiki").then(() => true, () => false);
      assert.equal(await canHighlight(), installed);
    });

    it("returns false when Shiki loading is unavailable", () => {
      assert.equal(isolatedShiki("shiki.canHighlight()", true), false);
    });

    it("returns false on abort signal", async () => {
      const result = isolatedShiki("shiki.canHighlight(AbortSignal.abort())");
      assert.equal(result, false);
    });
  });
});
