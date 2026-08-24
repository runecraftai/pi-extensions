/**
 * Configurable Nerd Font icons for pi-tui segments.
 *
 * Source plugins: pi-open-tui (OldSuns), pi-vitals (mcowger), pi-cc-header (eriiic7z).
 * Each segment has a default Nerd Font glyph and an empty-string disabled state.
 */

/* ── Default icon vocabulary ── */

export interface SegmentIcons {
  /* header */
  version: string;
  model: string;
  skills: string;
  prompts: string;
  extensions: string;
  agents: string;
  cwd: string;
  /* footer — line 1 */
  gitBranch: string;
  gitStatus: string;
  timer: string;
  runtime: string;
  contextBar: string;
  /* footer — line 2 */
  thinking: string;
  tokenInput: string;
  tokenOutput: string;
  cacheHit: string;
  cost: string;
  extensionStatus: string;
}

export const DEFAULT_ICONS: SegmentIcons = {
  /* header */
  version: "\u{F17C}",        // nf-linux-pi
  model: "\u{EC19}",          // nf-md-chip
  skills: "\u{EB64}",         // nf-oct-file_directory
  prompts: "\u{F15C}",        // nf-fa-file_text
  extensions: "\u{EB25}",     // nf-oct-package
  agents: "\u{F444}",         // nf-fa-robot
  cwd: "\u{F07B}",            // nf-fa-folder
  /* footer — line 1 */
  gitBranch: "\u{F126}",      // nf-fa-code_fork
  gitStatus: "\u{F1D3}",      // nf-fa-git
  timer: "\u{F017}",          // nf-fa-clock
  runtime: "\u{F120}",        // nf-fa-terminal
  contextBar: "\u{E70F}",     // nf-dev-database
  /* footer — line 2 */
  thinking: "\u{F5DC}",       // nf-fa-brain
  tokenInput: "\u{F090}",     // nf-fa-sign_in_alt
  tokenOutput: "\u{F08B}",    // nf-fa-sign_out_alt
  cacheHit: "\u{F1C0}",       // nf-fa-database
  cost: "\u{F155}",           // nf-fa-dollar_sign
  extensionStatus: "\u{EB25}", // nf-oct-package
};

/** Empty defaults — every icon disabled. */
export const EMPTY_ICONS: SegmentIcons = Object.fromEntries(
  (Object.keys(DEFAULT_ICONS) as (keyof SegmentIcons)[]).map((k) => [k, ""]),
) as SegmentIcons;

/* ── Resolver ── */

/**
 * Resolve the icon for a segment.
 *
 * Priority:
 *  1. User override (non-null, non-undefined from config)
 *  2. Default Nerd Font glyph
 *  3. Empty string (disabled)
 *
 * @param overrides - Partial overrides from the icons config map
 * @param segment   - Segment key to resolve
 * @returns The resolved icon string (may be empty if explicitly disabled)
 */
export function resolveIcon(
  overrides: Partial<SegmentIcons> | undefined,
  segment: keyof SegmentIcons,
): string {
  if (overrides && segment in overrides) {
    return overrides[segment] ?? "";
  }
  return DEFAULT_ICONS[segment] ?? "";
}
