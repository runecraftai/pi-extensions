/**
 * Pure telemetry metrics — no Pi dependency, fully testable.
 *
 * Consumes timestamped events and derives:
 * - elapsed: wall-clock ms since response start
 * - ttft: ms from turn_start to first message_update
 * - tps: output tokens per second after stream start
 * - state: working | streaming | tool-running | waiting
 * - activeTool: name + duration of currently running tool
 */

/* ── Event types (minimal, no Pi import) ── */

export interface TurnStartEvent {
  type: "turn_start";
  turnIndex: number;
  timestamp: number;
}

export interface MessageUpdateEvent {
  type: "message_update";
  timestamp: number;
  outputTokens?: number;
}

export interface ToolCallEvent {
  type: "tool_call";
  toolCallId: string;
  toolName: string;
  timestamp: number;
}

export interface ToolResultEvent {
  type: "tool_result";
  toolCallId: string;
  toolName: string;
  timestamp: number;
}

export interface TurnEndEvent {
  type: "turn_end";
  turnIndex: number;
  timestamp: number;
}

export interface MessageEvent {
  type: "message";
  timestamp: number;
}

export type TelemetryEvent =
  | TurnStartEvent
  | MessageUpdateEvent
  | ToolCallEvent
  | ToolResultEvent
  | TurnEndEvent
  | MessageEvent;

/* ── State ── */

export type TelemetryState = "working" | "streaming" | "tool-running" | "waiting";

export interface ActiveTool {
  name: string;
  startedAt: number;
  duration: number;
}

export interface TelemetrySnapshot {
  /** Wall-clock ms since the current response started (turn_start). */
  elapsed: number;
  /** ms from turn_start to first message_update (tokens arriving). */
  ttft: number | null;
  /** Output tokens per second after stream start. */
  tps: number | null;
  /** Current state derived from events. */
  state: TelemetryState;
  /** Currently executing tool, if any. */
  activeTool: ActiveTool | null;
  /** Timestamp of last stall detection (long pause between events). */
  lastStallTimestamp: number | null;
  /** Internal: timestamp of turn_start for calculating elapsed. */
  _turnStartedAt: number | null;
  /** Internal: timestamp of first message_update for calculating ttft. */
  _streamStartedAt: number | null;
  /** Internal: output tokens at stream start for calculating tps. */
  _outputTokensAtStreamStart: number;
  /** Internal: current output tokens. */
  _currentOutputTokens: number;
}

/* ── Default snapshot ── */

export function createDefaultSnapshot(): TelemetrySnapshot {
  return {
    elapsed: 0,
    ttft: null,
    tps: null,
    state: "waiting",
    activeTool: null,
    lastStallTimestamp: null,
    _turnStartedAt: null,
    _streamStartedAt: null,
    _outputTokensAtStreamStart: 0,
    _currentOutputTokens: 0,
  };
}

/* ── State machine ── */

/**
 * Derive state from the most recent event.
 * States:
 *   waiting   → turn_start        → working
 *   working   → message_update    → streaming
 *   working   → tool_call         → tool-running
 *   streaming → message_update    → streaming
 *   streaming → tool_call         → tool-running
 *   streaming → turn_end          → waiting
 *   tool-running → tool_result    → working (or streaming if there were updates)
 *   tool-running → message_update → streaming
 *   tool-running → turn_end       → waiting
 */
export function deriveState(
  current: TelemetryState,
  event: TelemetryEvent,
): TelemetryState {
  switch (event.type) {
    case "turn_start":
      return "working";
    case "message_update":
      return "streaming";
    case "tool_call":
      return "tool-running";
    case "tool_result":
      // After a tool result, we go back to working (waiting for next update)
      return "working";
    case "turn_end":
      return "waiting";
    case "message":
      return current; // Message events don't change state
    default:
      return current;
  }
}

/* ── Metrics calculation ── */

/** Calculate elapsed ms since turn start. */
export function calcElapsed(turnStartedAt: number | null, now: number): number {
  if (turnStartedAt === null) return 0;
  return Math.max(0, now - turnStartedAt);
}

/** Calculate TTFT (ms to first token). */
export function calcTtft(turnStartedAt: number | null, firstTokenAt: number | null): number | null {
  if (turnStartedAt === null || firstTokenAt === null) return null;
  return Math.max(0, firstTokenAt - turnStartedAt);
}

/** Calculate TPS (output tokens per second after stream start). */
export function calcTps(
  streamStartedAt: number | null,
  outputTokensAtStreamStart: number,
  currentOutputTokens: number,
  now: number,
): number | null {
  if (streamStartedAt === null) return null;
  const elapsedSec = (now - streamStartedAt) / 1000;
  if (elapsedSec <= 0) return null;
  const tokensGenerated = Math.max(0, currentOutputTokens - outputTokensAtStreamStart);
  return tokensGenerated / elapsedSec;
}

/* ── Stall detection (informational, not heuristic) ── */

const STALL_THRESHOLD_MS = 5000;

/**
 * Detect a stall: a long pause between events.
 * This is purely informational — it does NOT predict stalls,
 * it only reports when a gap exceeded the threshold.
 */
export function detectStall(
  lastEventTimestamp: number | null,
  currentTimestamp: number,
): boolean {
  if (lastEventTimestamp === null) return false;
  return (currentTimestamp - lastEventTimestamp) >= STALL_THRESHOLD_MS;
}

/* ── Full state update ── */

export interface UpdateStateInput {
  snapshot: TelemetrySnapshot;
  event: TelemetryEvent;
  /** Callback to record timestamps for stall detection. */
  lastEventTimestamp?: number;
}

/**
 * Process an event and return a new snapshot.
 * Pure function — no side effects.
 */
export function processEvent(input: UpdateStateInput): TelemetrySnapshot {
  const { snapshot, event } = input;
  const now = event.timestamp;

  // Start with a copy of the snapshot
  const newSnapshot: TelemetrySnapshot = {
    ...snapshot,
    _turnStartedAt: snapshot._turnStartedAt,
    _streamStartedAt: snapshot._streamStartedAt,
    _outputTokensAtStreamStart: snapshot._outputTokensAtStreamStart,
    _currentOutputTokens: snapshot._currentOutputTokens,
  };

  // Derive new state
  newSnapshot.state = deriveState(snapshot.state, event);

  // Handle turn_start
  if (event.type === "turn_start") {
    newSnapshot._turnStartedAt = now;
    newSnapshot._streamStartedAt = null;
    newSnapshot._outputTokensAtStreamStart = 0;
    newSnapshot._currentOutputTokens = 0;
    newSnapshot.ttft = null;
    newSnapshot.tps = null;
  }

  // Handle message_update (streaming tokens)
  if (event.type === "message_update") {
    const updateEvent = event as MessageUpdateEvent;

    // Track first token for TTFT
    if (newSnapshot._streamStartedAt === null) {
      newSnapshot._streamStartedAt = now;
      if (newSnapshot._turnStartedAt !== null) {
        newSnapshot.ttft = now - newSnapshot._turnStartedAt;
      }
    }

    // Track output tokens for TPS
    if (updateEvent.outputTokens !== undefined) {
      // If this is the first token we've seen, record it as the baseline
      if (newSnapshot._currentOutputTokens === 0 && updateEvent.outputTokens > 0) {
        newSnapshot._outputTokensAtStreamStart = updateEvent.outputTokens;
      }
      newSnapshot._currentOutputTokens = updateEvent.outputTokens;
    }
  }

  // Handle tool_call
  if (event.type === "tool_call") {
    const toolEvent = event as ToolCallEvent;
    newSnapshot.activeTool = {
      name: toolEvent.toolName,
      startedAt: now,
      duration: 0,
    };
  }

  // Handle tool_result
  if (event.type === "tool_result") {
    const toolEvent = event as ToolResultEvent;
    if (newSnapshot.activeTool && newSnapshot.activeTool.name === toolEvent.toolName) {
      newSnapshot.activeTool = {
        ...newSnapshot.activeTool,
        duration: now - newSnapshot.activeTool.startedAt,
      };
    }
  }

  // Update active tool duration if still running
  if (newSnapshot.activeTool && newSnapshot.activeTool.duration === 0) {
    newSnapshot.activeTool = {
      ...newSnapshot.activeTool,
      duration: now - newSnapshot.activeTool.startedAt,
    };
  }

  // Stall detection
  if (detectStall(input.lastEventTimestamp, now)) {
    newSnapshot.lastStallTimestamp = now;
  }

  // Calculate derived metrics
  newSnapshot.elapsed = calcElapsed(newSnapshot._turnStartedAt, now);

  // Calculate TPS if we have stream data
  if (newSnapshot._streamStartedAt !== null && newSnapshot._currentOutputTokens > 0) {
    const elapsedSec = (now - newSnapshot._streamStartedAt) / 1000;
    if (elapsedSec > 0) {
      const tokensGenerated = Math.max(0, newSnapshot._currentOutputTokens - newSnapshot._outputTokensAtStreamStart);
      newSnapshot.tps = tokensGenerated / elapsedSec;
    }
  }

  return newSnapshot;
}

/* ── Format helpers ── */

export function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) return `${hours}h${minutes.toString().padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
  return `${seconds}s`;
}

export function formatTps(tps: number): string {
  if (tps < 1) return `${(tps * 10).toFixed(1)}t/s`;
  if (tps < 100) return `${tps.toFixed(1)}t/s`;
  return `${Math.round(tps)}t/s`;
}

export function formatTtft(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export const STATE_ICONS: Record<TelemetryState, string> = {
  working: "⚙",
  streaming: "▶",
  "tool-running": "⏳",
  waiting: "·",
};
