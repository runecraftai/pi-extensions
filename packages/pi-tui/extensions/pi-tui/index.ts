/**
 * pi-tui — Customizable TUI for pi.
 *
 * Features:
 * - Animated logo header with info bar and tips
 * - Starship-style footer with even-width segment distribution
 * - Interactive settings UI via /pi-tui command
 * - JSON config at ~/.pi/agent/pi-tui.json
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, saveConfig, type PiTuiConfig } from "./config.ts";
import { installHeader } from "./header/index.ts";
import { installFooter } from "./footer/index.ts";
import { registerSettingsCommand } from "./settings/settings-command.ts";

export default function (pi: ExtensionAPI) {
  let config: PiTuiConfig = loadConfig();
  let cleanupHeader: (() => void) | undefined;
  let cleanupFooter: (() => void) | undefined;

  const getConfig = () => config;

  const applyHeader = (ctx: ExtensionContext, skipAnimation: boolean = false) => {
    if (ctx.mode !== "tui" || !config.enabled || !config.header.enabled) {
      return;
    }
    if (cleanupHeader) return;
    cleanupHeader = installHeader(pi, ctx, config.header, skipAnimation);
  };

  const uninstallHeader = () => {
    cleanupHeader?.();
    cleanupHeader = undefined;
  };

  const applyFooter = (ctx: ExtensionContext) => {
    if (ctx.mode !== "tui" || !config.enabled || !config.footer.enabled) {
      return;
    }
    if (cleanupFooter) return;
    cleanupFooter = installFooter(ctx, getConfig);
  };

  const uninstallFooter = () => {
    cleanupFooter?.();
    cleanupFooter = undefined;
  };

  const applyAll = (ctx: ExtensionContext, skipAnimation: boolean = false) => {
    applyHeader(ctx, skipAnimation);
    applyFooter(ctx);
  };

  const uninstallAll = () => {
    uninstallHeader();
    uninstallFooter();
  };

  /* ── Register settings command ── */
  registerSettingsCommand(pi, {
    getConfig,
    onConfigChanged: (newConfig: PiTuiConfig) => {
      config = newConfig;
      saveConfig(config);
    },
  });

  /* ── Session lifecycle ── */
  pi.on("session_start", (event, ctx) => {
    config = loadConfig();

    const skipAnimation =
      event.reason === "reload" ||
      event.reason === "resume";

    setTimeout(() => applyAll(ctx, skipAnimation), 0);
  });

  pi.on("session_shutdown", (_event, _ctx) => {
    uninstallAll();
  });
}
