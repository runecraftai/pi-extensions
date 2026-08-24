/**
 * pi-tui-unified — Unified, customizable TUI for pi.
 *
 * Phase 1: Header (animated logo, info bar, tips panel) + Config (JSON schema, load/save, /tui reload command)
 *
 * Footer, editor, telemetry, and context-view are deferred to later phases.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, type TuiUnifiedConfig } from "./config.ts";
import { installHeader } from "./header/index.ts";

export default function (pi: ExtensionAPI) {
  let config: TuiUnifiedConfig = loadConfig();
  let cleanupHeader: (() => void) | undefined;

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

  /* ── Session lifecycle ── */

  pi.on("session_start", (event, ctx) => {
    config = loadConfig();

    // Skip animation on reload and resume to avoid screen flickering
    const skipAnimation =
      event.reason === "reload" ||
      event.reason === "resume";

    // Defer to TUI pipeline ready
    setTimeout(() => applyHeader(ctx, skipAnimation), 0);
  });

  pi.on("session_shutdown", (_event, _ctx) => {
    uninstallHeader();
  });

  /* ── /tui command ── */

  pi.registerCommand("tui", {
    description: "Configure unified TUI — /tui reload to refresh from config",
    handler: async (args, ctx) => {
      const subcommand = args?.trim() ?? "";

      if (subcommand === "reload" || subcommand === "") {
        config = loadConfig();
        uninstallHeader();
        setTimeout(() => applyHeader(ctx, true), 0);
        ctx.ui.notify("TUI reloaded from config", "info");
        return;
      }

      ctx.ui.notify(
        `Unknown /tui subcommand: "${subcommand}". Available: reload`,
        "warning",
      );
    },
  });
}
