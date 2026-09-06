/**
 * Configurable Nerd Font icons for pi-tui header and footer segments.
 *
 * Empty-string overrides disable an icon. The default vocabulary follows the
 * source plugins unified by this extension (pi-open-tui and pi-vitals).
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
  contextBar: string;
  thinking: string;
  tokenInput: string;
  tokenOutput: string;
  cacheHit: string;
  cost: string;
  extensionStatus: string;
  /* renderers */
  readFile: string;
  searchResult: string;
  listing: string;
  command: string;
  diff: string;
  expanded: string;
  collapsed: string;
}

export const DEFAULT_ICONS: SegmentIcons = {
  version: "\u{F17C}",
  model: "\u{EC19}",
  skills: "\u{EB64}",
  prompts: "\u{F15C}",
  extensions: "\u{EB25}",
  cwd: "\u{F07B}",
  gitBranch: "\u{F126}",
  gitStatus: "\u{F1D3}",
  gitCommit: "\u{F1D3}",
  timer: "\u{F017}",
  contextBar: "\u{E70F}",
  thinking: "\u{F5DC}",
  tokenInput: "\u{F090}",
  tokenOutput: "\u{F08B}",
  cacheHit: "\u{F1C0}",
  cost: "\u{F155}",
  extensionStatus: "\u{EB25}",
  readFile: "\u{F15C}",
  searchResult: "\u{F002}",
  listing: "\u{F07B}",
  command: "\u{F489}",
  diff: "\u{F440}",
  expanded: "\u{F103}",
  collapsed: "\u{F104}",
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
