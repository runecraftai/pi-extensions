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
    sessionManager: { getCwd: () => "/tmp/pi-tui-project", getBranch: () => [] },
    model: { id: "configured-model", contextWindow: 128000 },
    thinkingLevel: "off",
    getContextUsage: () => ({ tokens: 50_000, contextWindow: 100_000, percent: 50 }),
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
          icons: { mode: "ascii" },
          header: { enabled: false },
          footer: {
            enabled: true,
            segments: {
              cwd: false,
              timer: false,
              gitBranch: false,
              gitStatus: false,
              gitCommit: false,
              contextBar: true,
              model: true,
              thinking: false,
              tokens: false,
              cost: false,
              extStatus: true,
            },
            context: { showBar: true },
          },
        }),
      );

      assert.equal(getConfigPath(), join(agentDir, "pi-tui.json"));
      const config = loadConfig();
      assert.equal(config.footer.segments.contextBar, true);
      assert.equal(config.footer.segments.model, true);
      assert.equal(config.footer.segments.extStatus, true);

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
      for (let attempt = 0; attempt < 20 && !footerFactory; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      assert.ok(footerFactory, "footer factory should be registered");
      const footer = footerFactory(
        { requestRender: () => {} },
        theme,
        {
          getGitBranch: () => "main",
          getExtensionStatuses: () => new Map([["status", "configured-status"]]),
          getAvailableProviderCount: () => 1,
          onBranchChange: () => () => {},
        },
      );
      const rendered = footer.render(80);
      assert.equal(rendered.length, 2);
      assert.match(rendered[0]!, /warm 20% left/);
      assert.equal(rendered[1]!.trim(), "configured-model · configured-status");

      sessionShutdown?.({}, ctx);
    } finally {
      if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
      rmSync(agentDir, { recursive: true, force: true });
    }
  });
});
