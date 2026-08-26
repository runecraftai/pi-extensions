import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ICONS, resolveIcon, type SegmentIcons } from "../extensions/pi-tui/icons.ts";
import { renderGitBranch, renderModel, renderTimer, type SegmentContext } from "../extensions/pi-tui/footer/segments.ts";
import { renderInfoBar } from "../extensions/pi-tui/header/info-bar.ts";

const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };
const footerData = {
  getGitBranch: () => null,
  getExtensionStatuses: () => new Map<string, string>(),
  getAvailableProviderCount: () => 1,
  onBranchChange: () => () => {},
};
const config = {
  enabled: true,
  segments: {} as any,
  zones: {} as any,
  git: { showBranch: true, showStatus: true, showCommit: false },
  context: { showBar: true, showCompact: false },
  tokens: { showInput: true, showOutput: true, showCache: true },
  cost: {},
  telemetry: { enabled: false, tps: true, ttft: true, stalls: true },
  runtime: {}, timer: {}, model: {}, thinking: {}, extStatus: {},
};

function context(overrides: Partial<SegmentContext> = {}): SegmentContext {
  return {
    theme, cwd: "/tmp", width: 80, footerData, config,
    modelId: "model", iconMode: "nerd", iconOverrides: {}, ...overrides,
  };
}

describe("Nerd Font icon resolution", () => {
  it("uses a default for every declared segment", () => {
    for (const key of Object.keys(DEFAULT_ICONS) as (keyof SegmentIcons)[]) {
      assert.notEqual(resolveIcon(undefined, key), "");
    }
  });

  it("uses custom and explicit disabled overrides", () => {
    assert.equal(resolveIcon({ model: "M" }, "model"), "M");
    assert.equal(resolveIcon({ model: "" }, "model"), "");
    assert.equal(resolveIcon({ model: "M" }, "cwd"), DEFAULT_ICONS.cwd);
  });

  it("renders footer icons through the segment renderer", () => {
    assert.equal(renderModel(context({ iconOverrides: { model: "M" } })), "M model");
    assert.equal(renderModel(context({ iconMode: "ascii" })), "model");
  });

  it("honors explicit empty footer icon overrides", () => {
    const footerConfig = {
      ...config,
      git: { ...config.git, icon: "" },
      timer: { icon: "" },
    };
    const footer = context({
      config: footerConfig,
      footerData: { ...footerData, getGitBranch: () => "main" },
      startTime: Date.now(),
    });
    assert.equal(renderGitBranch(footer), "main");
    assert.equal(renderTimer(footer), "0s");

    const globallyDisabled = context({
      footerData: { ...footerData, getGitBranch: () => "main" },
      iconOverrides: { gitBranch: "", timer: "" },
      startTime: Date.now(),
    });
    assert.equal(renderGitBranch(globallyDisabled), "main");
    assert.equal(renderTimer(globallyDisabled), "0s");
  });

  it("renders configurable header icons and supports disabling them", () => {
    const header = {
      enabled: true, animateLogo: false, logoColor: "", logoSpeed: 0,
      ibmStripes: false, minecraftGradient: false, slogan: "", showSlogan: false,
      sloganColor: false, showVersion: true, showModel: true, showCwd: true,
      showTips: false, showStatsBar: false, tipCount: 0,
      icons: { version: "V", model: "", cwd: "" },
    };
    const lines = renderInfoBar(header, { extensions: 0, skills: 0, prompts: 0, agents: "" },
      { getThinkingLevel: () => "off" } as any,
      { cwd: "/tmp", model: { id: "model" } } as any,
      theme as any, 80);
    assert.ok(lines[0]?.startsWith("V Pi"));
    assert.ok(lines[1]?.startsWith("model"));
    assert.ok(lines[2]?.startsWith("/tmp"));
  });
});
