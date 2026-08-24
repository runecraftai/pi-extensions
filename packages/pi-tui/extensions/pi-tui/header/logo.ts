/**
 * Pi logo — 14-frame animation, 9-color palette, IBM stripes, Minecraft gradient.
 *
 * Extracted from pi-cc-header (eriiic7z/pi-cc-header) and pi-open-tui (OldSuns/pi-open-tui).
 * Animation frames sourced from pi.dev/install.sh.
 */

/* ── Logo frame data ── */

type LogoPhase = "left" | "top" | "right" | "none";

interface LogoFrame {
  phase: number;
  active: LogoPhase;
  ax: number;
  ay: number;
  flash: boolean;
  white: boolean;
}

export const LOGO_FRAMES: LogoFrame[] = [
  // Phase 0: left piece sliding down (4 frames)
  ...Array.from({ length: 4 }, (_, ay) => ({
    phase: 0, active: "left" as const, ax: 2, ay, flash: false, white: false,
  })),
  // Phase 1: top piece sliding right (3 frames)
  ...Array.from({ length: 3 }, (_, ay) => ({
    phase: 1, active: "top" as const, ax: 2, ay, flash: false, white: false,
  })),
  // Phase 2: right piece sliding down (5 frames)
  ...Array.from({ length: 5 }, (_, ay) => ({
    phase: 2, active: "right" as const, ax: 5, ay, flash: false, white: false,
  })),
  // Phase 3: flash frames
  { phase: 3, active: "none", ax: 0, ay: 0, flash: false, white: false },
  { phase: 3, active: "none", ax: 0, ay: 0, flash: true, white: false },
  { phase: 3, active: "none", ax: 0, ay: 0, flash: false, white: false },
  { phase: 3, active: "none", ax: 0, ay: 0, flash: true, white: false },
  // Phase 4: color transition
  { phase: 4, active: "none", ax: 0, ay: 0, flash: false, white: false },
  // Phase 5: final color settling
  { phase: 5, active: "none", ax: 0, ay: 0, flash: false, white: false },
  { phase: 5, active: "none", ax: 0, ay: 0, flash: false, white: true },
  { phase: 5, active: "none", ax: 0, ay: 0, flash: false, white: false },
  { phase: 5, active: "none", ax: 0, ay: 0, flash: false, white: true },
  // Phase 6: final assembled logo
  { phase: 6, active: "none", ax: 0, ay: 0, flash: false, white: false },
];

export const LAST_FRAME_INDEX = LOGO_FRAMES.length - 1;

export const LOGO_COLS = 8;
export const LOGO_ROWS = 7;
/** Pixel width = 8 cells × 2-char-wide blocks = 16 visible chars */
export const LOGO_PIXEL_WIDTH = 16;

/* ── Color palette (9 colors) ── */

export const COLOR_NAMES: Record<string, string> = {
  a: "anthropic",
  c: "clawd",
  r: "red",
  o: "orange",
  y: "yellow",
  g: "green",
  w: "white",
  b: "blue",
  p: "purple",
};

/** ANSI SGR sequences per color key */
export const CMAP: Record<string, string> = {
  a: "38;2;217;119;87",
  r: "31",
  o: "38;5;208",
  y: "38;5;226",
  g: "38;2;20;180;20",
  w: "38;5;15",
  b: "38;2;40;130;220",
  p: "38;5;129",
  c: "38;2;251;73;52",
};

/** 24-bit RGB gradient: 4 levels [light → dark] per color key */
export const GMAP: Record<string, string[]> = {
  a: ["38;2;217;119;87", "38;2;200;100;70", "38;2;170;80;55", "38;2;130;60;40"],
  r: ["38;2;255;80;80", "38;2;220;40;40", "38;2;180;20;20", "38;2;140;10;10"],
  o: ["38;2;255;170;50", "38;2;230;140;30", "38;2;200;110;20", "38;2;160;80;10"],
  y: ["38;2;255;255;80", "38;2;230;230;40", "38;2;200;200;20", "38;2;160;160;10"],
  g: ["38;2;80;255;80", "38;2;40;220;40", "38;2;20;180;20", "38;2;10;140;10"],
  w: ["38;2;230;230;210", "38;2;190;190;170", "38;2;140;140;120", "38;2;100;100;85"],
  b: ["38;2;100;180;255", "38;2;70;160;245", "38;2;40;130;220", "38;2;20;100;195"],
  p: ["38;2;200;100;255", "38;2;170;70;230", "38;2;140;40;200", "38;2;110;20;160"],
  c: ["38;2;251;73;52", "38;2;220;60;40", "38;2;190;45;30", "38;2;155;30;20"],
};

/* ── Cell coordinate sets ── */

/** Cells that form the Pi "P" in the final assembled logo */
const WHITE_CELLS = new Set([
  "3,2", "3,3", "3,4",
  "4,2", "4,4",
  "5,2", "5,3", "5,5",
  "6,2", "6,5",
]);

/** Phase 4 pixel map */
const P4_CYAN = new Set(["2,2", "2,3", "2,4", "3,4"]);
const P4_RED = new Set(["3,2", "4,2", "4,3", "5,2"]);
const P4_GREEN = new Set(["4,5", "5,5"]);

/** Phase 5+ pixel map */
const P5_CYAN = new Set(["3,2", "3,3", "3,4", "4,4"]);
const P5_RED = new Set(["4,2", "5,2", "5,3", "6,2"]);
const P5_GREEN = new Set(["5,5", "6,5"]);

const EARLY_ORANGE = new Set(["6,1", "6,2", "6,3", "6,4"]);
const LATE_GREEN = new Set(["4,5", "5,5", "6,5", "6,6"]);

/** Piece cell offsets */
const PIECE_LEFT: [number, number][] = [[0, 0], [1, 0], [1, 1], [2, 0]];
const PIECE_TOP: [number, number][] = [[0, 0], [0, 1], [0, 2], [1, 2]];
const PIECE_RIGHT: [number, number][] = [[0, 0], [1, 0], [2, 0], [2, 1]];

/* ── Logo rendering ── */

type LogoColor =
  | "panel"
  | "cyan"
  | "red"
  | "green"
  | "orange"
  | "white"
  | "flash"
  | "logo"
  | "logoStripe"
  | "l1" | "l2" | "l3" | "l4"
  | "s1" | "s2" | "s3" | "s4";

const GRADIENT_LEVEL: Record<string, number> = {
  l1: 0, l2: 1, l3: 2, l4: 3,
  s1: 0, s2: 1, s3: 2, s4: 3,
};

/** Determine the color of a single cell for a given frame. */
export function logoCellColor(
  frame: LogoFrame,
  y: number,
  x: number,
  gradientOn: boolean,
  stripeEnabled: boolean,
  logoColorKey: string,
): LogoColor {
  const key = `${y},${x}`;

  if (frame.white) return WHITE_CELLS.has(key) ? "white" : "panel";
  if (frame.flash && y === 6 && x >= 1 && x <= 6) return "flash";

  // Active piece animation
  if (frame.active === "left" && PIECE_LEFT.some(([dy, dx]) => y === frame.ay + dy && x === frame.ax + dx))
    return "red";
  if (frame.active === "top" && PIECE_TOP.some(([dy, dx]) => y === frame.ay + dy && x === frame.ax + dx))
    return "cyan";
  if (frame.active === "right" && PIECE_RIGHT.some(([dy, dx]) => y === frame.ay + dy && x === frame.ax + dx))
    return "green";

  // Final assembled logo (phase 6)
  if (frame.phase === 6) {
    const isPi = WHITE_CELLS.has(key);
    const lvl = gradientOn
      ? y <= 3 ? 1 : y === 4 ? 2 : y === 5 ? 3 : 4
      : 0;
    if (isPi) return lvl > 0 ? (`l${lvl}` as LogoColor) : "logo";
    return stripeEnabled && y >= 2 && y <= LOGO_ROWS && x <= 6
      ? lvl > 0 ? (`s${lvl}` as LogoColor) : "logoStripe"
      : "panel";
  }

  // Phase 4
  if (frame.phase === 4) {
    if (P4_CYAN.has(key)) return "cyan";
    if (P4_RED.has(key)) return "red";
    if (P4_GREEN.has(key)) return "green";
    return "panel";
  }

  // Phase 5+
  if (frame.phase >= 5) {
    if (P5_CYAN.has(key)) return "cyan";
    if (P5_RED.has(key)) return "red";
    if (P5_GREEN.has(key)) return "green";
    return "panel";
  }

  // Phase 0-3
  if (frame.phase <= 3 && EARLY_ORANGE.has(key)) return "orange";
  if (frame.phase >= 2 && P4_CYAN.has(key)) return "cyan";
  if (frame.phase >= 1 && P4_RED.has(key)) return "red";
  if (frame.phase >= 3 && LATE_GREEN.has(key)) return "green";
  return "panel";
}

/** Render a single cell with the given logo color. */
function colorCell(color: LogoColor, logoColorKey: string): string {
  const cg = (n: number) => GMAP[logoColorKey]?.[n] ?? "34";
  switch (color) {
    case "cyan":      return "\x1b[36m██\x1b[39m";
    case "red":       return "\x1b[31m██\x1b[39m";
    case "green":     return "\x1b[32m██\x1b[39m";
    case "orange":
    case "flash":     return "\x1b[33m██\x1b[39m";
    case "white":     return "\x1b[39m██";
    case "logo":      return `\x1b[${CMAP[logoColorKey]}m██\x1b[39m`;
    case "logoStripe": return `\x1b[${CMAP[logoColorKey]}m──\x1b[39m`;
    case "l1": case "l2": case "l3": case "l4":
    case "s1": case "s2": case "s3": case "s4": {
      const lvl = GRADIENT_LEVEL[color];
      const isStripe = color[0] === "s";
      return `\x1b[${cg(lvl)}m${isStripe ? "──" : "██"}\x1b[39m`;
    }
    default: return "  ";
  }
}

/** Render one logo frame into an array of lines. */
export function renderLogoFrame(
  frameIndex: number,
  logoColorKey: string,
  gradientOn: boolean,
  stripeEnabled: boolean,
): string[] {
  const frame = LOGO_FRAMES[frameIndex];
  const lines: string[] = [];
  for (let y = 1; y <= LOGO_ROWS; y++) {
    let line = "";
    for (let x = 1; x <= LOGO_COLS; x++) {
      const cellColor = logoCellColor(frame, y, x, gradientOn, stripeEnabled, logoColorKey);
      line += colorCell(cellColor, logoColorKey);
    }
    lines.push(line);
  }
  return lines;
}

/** Precompute all logo frames for the current color/gradient/stripe settings. */
export function precomputeFrames(
  logoColorKey: string,
  gradientOn: boolean,
  stripeEnabled: boolean,
): string[][] {
  return LOGO_FRAMES.map((_, i) => renderLogoFrame(i, logoColorKey, gradientOn, stripeEnabled));
}
