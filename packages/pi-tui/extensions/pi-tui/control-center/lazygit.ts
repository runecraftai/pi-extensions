/**
 * LazyGit integration for pi-tui.
 *
 * Opens LazyGit in the TUI, suspending rendering while it runs.
 * Does NOT auto-install; shows clear install instructions if missing.
 */

import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

const execFileAsync = promisify(execFile);

/** Check if lazygit is available on PATH. */
export async function isLazyGitAvailable(): Promise<boolean> {
  try {
    await execFileAsync("command", ["-v", "lazygit"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Open LazyGit inside the TUI.
 *
 * Pattern from examples/extensions/interactive-shell.ts:
 * - tui.stop() to release terminal
 * - spawn lazygit with stdio: "inherit"
 * - tui.start() + requestRender(true) on exit
 * - done() to signal completion
 */
export async function openLazyGit(ctx: ExtensionContext): Promise<void> {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("LazyGit requires TUI mode", "warning");
    return;
  }

  const available = await isLazyGitAvailable();
  if (!available) {
    ctx.ui.notify(
      "lazygit not found. Install: https://github.com/jesseduffield/lazygit#installation",
      "warning",
    );
    return;
  }

  await ctx.ui.custom<void>((tui, _theme, _kb, done) => {
    // Stop TUI to release terminal
    tui.stop();

    // Clear screen for lazygit
    process.stdout.write("\x1b[2J\x1b[H");

    const cwd = process.cwd();
    const child = spawn("lazygit", [], {
      stdio: "inherit",
      cwd,
      env: process.env,
    });

    child.on("close", (code) => {
      // Restart TUI
      tui.start();
      tui.requestRender(true);

      if (code !== 0) {
        // Don't alarm the user on non-zero exit; lazygit uses various codes
        // for its own internal states (e.g., quit with errors).
      }

      done(undefined);
    });

    child.on("error", () => {
      // If spawn fails, restart TUI
      tui.start();
      tui.requestRender(true);
      done(undefined);
    });

    // Return empty component (immediately disposed since done() will be called)
    return {
      render: () => [],
      invalidate: () => {},
    };
  }, { overlay: true });
}
