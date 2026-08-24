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
  renderRuntime,
  renderContextBar,
  renderSeparator,
  renderStaleRuntime,
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
  it("renders cwd with branch", () => {
    const ctx = createMockContext();
    const result = renderCwd(ctx);
    assert.ok(result.includes("/home/user/project"));
    assert.ok(result.includes("main"));
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

describe("renderRuntime", () => {
  it("renders runtime uptime", () => {
    const ctx = createMockContext({ startTime: Date.now() - 65000 });
    const result = renderRuntime(ctx);
    assert.ok(result.includes("uptime:"));
    assert.ok(result.includes("1m05s"));
  });
});

describe("renderContextBar", () => {
  it("renders separator when showBar enabled", () => {
    const ctx = createMockContext();
    const result = renderContextBar(ctx);
    assert.ok(result.includes("─"));
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

describe("renderStaleRuntime", () => {
  it("renders stale <1m", () => {
    const ctx = createMockContext({ startTime: Date.now() - 30000 });
    const result = renderStaleRuntime(ctx);
    assert.ok(result.includes("stale:"));
    assert.ok(result.includes("<1m"));
  });

  it("renders stale minutes", () => {
    const ctx = createMockContext({ startTime: Date.now() - 300000 });
    const result = renderStaleRuntime(ctx);
    assert.ok(result.includes("stale: 5m"));
  });

  it("renders stale hours", () => {
    const ctx = createMockContext({ startTime: Date.now() - 5400000 });
    const result = renderStaleRuntime(ctx);
    assert.ok(result.includes("stale: 1h30m"));
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

  it("renders empty when off", () => {
    const ctx = createMockContext({ thinkingLevel: "off" });
    const result = renderThinking(ctx);
    assert.equal(result, "");
  });
});

describe("renderTokens", () => {
  it("renders token stats", () => {
    const ctx = createMockContext({
      usage: { input: 1500, output: 500, cacheRead: 200, cacheWrite: 100, cost: 0 },
    });
    const result = renderTokens(ctx);
    assert.ok(result.includes("↑1.5k"));
    assert.ok(result.includes("↓500"));
    assert.ok(result.includes("R200"));
    assert.ok(result.includes("W100"));
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

  it("renders empty when no cost", () => {
    const ctx = createMockContext({ usage: undefined });
    const result = renderCost(ctx);
    assert.equal(result, "");
  });
});

describe("renderExtStatus", () => {
  it("renders extension statuses", () => {
    const ctx = createMockContext({
      footerData: {
        getGitBranch: () => null,
        getExtensionStatuses: () => new Map([["ext1", "status1"], ["ext2", "status2"]]),
        getAvailableProviderCount: () => 1,
        onBranchChange: () => () => {},
      },
    });
    const result = renderExtStatus(ctx);
    assert.ok(result.includes("status1"));
    assert.ok(result.includes("status2"));
  });

  it("renders empty when no statuses", () => {
    const ctx = createMockContext();
    const result = renderExtStatus(ctx);
    assert.equal(result, "");
  });
});

describe("SEGMENT_RENDERERS", () => {
  it("has all expected segments", () => {
    const expectedSegments = [
      "cwd", "timer", "git", "runtime", "context_bar",
      "separator", "stale_runtime", "model", "thinking",
      "tokens", "cost", "ext_status",
    ];

    for (const segment of expectedSegments) {
      assert.ok(SEGMENT_RENDERERS[segment] !== undefined, `Missing renderer for: ${segment}`);
      assert.equal(typeof SEGMENT_RENDERERS[segment], "function", `Renderer for ${segment} is not a function`);
    }
  });
});
