/**
 * Tests for pi-tui footer segment renderers.
 *
 * Uses Node's built-in test runner.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  renderCwd,
  renderTimer,
  renderGit,
  renderGitStatus,
  renderGitCommit,
  renderContextBar,
  renderSeparator,
  renderModel,
  renderThinking,
  renderTokens,
  renderCost,
  renderExtStatus,
  SEGMENT_RENDERERS,
  type SegmentContext,
} from "../extensions/pi-tui/footer/segments.ts";

/* ── Mock theme ── */

const mockTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

function createMockContext(overrides: Partial<SegmentContext> = {}): SegmentContext {
  return {
    theme: mockTheme,
    cwd: "/home/user/project",
    width: 80,
    footerData: {
      getGitBranch: () => "main",
      getExtensionStatuses: () => new Map(),
      getAvailableProviderCount: () => 1,
      onBranchChange: () => () => {},
    },
    config: {
      git: { showBranch: true, showStatus: true, showCommit: false },
      context: { showBar: true, showCompact: false },
      tokens: { showInput: true, showOutput: true, showCache: true },
      telemetry: { enabled: false, tps: true, ttft: true, stalls: true },
    },
    ...overrides,
  };
}

/* ── Segment renderer tests ── */

describe("renderCwd", () => {
  it("renders cwd without duplicating the separate branch segment", () => {
    const ctx = createMockContext();
    const result = renderCwd(ctx);
    assert.equal(result, "/home/user/project");
  });

  it("renders cwd without branch when git unavailable", () => {
    const ctx = createMockContext({
      footerData: {
        getGitBranch: () => null,
        getExtensionStatuses: () => new Map(),
        getAvailableProviderCount: () => 1,
        onBranchChange: () => () => {},
      },
    });
    const result = renderCwd(ctx);
    assert.equal(result, "/home/user/project");
  });
});

describe("renderTimer", () => {
  it("renders timer with seconds", () => {
    const ctx = createMockContext({ startTime: Date.now() - 5000 });
    const result = renderTimer(ctx);
    assert.ok(result.includes("⏱"));
    assert.ok(result.includes("5s"));
  });

  it("renders timer with minutes", () => {
    const ctx = createMockContext({ startTime: Date.now() - 125000 });
    const result = renderTimer(ctx);
    assert.ok(result.includes("2m05s"));
  });

  it("renders timer with hours", () => {
    const ctx = createMockContext({ startTime: Date.now() - 3665000 });
    const result = renderTimer(ctx);
    assert.ok(result.includes("1h01m"));
  });
});

describe("renderGit", () => {
  it("renders async status counts and normal-branch commit", () => {
    const ctx = createMockContext({
      config: {
        ...createMockContext().config,
        git: { showBranch: true, showStatus: true, showCommit: true },
      },
      git: {
        branch: "main", ahead: 2, behind: 1, modified: 1, untracked: 1,
        staged: 0, stashed: 2, conflicted: 0, renamed: 0, deleted: 0,
        commit: { oid: "1234567890abcdef", detached: false, tag: null, subject: "add footer" },
      },
    });
    assert.ok(renderGitStatus(ctx).includes("~1"));
    assert.ok(renderGitStatus(ctx).includes("$2"));
    assert.ok(renderGitCommit(ctx).includes("1234567"));
    assert.ok(renderGitCommit(ctx).includes("add footer"));
  });

  it("renders git branch", () => {
    const ctx = createMockContext();
    const result = renderGit(ctx);
    assert.ok(result.includes("⎇"));
    assert.ok(result.includes("main"));
  });

  it("renders empty when no branch", () => {
    const ctx = createMockContext({
      footerData: {
        getGitBranch: () => null,
        getExtensionStatuses: () => new Map(),
        getAvailableProviderCount: () => 1,
        onBranchChange: () => () => {},
      },
    });
    const result = renderGit(ctx);
    assert.equal(result, "");
  });
});

describe("renderContextBar", () => {
  it("renders the smart context zone format", () => {
    const ctx = createMockContext({
      contextUsage: { tokens: 4_000, contextWindow: 100_000, percent: 4 },
    });
    const result = renderContextBar(ctx);
    assert.ok(result.includes("🧠"));
    assert.ok(result.includes("smart 96% left"));
    assert.ok(result.includes("│"));
  });

  it("renders empty when showBar disabled", () => {
    const ctx = createMockContext({
      config: {
        ...createMockContext().config,
        context: { showBar: false, showCompact: false },
      },
    });
    const result = renderContextBar(ctx);
    assert.equal(result, "");
  });
});

describe("renderSeparator", () => {
  it("renders pipe character", () => {
    const ctx = createMockContext();
    const result = renderSeparator(ctx);
    assert.equal(result, "│");
  });
});

describe("renderModel", () => {
  it("renders model name", () => {
    const ctx = createMockContext({ modelId: "claude-3-opus" });
    const result = renderModel(ctx);
    assert.equal(result, "claude-3-opus");
  });

  it("renders no-model when undefined", () => {
    const ctx = createMockContext({ modelId: undefined });
    const result = renderModel(ctx);
    assert.equal(result, "no-model");
  });
});

describe("renderThinking", () => {
  it("renders thinking level", () => {
    const ctx = createMockContext({ thinkingLevel: "high" });
    const result = renderThinking(ctx);
    assert.ok(result.includes("thinking: high"));
  });

  it("renders off when disabled", () => {
    const ctx = createMockContext({ thinkingLevel: "off" });
    const result = renderThinking(ctx);
    assert.equal(result, "thinking: off");
  });
});

describe("renderTokens", () => {
  it("renders token stats", () => {
    const ctx = createMockContext({
      usage: { input: 1500, output: 500, cacheRead: 200, cacheWrite: 100, cost: 0 },
    });
    const result = renderTokens(ctx);
    assert.ok(result.includes("↓1.5k"));
    assert.ok(result.includes("↑500"));
    assert.ok(result.includes("R200"));
    assert.ok(result.includes("W100"));
  });

  it("renders zero values when usage is available", () => {
    const ctx = createMockContext({
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    });
    const result = renderTokens(ctx);
    assert.ok(result.includes("↓0"));
    assert.ok(result.includes("↑0"));
    assert.ok(result.includes("R0"));
    assert.ok(result.includes("W0"));
  });

  it("renders empty when no usage", () => {
    const ctx = createMockContext({ usage: undefined });
    const result = renderTokens(ctx);
    assert.equal(result, "");
  });
});

describe("renderCost", () => {
  it("renders cost", () => {
    const ctx = createMockContext({
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0.123 },
    });
    const result = renderCost(ctx);
    assert.equal(result, "$0.123");
  });

  it("renders zero cost when usage is unavailable", () => {
    const ctx = createMockContext({ usage: undefined });
    const result = renderCost(ctx);
    assert.equal(result, "$0.000");
  });
});

describe("renderExtStatus", () => {
  it("renders extension statuses", () => {
    const ctx = createMockContext({
      footerData: {
        getGitBranch: () => null,
        getExtensionStatuses: () => new Map([["ext2", "status2"], ["ext1", "status1"]]),
        getAvailableProviderCount: () => 1,
        onBranchChange: () => () => {},
      },
    });
    const result = renderExtStatus(ctx);
    assert.equal(result, "status1 status2");
  });

  it("renders empty when no statuses", () => {
    const ctx = createMockContext();
    const result = renderExtStatus(ctx);
    assert.equal(result, "");
  });
});

describe("SEGMENT_RENDERERS", () => {
  it("renders each segment through the registry", () => {
    const expectedSegments = [
      "cwd", "timer", "git", "context_bar",
      "separator", "model", "thinking",
      "tokens", "cost", "ext_status",
    ];
    const ctx = createMockContext();

    for (const segment of expectedSegments) {
      const renderer = SEGMENT_RENDERERS[segment];
      assert.ok(renderer !== undefined, `Missing renderer for: ${segment}`);
      const result = renderer(ctx);
      assert.equal(typeof result, "string", `Renderer ${segment} did not return a string`);
    }
  });
});
