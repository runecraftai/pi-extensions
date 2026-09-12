/**
 * Telemetry integration — consumes Pi events, feeds metrics to the footer.
 *
 * No multiplexer/operator imports. Only consumes Pi events and types.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { PiTuiConfig } from "../config.ts";
import {
  createDefaultSnapshot,
  processEvent,
  type TelemetryEvent,
  type TelemetrySnapshot,
  type ToolCallEvent,
  type ToolResultEvent,
  type MessageUpdateEvent,
  type TurnStartEvent,
  type TurnEndEvent,
} from "./metrics.ts";

/* ── Shared state ── */

export interface TelemetryState {
  snapshot: TelemetrySnapshot;
  /** Last event timestamp for stall detection. */
  lastEventTimestamp: number | null;
}

export function createTelemetryState(): TelemetryState {
  return {
    snapshot: createDefaultSnapshot(),
    lastEventTimestamp: null,
  };
}

/* ── Event mapping ── */

function mapPiEvent(
  eventType: string,
  event: any,
): TelemetryEvent | null {
  const now = Date.now();
  switch (eventType) {
    case "turn_start":
      return { type: "turn_start", turnIndex: event.turnIndex ?? 0, timestamp: now };
    case "message_update": {
      const assistantEvent = event.assistantMessageEvent;
      const outputTokens = assistantEvent?.usage?.output;
      return { type: "message_update", timestamp: now, outputTokens };
    }
    case "tool_call":
      return {
        type: "tool_call",
        toolCallId: event.toolCallId ?? "",
        toolName: event.toolName ?? "unknown",
        timestamp: now,
      };
    case "tool_result":
      return {
        type: "tool_result",
        toolCallId: event.toolCallId ?? "",
        toolName: event.toolName ?? "unknown",
        timestamp: now,
      };
    case "turn_end":
      return { type: "turn_end", turnIndex: event.turnIndex ?? 0, timestamp: now };
    default:
      return null;
  }
}

/* ── Installation ── */

export interface TelemetryHandle {
  /** Get the current telemetry snapshot. */
  getSnapshot: () => TelemetrySnapshot;
  /** Uninstall the telemetry listeners. */
  dispose: () => void;
}

export function installTelemetry(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  getConfig: () => PiTuiConfig,
  requestRender: () => void,
): TelemetryHandle {
  const state = createTelemetryState();

  // Register event handlers
  const eventTypes = ["turn_start", "message_update", "tool_call", "tool_result", "turn_end"];

  for (const eventType of eventTypes) {
    pi.on(eventType as any, (event: any, _ctx: ExtensionContext) => {
      if (!getConfig().footer.telemetry.enabled) return;

      const mapped = mapPiEvent(eventType, event);
      if (!mapped) return;

      state.snapshot = processEvent({
        snapshot: state.snapshot,
        event: mapped,
        lastEventTimestamp: state.lastEventTimestamp,
      });
      state.lastEventTimestamp = event.timestamp ?? Date.now();

      requestRender();
    });
  }

  return {
    getSnapshot: () => state.snapshot,
    dispose: () => {
      // Pi event handlers don't return unsubscribe functions,
      // but the extension lifecycle handles cleanup on session_shutdown
    },
  };
}

export type { TelemetrySnapshot } from "./metrics.ts";
