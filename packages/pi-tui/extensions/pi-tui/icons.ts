/**
 * Configurable icons for pi-tui header and footer segments.
 *
 * Default icons use Nerd Font for rich visuals. When iconMode is "ascii",
 * simple ASCII characters are used instead. Empty-string overrides disable
 * an icon entirely.
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

/* Nerd Font icons (used when iconMode is "auto" or "nerd") */
export const NERD_ICONS: SegmentIcons = {
  version: "\u{F17C}",   //  (Pi logo)
  model: "\u{EC19}",     //  
  skills: "\u{EB64}",    //  
  prompts: "\u{F15C}",   // ▶
  extensions: "\u{EB25}", // ●
  cwd: "\u{F07B}",       //  
  gitBranch: "\u{F126}", // ⎇
  gitStatus: "\u{F1D3}", // ●
  gitCommit: "\u{F1D3}", // ○
  timer: "\u{F017}",     //  
  runtime: "\u{F120}",   // ▸
  contextBar: "\u{E70F}", // ●
  thinking: "\u{F5DC}",  // ◎
  tokenInput: "\u{F090}", // ↑
  tokenOutput: "\u{F08B}", // ↓
  cacheHit: "\u{F1C0}",  // c
  cost: "\u{F155}",      // $
  extensionStatus: "\u{EB25}", // &
};

/* ASCII icons (used when iconMode is "ascii") */
export const ASCII_ICONS: SegmentIcons = {
  version: "pi",
  model: "M",
  skills: "*",
  prompts: ">",
  extensions: ".",
  cwd: "@",
  gitBranch: "*",
  gitStatus: "+",
  gitCommit: "~",
  timer: "o",
  runtime: ">",
  contextBar: "%",
  thinking: "?",
  tokenInput: "^",
  tokenOutput: "v",
  cacheHit: "c",
  cost: "$",
  extensionStatus: "&",
};

/**
 * Resolve icon based on mode.
 * "auto" or "nerd" → Nerd Font icons
 * "ascii" → simple ASCII icons
 */
export function resolveIcon(
  overrides: Partial<SegmentIcons> | undefined,
  segment: keyof SegmentIcons,
  mode: string = "auto",
): string {
  if (overrides && segment in overrides) return overrides[segment] ?? "";
  const base = mode === "ascii" ? ASCII_ICONS : NERD_ICONS;
  return base[segment];
}

/** Prefix a label with a styled icon when the resolved icon is enabled. */
export function iconPrefix(
  theme: { fg: (color: string, text: string) => string },
  overrides: Partial<SegmentIcons> | undefined,
  segment: keyof SegmentIcons,
  mode: string = "auto",
): string {
  const icon = resolveIcon(overrides, segment, mode);
  return icon ? `${theme.fg("muted", icon)} ` : "";
}
