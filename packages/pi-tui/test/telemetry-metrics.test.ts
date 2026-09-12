/**
 * Tests for pi-tui telemetry metrics.
 *
 * Uses Node's built-in test runner with simulated time.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultSnapshot,
  processEvent,
  deriveState,
  calcElapsed,
  calcTtft,
  calcTps,
  detectStall,
  formatElapsed,
  formatTps,
  formatTtft,
  STATE_ICONS,
  type TelemetrySnapshot,
  type TelemetryEvent,
  type TelemetryState,
} from "../extensions/pi-tui/telemetry/metrics.ts";

/* ── Helper ── */

function createEvent(
  type: TelemetryEvent["type"],
  timestamp: number,
  overrides?: Partial<TelemetryEvent>,
): TelemetryEvent {
  return { type, timestamp, ...overrides } as TelemetryEvent;
}

/* ── Default snapshot ── */

describe("createDefaultSnapshot", () => {
  it("creates a snapshot with default values", () => {
    const snapshot = createDefaultSnapshot();
    assert.equal(snapshot.elapsed, 0);
    assert.equal(snapshot.ttft, null);
    assert.equal(snapshot.tps, null);
    assert.equal(snapshot.state, "waiting");
    assert.equal(snapshot.activeTool, null);
    assert.equal(snapshot.lastStallTimestamp, null);
  });
});

/* ── State derivation ── */

describe("deriveState", () => {
  it("waiting -> turn_start -> working", () => {
    assert.equal(deriveState("waiting", createEvent("turn_start", 0)), "working");
  });

  it("working -> message_update -> streaming", () => {
    assert.equal(deriveState("working", createEvent("message_update", 0)), "streaming");
  });

  it("working -> tool_call -> tool-running", () => {
    assert.equal(deriveState("working", createEvent("tool_call", 0)), "tool-running");
  });

  it("streaming -> message_update -> streaming", () => {
    assert.equal(deriveState("streaming", createEvent("message_update", 0)), "streaming");
  });

  it("streaming -> tool_call -> tool-running", () => {
    assert.equal(deriveState("streaming", createEvent("tool_call", 0)), "tool-running");
  });

  it("streaming -> turn_end -> waiting", () => {
    assert.equal(deriveState("streaming", createEvent("turn_end", 0)), "waiting");
  });

  it("tool-running -> tool_result -> working", () => {
    assert.equal(deriveState("tool-running", createEvent("tool_result", 0)), "working");
  });

  it("tool-running -> message_update -> streaming", () => {
    assert.equal(deriveState("tool-running", createEvent("message_update", 0)), "streaming");
  });

  it("tool-running -> turn_end -> waiting", () => {
    assert.equal(deriveState("tool-running", createEvent("turn_end", 0)), "waiting");
  });

  it("message event does not change state", () => {
    assert.equal(deriveState("streaming", createEvent("message", 0)), "streaming");
    assert.equal(deriveState("working", createEvent("message", 0)), "working");
  });
});

/* ── Metric calculations ── */

describe("calcElapsed", () => {
  it("returns 0 when turnStartedAt is null", () => {
    assert.equal(calcElapsed(null, 1000), 0);
  });

  it("calculates elapsed time", () => {
    assert.equal(calcElapsed(1000, 5000), 4000);
  });

  it("returns 0 for negative elapsed", () => {
    assert.equal(calcElapsed(5000, 1000), 0);
  });
});

describe("calcTtft", () => {
  it("returns null when turnStartedAt is null", () => {
    assert.equal(calcTtft(null, 1000), null);
  });

  it("returns null when firstTokenAt is null", () => {
    assert.equal(calcTtft(1000, null), null);
  });

  it("calculates time to first token", () => {
    assert.equal(calcTtft(1000, 1500), 500);
  });

  it("returns 0 for negative ttft", () => {
    assert.equal(calcTtft(5000, 1000), 0);
  });
});

describe("calcTps", () => {
  it("returns null when streamStartedAt is null", () => {
    assert.equal(calcTps(null, 0, 100, 2000), null);
  });

  it("returns null for zero elapsed time", () => {
    assert.equal(calcTps(1000, 0, 100, 1000), null);
  });

  it("calculates tokens per second", () => {
    // 100 tokens in 1 second = 100 tps
    assert.equal(calcTps(1000, 0, 100, 2000), 100);
  });

  it("handles partial tokens", () => {
    // 50 tokens in 2 seconds = 25 tps
    assert.equal(calcTps(1000, 0, 50, 3000), 25);
  });

  it("handles tokens from stream start", () => {
    // Started with 50 tokens, now at 150, in 2 seconds = 50 tps
    assert.equal(calcTps(1000, 50, 150, 3000), 50);
  });
});

describe("detectStall", () => {
  it("returns false when lastEventTimestamp is null", () => {
    assert.equal(detectStall(null, 10000), false);
  });

  it("returns false for short gaps", () => {
    assert.equal(detectStall(1000, 5000), false); // 4s gap
  });

  it("returns true for long gaps", () => {
    assert.equal(detectStall(1000, 7000), true); // 6s gap
  });

  it("returns true at exact threshold", () => {
    assert.equal(detectStall(1000, 6000), true); // 5s gap
  });
});

/* ── Format helpers ── */

describe("formatElapsed", () => {
  it("formats seconds", () => {
    assert.equal(formatElapsed(5000), "5s");
  });

  it("formats minutes", () => {
    assert.equal(formatElapsed(125000), "2m05s");
  });

  it("formats hours", () => {
    assert.equal(formatElapsed(3665000), "1h01m");
  });

  it("formats zero", () => {
    assert.equal(formatElapsed(0), "0s");
  });
});

describe("formatTps", () => {
  it("formats low tps", () => {
    assert.equal(formatTps(0.5), "5.0t/s");
  });

  it("formats medium tps", () => {
    assert.equal(formatTps(50.3), "50.3t/s");
  });

  it("formats high tps", () => {
    assert.equal(formatTps(150), "150t/s");
  });
});

describe("formatTtft", () => {
  it("formats milliseconds", () => {
    assert.equal(formatTtft(500), "500ms");
  });

  it("formats seconds", () => {
    assert.equal(formatTtft(1500), "1.5s");
  });
});

describe("STATE_ICONS", () => {
  it("has icons for all states", () => {
    assert.equal(STATE_ICONS.working, "⚙");
    assert.equal(STATE_ICONS.streaming, "▶");
    assert.equal(STATE_ICONS["tool-running"], "⏳");
    assert.equal(STATE_ICONS.waiting, "·");
  });
});

/* ── Full state processing ── */

describe("processEvent", () => {
  it("processes turn_start event", () => {
    const snapshot = createDefaultSnapshot();
    const result = processEvent({
      snapshot,
      event: createEvent("turn_start", 1000),
    });
    assert.equal(result.state, "working");
    assert.equal(result.elapsed, 0);
  });

  it("processes message_update event", () => {
    let snapshot = createDefaultSnapshot();
    // First, start a turn
    snapshot = processEvent({ snapshot, event: createEvent("turn_start", 1000) });
    // Then process message_update
    const result = processEvent({
      snapshot,
      event: createEvent("message_update", 1500),
      outputTokens: 10,
    });
    assert.equal(result.state, "streaming");
    assert.equal(result.ttft, 500); // 1500 - 1000 = 500ms
  });

  it("processes tool_call event", () => {
    const snapshot = createDefaultSnapshot();
    const result = processEvent({
      snapshot,
      event: createEvent("tool_call", 2000, {
        toolCallId: "call-1",
        toolName: "bash",
      }),
    });
    assert.equal(result.state, "tool-running");
    assert.equal(result.activeTool?.name, "bash");
  });

  it("processes tool_result event", () => {
    const snapshot = createDefaultSnapshot();
    snapshot.state = "tool-running";
    snapshot.activeTool = { name: "bash", startedAt: 2000, duration: 0 };
    const result = processEvent({
      snapshot,
      event: createEvent("tool_result", 3000, {
        toolCallId: "call-1",
        toolName: "bash",
      }),
    });
    assert.equal(result.state, "working");
    assert.equal(result.activeTool?.duration, 1000);
  });

  it("processes turn_end event", () => {
    const snapshot = createDefaultSnapshot();
    snapshot.state = "streaming";
    const result = processEvent({
      snapshot,
      event: createEvent("turn_end", 5000),
    });
    assert.equal(result.state, "waiting");
  });

  it("detects stalls", () => {
    const snapshot = createDefaultSnapshot();
    const result = processEvent({
      snapshot,
      event: createEvent("message_update", 10000),
      lastEventTimestamp: 4000, // 6 second gap
    });
    assert.equal(result.lastStallTimestamp, 10000);
  });

  it("calculates TPS correctly", () => {
    let snapshot = createDefaultSnapshot();
    // Start a turn
    snapshot = processEvent({ snapshot, event: createEvent("turn_start", 1000) });
    // First message_update with tokens
    const event1 = createEvent("message_update", 1100);
    (event1 as any).outputTokens = 50;
    snapshot = processEvent({
      snapshot,
      event: event1,
    });
    // Second message_update with more tokens
    const event2 = createEvent("message_update", 2100);
    (event2 as any).outputTokens = 150;
    snapshot = processEvent({
      snapshot,
      event: event2,
    });
    // 100 tokens in 1 second = 100 tps
    assert.equal(snapshot.tps, 100);
  });

  it("full lifecycle: turn_start -> streaming -> tool -> turn_end", () => {
    let snapshot = createDefaultSnapshot();

    // Turn start
    snapshot = processEvent({ snapshot, event: createEvent("turn_start", 1000) });
    assert.equal(snapshot.state, "working");

    // First token
    snapshot = processEvent({ snapshot, event: createEvent("message_update", 1200), outputTokens: 10 });
    assert.equal(snapshot.state, "streaming");
    assert.equal(snapshot.ttft, 200);

    // Tool call
    snapshot = processEvent({
      snapshot,
      event: createEvent("tool_call", 2000, { toolCallId: "c1", toolName: "read" }),
    });
    assert.equal(snapshot.state, "tool-running");
    assert.equal(snapshot.activeTool?.name, "read");

    // Tool result
    snapshot = processEvent({
      snapshot,
      event: createEvent("tool_result", 3000, { toolCallId: "c1", toolName: "read" }),
    });
    assert.equal(snapshot.state, "working");

    // More tokens
    snapshot = processEvent({ snapshot, event: createEvent("message_update", 4000), outputTokens: 100 });
    assert.equal(snapshot.state, "streaming");

    // Turn end
    snapshot = processEvent({ snapshot, event: createEvent("turn_end", 5000) });
    assert.equal(snapshot.state, "waiting");
  });
});
