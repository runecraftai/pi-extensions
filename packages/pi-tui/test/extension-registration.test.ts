/** Regression coverage for package registration, config loading, and footer rendering. */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import extension from "../extensions/pi-tui/index.ts";
import { getConfigPath, loadConfig } from "../extensions/pi-tui/config.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

function createContext(setFooter: (factory: unknown) => void) {
  return {
    mode: "tui",
    ui: {
      theme,
      setHeader: () => {},
      setFooter,
      notify: () => {},
    },
    sessionManager: { getCwd: () => "/tmp/pi-tui-project" },
    model: { id: "configured-model", contextWindow: 128000 },
  };
}

describe("pi-tui package registration", () => {
  it("declares the extension entry and renders configured footer segments", async () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { pi?: { extensions?: string[] } };
    assert.deepEqual(packageJson.pi?.extensions, ["./extensions/pi-tui"]);

    const agentDir = mkdtempSync(join(tmpdir(), "pi-tui-test-"));
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;

    try {
      writeFileSync(
        join(agentDir, "pi-tui.json"),
        JSON.stringify({
          enabled: true,
          header: { enabled: false },
          footer: {
            enabled: true,
            line1: { segments: ["context_bar"] },
            line2: { segments: ["model"] },
          },
        }),
      );

      assert.equal(getConfigPath(), join(agentDir, "pi-tui.json"));
      const config = loadConfig();
      assert.deepEqual(config.footer.line1.segments, ["context_bar"]);
      assert.deepEqual(config.footer.line2.segments, ["model"]);

      let sessionStart: ((event: unknown, ctx: unknown) => void) | undefined;
      let sessionShutdown: ((event: unknown, ctx: unknown) => void) | undefined;
      let footerFactory:
        | ((tui: unknown, theme: unknown, footerData: unknown) => { render(width: number): string[]; dispose?(): void })
        | undefined;

      const pi = {
        on(event: string, handler: (event: unknown, ctx: unknown) => void) {
          if (event === "session_start") sessionStart = handler;
          if (event === "session_shutdown") sessionShutdown = handler;
        },
        registerCommand: () => {},
        getCommands: () => [],
      };
      const ctx = createContext((factory) => {
        footerFactory = factory as typeof footerFactory;
      });

      extension(pi as never);
      sessionStart?.({ reason: "startup" }, ctx);
      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.ok(footerFactory, "footer factory should be registered");
      const footer = footerFactory(
        { requestRender: () => {} },
        theme,
        {
          getGitBranch: () => "main",
          getExtensionStatuses: () => new Map(),
          getAvailableProviderCount: () => 1,
          onBranchChange: () => () => {},
        },
      );
      assert.deepEqual(footer.render(24), ["─".repeat(24), "configured-model"]);

      sessionShutdown?.({}, ctx);
    } finally {
      if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
      rmSync(agentDir, { recursive: true, force: true });
    }
  });
});
