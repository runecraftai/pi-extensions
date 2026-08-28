/**
 * pi-tui config schema, load/save/defaults.
 *
 * Config file: ~/.pi/agent/pi-tui.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { SegmentIcons } from "./icons.ts";

/* ── Types ── */

export interface HeaderConfig {
  enabled: boolean;
  animateLogo: boolean;
  logoColor: string;
  logoSpeed: number;
  ibmStripes: boolean;
  minecraftGradient: boolean;
  slogan: string;
  showSlogan: boolean;
  sloganColor: boolean;
  showVersion: boolean;
  showModel: boolean;
  showCwd: boolean;
  showTips: boolean;
  showStatsBar: boolean;
  tipCount: number;
  icons: Partial<SegmentIcons>;
}

export type FooterSegmentKey =
  | "cwd" | "timer" | "gitBranch" | "gitStatus" | "gitCommit"
  | "contextBar" | "model" | "thinking"
  | "tokens" | "cost" | "extStatus";

export type FooterZone = "left" | "center" | "right";

export type FooterZoneConfig = Record<FooterSegmentKey, FooterZone>;

export interface FooterSegments {
  cwd: boolean;
  timer: boolean;
  gitBranch: boolean;
  gitStatus: boolean;
  gitCommit: boolean;
  contextBar: boolean;
  model: boolean;
  thinking: boolean;
  tokens: boolean;
  cost: boolean;
  extStatus: boolean;
}

export interface FooterConfig {
  enabled: boolean;
  segments: FooterSegments;
  zones: FooterZoneConfig;
  git: { showBranch: boolean; showStatus: boolean; showCommit: boolean; icon?: string };
  context: { showBar: boolean; showCompact: boolean; icon?: string };
  tokens: {
    showInput: boolean;
    showOutput: boolean;
    showCache: boolean;
    inputIcon?: string;
    outputIcon?: string;
    cacheIcon?: string;
  };
  cost: { icon?: string };
  telemetry: { enabled: boolean; tps: boolean; ttft: boolean; stalls: boolean };
  timer: { icon?: string };
  model: { icon?: string };
  thinking: { icon?: string };
  extStatus: { icon?: string };
}

export type CursorStyle = "block" | "bar" | "underline";

export interface EditorConfig {
  cursorStyle: CursorStyle;
  roundedBorders: boolean;
}

export interface PiTuiConfig {
  enabled: boolean;
  header: HeaderConfig;
  footer: FooterConfig;
  editor: EditorConfig;
  icons: { mode: string; custom: Record<string, string> };
  colors: { overrides: Record<string, string> };
}

/* ── Defaults ── */

export const DEFAULT_HEADER: HeaderConfig = {
  enabled: true,
  animateLogo: true,
  logoColor: "c",
  logoSpeed: 50,
  ibmStripes: true,
  minecraftGradient: true,
  slogan: "Code something that makes you proud",
  showSlogan: true,
  sloganColor: true,
  showVersion: true,
  showModel: true,
  showCwd: true,
  showTips: true,
  showStatsBar: true,
  tipCount: 3,
  icons: {},
};

const DEFAULT_FOOTER: FooterConfig = {
  enabled: true,
  segments: {
    cwd: true,
    timer: true,
    gitBranch: true,
    gitStatus: true,
    gitCommit: false,
    contextBar: true,
    model: true,
    thinking: true,
    tokens: true,
    cost: true,
    extStatus: true,
  },
  zones: {
    // Layout D: LEFT = project identity, RIGHT = metrics
    cwd: "left",
    gitBranch: "left",
    gitStatus: "left",
    gitCommit: "left",
    timer: "right",
    contextBar: "right",
    model: "right",
    thinking: "right",
    tokens: "right",
    cost: "right",
    extStatus: "right",
  },
  git: { showBranch: true, showStatus: true, showCommit: true },
  context: { showBar: true, showCompact: false },
  tokens: { showInput: true, showOutput: true, showCache: true },
  cost: {},
  telemetry: { enabled: false, tps: true, ttft: true, stalls: true },
  timer: {},
  model: {},
  thinking: {},
  extStatus: {},
};

const DEFAULT_EDITOR: EditorConfig = {
  cursorStyle: "block",
  roundedBorders: true,
};

export const DEFAULT_CONFIG: PiTuiConfig = {
  enabled: true,
  header: structuredClone(DEFAULT_HEADER),
  footer: structuredClone(DEFAULT_FOOTER),
  editor: structuredClone(DEFAULT_EDITOR),
  icons: { mode: "auto", custom: {} },
  colors: { overrides: {} },
};

/* ── Config path ── */

export function getConfigPath(): string {
  return join(getAgentDir(), "pi-tui.json");
}

/* ── Deep merge ── */

function deepMerge<T>(base: T, override: unknown): T {
  if (typeof base !== "object" || base === null || Array.isArray(base)) {
    return (override as T) ?? base;
  }
  if (typeof override !== "object" || override === null || Array.isArray(override)) {
    return base;
  }
  const result = { ...(base as Record<string, unknown>) };
  const overrideRec = override as Record<string, unknown>;
  for (const key of Object.keys(overrideRec)) {
    const baseVal = (base as Record<string, unknown>)[key];
    const overVal = overrideRec[key];
    if (
      typeof baseVal === "object" &&
      baseVal !== null &&
      !Array.isArray(baseVal) &&
      typeof overVal === "object" &&
      overVal !== null &&
      !Array.isArray(overVal)
    ) {
      result[key] = deepMerge(baseVal, overVal);
    } else if (overVal !== undefined) {
      result[key] = overVal;
    }
  }
  return result as T;
}

/* ── Load / Save ── */

export function loadConfig(): PiTuiConfig {
  const path = getConfigPath();
  if (!existsSync(path)) {
    return structuredClone(DEFAULT_CONFIG);
  }

  try {
    const raw = readFileSync(path, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return deepMerge(structuredClone(DEFAULT_CONFIG), parsed);
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function saveConfig(config: PiTuiConfig): void {
  const path = getConfigPath();
  try {
    const agentDir = getAgentDir();
    if (!existsSync(agentDir)) {
      mkdirSync(agentDir, { recursive: true });
    }
    writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf8");
  } catch {
    // best-effort persistence
  }
}
