import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { packSegments, FOOTER_SEPARATOR, installFooter } from "../extensions/pi-tui/footer/index.ts";
import { DEFAULT_CONFIG } from "../extensions/pi-tui/config.ts";
import { visibleWidth } from "@earendil-works/pi-tui";

const segment = (key: string, text: string, priority: number) => ({ key: key as any, text, priority });

describe("canonical footer packing", () => {
  it("keeps configured order when all segments fit", () => {
    const result = packSegments([
      segment("cwd", "CWD", 10),
      segment("model", "MODEL", 9),
      segment("extStatus", "STATUS", 3),
    ], 40);
    assert.equal(result, `CWD${FOOTER_SEPARATOR}MODEL${FOOTER_SEPARATOR}STATUS`);
  });

  it("drops lower-priority segments before higher-priority segments", () => {
    const result = packSegments([
      segment("extStatus", "STATUS", 1),
      segment("cwd", "CWD", 10),
      segment("model", "MODEL", 9),
    ], 9);
    assert.ok(result.includes("CWD"));
    assert.ok(!result.includes("STATUS"));
    assert.ok(visibleWidth(result) <= 9);
  });

  it("truncates a segment without exceeding the width", () => {
    const result = packSegments([segment("cwd", "a very long working directory", 10)], 8);
    assert.ok(visibleWidth(result) <= 8);
    assert.ok(result.includes("…"));
  });

  it("returns empty at zero width", () => {
    assert.equal(packSegments([segment("cwd", "CWD", 10)], 0), "");
  });

  it("renders configured zones within the terminal width", () => {
    let footerFactory: ((tui: unknown, theme: unknown, footerData: unknown) => any) | undefined;
    const context = {
      model: { id: "demo-model", contextWindow: 200_000 },
      thinkingLevel: "medium",
      sessionManager: {
        getCwd: () => "/workspace/project",
        getBranch: () => [
          { type: "message", message: { role: "assistant", usage: {
            input: 1500, output: 500, cacheRead: 200, cacheWrite: 100,
            cost: { total: 0.123 },
          } } },
          { type: "message", message: { role: "toolResult" } },
          { type: "message", message: { role: "assistant", usage: {
            input: 500, output: 250, cacheRead: 50, cacheWrite: 25,
            cost: { total: 0.045 },
          } } },
        ],
      },
      getContextUsage: () => ({ tokens: 80_000, contextWindow: 200_000, percent: 40 }),
      ui: { setFooter: (factory: typeof footerFactory) => { footerFactory = factory; } },
    } as any;
    const footerData = {
      getGitBranch: () => "main",
      getExtensionStatuses: () => new Map(),
      getAvailableProviderCount: () => 1,
      onBranchChange: () => () => {},
    };
    const config = structuredClone(DEFAULT_CONFIG);
    config.header.enabled = false;
    config.footer.segments.gitCommit = true;
    config.footer.git.showCommit = true;
    config.footer.zones = {
      ...config.footer.zones,
      cwd: "center",
      gitBranch: "center",
      gitStatus: "center",
      gitCommit: "center",
      runtime: "right",
      contextBar: "left",
    };
    installFooter(context, () => config, () => ({
      branch: "main", ahead: 1, behind: 0, modified: 1, untracked: 1,
      staged: 0, stashed: 0, conflicted: 0, renamed: 0, deleted: 0,
      commit: { oid: "abcdef1234567890", detached: false, tag: null, subject: "demo commit" },
    }));
    const component = footerFactory!({}, { fg: (_color: string, text: string) => text, bold: (text: string) => text }, footerData);
    const rendered = component.render(140);
    const line = rendered[0]!;
    const metrics = rendered[1]!;
    assert.ok(visibleWidth(line) <= 140);
    assert.ok(!line.includes("…"));
    assert.ok(line.includes("80k/200k"));
    assert.ok(line.includes("/workspace/project"));
    assert.ok(line.includes("main"));
    assert.ok(line.includes("~1 ?1"));
    assert.ok(line.includes("abcdef1 demo commit"));
    assert.ok(line.includes("uptime: 0s"));
    assert.equal(line.match(/0s/g)?.length, 2, "timer segment should be included on line 1");
    assert.ok(metrics.includes("thinking: medium"));
    assert.ok(metrics.includes("2.0k"));
    assert.ok(metrics.includes("750"));
    assert.ok(metrics.includes("R250"));
    assert.ok(metrics.includes("W125"));
    assert.ok(metrics.includes("$0.168"));
  });

  it("keeps Git segments visible when cwd is long", () => {
    const result = packSegments([
      segment("cwd", "/home/rehem/.fob/pi-extensions-e07edc/2/pi-extensions/packages/pi-tui", 10),
      segment("gitBranch", "⎇ main", 8),
      segment("gitStatus", "~1 ?1", 5),
    ], 20);
    assert.ok(result.includes("main"));
    assert.ok(result.includes("~1 ?1"));
  });
});
