/**
 * Configurable icons for pi-tui header and footer segments.
 *
 * Empty-string overrides disable an icon. Default icons use simple ASCII
 * characters that work in any terminal without Nerd Font.
 */

export interface SegmentIcons {
  /* header */
  version: string;
  model: string;
  skills: string;
  prompts: string;
  extensions: string;
  cwd: string;
  /* footer */
  gitBranch: string;
  gitStatus: string;
  gitCommit: string;
  timer: string;
  runtime: string;
  contextBar: string;
  thinking: string;
  tokenInput: string;
  tokenOutput: string;
  cacheHit: string;
  cost: string;
  extensionStatus: string;
}

export const DEFAULT_ICONS: SegmentIcons = {
  /* header */
  version: "π",
  model: "◆",
  skills: "★",
  prompts: "▶",
  extensions: "●",
  cwd: "@",
  /* footer - matching the screenshot style */
  gitBranch: "*",
  gitStatus: "●",
  gitCommit: "○",
  timer: "○",
  runtime: "▸",
  contextBar: "●",
  thinking: "◎",
  tokenInput: "^",
  tokenOutput: "v",
  cacheHit: "c",
  cost: "$",
  extensionStatus: "&",
};

/** Resolve a configured icon, preserving an explicit empty-string disable. */
export function resolveIcon(
  overrides: Partial<SegmentIcons> | undefined,
  segment: keyof SegmentIcons,
): string {
  if (overrides && segment in overrides) return overrides[segment] ?? "";
  return DEFAULT_ICONS[segment];
}

/** Prefix a label with a styled icon when the resolved icon is enabled. */
export function iconPrefix(
  theme: { fg: (color: string, text: string) => string },
  overrides: Partial<SegmentIcons> | undefined,
  segment: keyof SegmentIcons,
): string {
  const icon = resolveIcon(overrides, segment);
  return icon ? `${theme.fg("muted", icon)} ` : "";
}
