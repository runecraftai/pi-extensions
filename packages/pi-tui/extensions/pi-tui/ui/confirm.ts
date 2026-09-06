/**
 * Reusable confirmation dialog for destructive/irreversible actions.
 *
 * Shows the action description, risk level, and requires explicit [y]/[n]
 * confirmation before proceeding. Uses the `ctx.ui.custom()` pattern.
 *
 * Usage:
 *   const confirmed = await confirmDialog(ctx, {
 *     title: "Delete session",
 *     message: 'Delete session "my-session"?',
 *     risk: "high",
 *   });
 *   if (confirmed) { ... }
 */

import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Box, Key, matchesKey, Text, type TUI } from "@earendil-works/pi-tui";

export type RiskLevel = "low" | "medium" | "high";

export interface ConfirmOptions {
  /** Short title for the dialog header */
  title: string;
  /** Detailed message describing the action */
  message: string;
  /** Risk level — affects icon and color emphasis */
  risk?: RiskLevel;
  /** Label for the confirm button (default: "Yes") */
  confirmLabel?: string;
  /** Label for the cancel button (default: "No") */
  cancelLabel?: string;
}

/* ── Risk-level styling ── */

const RISK_ICONS: Record<RiskLevel, string> = {
  low: "?",
  medium: "!",
  high: "\u{F071}", // ⚠ nerd icon (fallback-safe when rendered as ASCII)
};

const RISK_LABELS: Record<RiskLevel, string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "HIGH RISK",
};

function riskColor(theme: Theme, risk: RiskLevel): string {
  switch (risk) {
    case "low": return theme.fg("dim", RISK_LABELS[risk]);
    case "medium": return theme.fg("warning", RISK_LABELS[risk]);
    case "high": return theme.fg("error", RISK_LABELS[risk]);
  }
}

function riskIcon(theme: Theme, risk: RiskLevel): string {
  const icon = RISK_ICONS[risk];
  return risk === "high"
    ? theme.fg("error", icon)
    : risk === "medium"
      ? theme.fg("warning", icon)
      : theme.fg("dim", icon);
}

/* ── UI component ── */

class ConfirmUi {
  private readonly container: Box;
  private readonly theme: Theme;
  private readonly options: Required<ConfirmOptions>;
  private confirmed = false;
  private closed = false;

  constructor(
    theme: Theme,
    options: ConfirmOptions,
  ) {
    this.theme = theme;
    this.options = {
      risk: "medium",
      confirmLabel: "Yes",
      cancelLabel: "No",
      ...options,
    };
    this.container = new Box(1, 1, (s: string) => theme.bg("customMessageBg", s));
    this.rebuild();
  }

  private rebuild(): void {
    this.container.clear();
    const { title, message, risk, confirmLabel, cancelLabel } = this.options;

    // Title line
    this.container.addChild(new Text(
      `${riskIcon(this.theme, risk)} ${this.theme.bold(this.theme.fg("accent", title))}`,
      1,
      0,
    ));

    // Risk badge
    this.container.addChild(new Text(riskColor(this.theme, risk), 1, 0));

    // Message
    this.container.addChild(new Text(message, 1, 0));

    // Blank line
    this.container.addChild(new Text("", 1, 0));

    // Confirmation buttons
    const yLabel = this.theme.fg("accent", `[y] ${confirmLabel}`);
    const nLabel = this.theme.fg("dim", `[n] ${cancelLabel}`);
    this.container.addChild(new Text(`  ${yLabel}  ${nLabel}`, 1, 0));
  }

  get isClosed(): boolean {
    return this.closed;
  }

  get isConfirmed(): boolean {
    return this.confirmed;
  }

  handleInput(data: string): void {
    if (this.closed) return;

    if (matchesKey(data, Key.escape) || data === "n" || data === "N") {
      this.confirmed = false;
      this.closed = true;
      return;
    }

    if (data === "y" || data === "Y" || matchesKey(data, Key.enter)) {
      this.confirmed = true;
      this.closed = true;
      return;
    }
  }

  render(width: number): string[] {
    return this.container.render(width);
  }

  invalidate(): void {
    this.container.invalidate();
  }
}

/* ── Public API ── */

/**
 * Show a confirmation dialog and return whether the user confirmed.
 *
 * Returns `false` if the user cancelled or the dialog was dismissed.
 */
export async function confirmDialog(
  ctx: ExtensionContext,
  options: ConfirmOptions,
): Promise<boolean> {
  if (!ctx.hasUI) return false;

  let resolve: (value: boolean) => void;
  const result = new Promise<boolean>((r) => { resolve = r; });

  await ctx.ui.custom<boolean>((tui: TUI, theme, _kb, done) => {
    const ui = new ConfirmUi(theme, options);

    return {
      render: (w: number) => ui.render(w),
      invalidate: () => ui.invalidate(),
      handleInput: (data: string) => {
        ui.handleInput(data);
        if (ui.isClosed) {
          done(ui.isConfirmed);
          resolve(ui.isConfirmed);
        }
        tui.requestRender();
      },
    };
  }, { overlay: true });

  return result;
}
