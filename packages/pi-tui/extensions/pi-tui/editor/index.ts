import { CustomEditor, type ExtensionContext, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import {
  CURSOR_MARKER,
  type EditorTheme,
  type TUI,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import type { CursorStyle } from "../config.ts";

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

function fillLine(content: string, width: number): string {
  const truncated = truncateToWidth(content, Math.max(0, width), "");
  return `${truncated}${" ".repeat(Math.max(0, width - visibleWidth(truncated)))}`;
}

function isBorderLine(line: string): boolean {
  const plain = stripAnsi(line);
  return plain.includes("─") && /^[─↑↓0-9 ]+$/.test(plain);
}

function findBottomBorderIndex(lines: string[]): number {
  for (let i = 1; i < lines.length; i++) {
    if (isBorderLine(lines[i]!)) return i;
  }
  return Math.max(0, lines.length - 1);
}

const CURSOR_STYLE_SEQUENCES: Partial<Record<CursorStyle, string>> = {
  bar: "\x1b[6 q",
  underline: "\x1b[4 q",
};
const DEFAULT_CURSOR_STYLE_SEQUENCE = "\x1b[0 q";

function removeSoftwareCursor(line: string, cursorMarker = ""): string {
  return line.replace(/\x1b\[7m([\s\S]*?)\x1b\[0m/g, (_match, cursor: string) => {
    const replacement = `${cursorMarker}${cursor}`;
    cursorMarker = "";
    return replacement;
  });
}

function configureCursor(tui: TUI, cursorStyle: CursorStyle): void {
  if (cursorStyle === "block") return;
  tui.setShowHardwareCursor(true);
  tui.terminal.write(CURSOR_STYLE_SEQUENCES[cursorStyle] ?? DEFAULT_CURSOR_STYLE_SEQUENCE);
}

function roundedBorder(width: number, kind: "top" | "bottom", paint: (s: string) => string, sourceLine?: string): string {
  if (width < 2) return paint(truncateToWidth(kind === "top" ? "╭╮" : "╰╯", width, ""));
  const corners = kind === "top" ? ["╭", "╮"] : ["╰", "╯"];
  const scrollMatch = sourceLine && stripAnsi(sourceLine).match(/([↑↓]\s+\d+\s+more)/);
  const label = scrollMatch ? `─── ${scrollMatch[1]} ` : "";
  const fill = Math.max(0, width - 2 - visibleWidth(label));
  return paint(`${corners[0]}${label}${"─".repeat(fill)}${corners[1]}`);
}

export class PiTuiEditor extends CustomEditor {
  private cursorStyle: CursorStyle;
  private readonly roundedBorders: boolean;
  private previewHardwareCursor = false;

  constructor(
    tui: TUI,
    editorTheme: EditorTheme,
    keybindings: KeybindingsManager,
    cursorStyle: CursorStyle,
    roundedBorders: boolean,
  ) {
    super(tui, editorTheme, keybindings, { paddingX: 0 });
    this.cursorStyle = cursorStyle;
    this.roundedBorders = roundedBorders;
    configureCursor(tui, cursorStyle);
  }

  override setPaddingX(_padding: number): void {
    super.setPaddingX(0);
  }

  setCursorStyle(cursorStyle: CursorStyle, restoreHardwareCursor = false): void {
    const changed = cursorStyle !== this.cursorStyle;
    this.previewHardwareCursor = cursorStyle !== "block";
    this.cursorStyle = cursorStyle;
    if (changed) {
      if (cursorStyle === "block") {
        this.tui.terminal.write(DEFAULT_CURSOR_STYLE_SEQUENCE);
        this.tui.setShowHardwareCursor(restoreHardwareCursor);
      } else {
        configureCursor(this.tui, cursorStyle);
      }
    }
    this.tui.requestRender();
  }

  private renderBase(width: number): string[] {
    const lines = super.render(width);
    if (this.cursorStyle === "block") return lines;

    let cursorMarker = this.previewHardwareCursor && !this.focused ? CURSOR_MARKER : "";
    if (this.focused) this.previewHardwareCursor = false;
    return lines.map((line) => {
      const rendered = removeSoftwareCursor(line, cursorMarker);
      if (rendered !== line) cursorMarker = "";
      return rendered;
    });
  }

  override render(width: number): string[] {
    if (!this.roundedBorders || width < 4) return this.renderBase(width);

    const innerWidth = Math.max(0, width - 4);
    const baseLines = this.renderBase(innerWidth);
    const bottomIndex = findBottomBorderIndex(baseLines);
    const paint = (text: string) => this.borderColor(text);
    const rail = paint("│");
    const lines: string[] = [roundedBorder(width, "top", paint, baseLines[0])];

    for (let i = 1; i < bottomIndex; i++) {
      const line = baseLines[i] ?? "";
      lines.push(`${rail} ${fillLine(isBorderLine(line) ? "" : line, innerWidth)} ${rail}`);
    }

    lines.push(roundedBorder(width, "bottom", paint, baseLines[bottomIndex]));
    lines.push(...baseLines.slice(bottomIndex + 1));
    return lines.map((line) => truncateToWidth(line, width, ""));
  }
}

export function installEditor(
  ctx: ExtensionContext,
  cursorStyle: CursorStyle,
  roundedBorders: boolean,
): { cleanup: () => void; setCursorStyle: (style: CursorStyle) => void } {
  let activeTui: TUI | undefined;
  let activeEditor: PiTuiEditor | undefined;
  let previousHardwareCursor: boolean | undefined;
  let currentCursorStyle = cursorStyle;
  const ui = ctx.ui as ExtensionContext["ui"] & {
    setEditorComponent?: (factory: ((tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) => PiTuiEditor) | undefined) => void;
  };

  if (typeof ui.setEditorComponent !== "function") {
    return { cleanup: () => {}, setCursorStyle: (style) => { currentCursorStyle = style; } };
  }

  ui.setEditorComponent((tui, editorTheme, keybindings) => {
    activeTui = tui;
    previousHardwareCursor = tui.getShowHardwareCursor();
    activeEditor = new PiTuiEditor(tui, editorTheme, keybindings, currentCursorStyle, roundedBorders);
    return activeEditor;
  });

  return {
    setCursorStyle(style: CursorStyle): void {
      currentCursorStyle = style;
      activeEditor?.setCursorStyle(style, previousHardwareCursor);
    },
    cleanup(): void {
      ui.setEditorComponent!(undefined);
      if (activeTui && currentCursorStyle !== "block") {
        activeTui.terminal.write(DEFAULT_CURSOR_STYLE_SEQUENCE);
      }
      if (activeTui && previousHardwareCursor !== undefined) {
        activeTui.setShowHardwareCursor(previousHardwareCursor);
      }
      activeEditor = undefined;
      activeTui = undefined;
    },
  };
}
