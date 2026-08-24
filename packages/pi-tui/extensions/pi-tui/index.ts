/**
 * pi-tui — Customizable TUI for pi.
 *
 * Phase 1: Header (animated logo, info bar, tips panel) + Config (JSON schema, load/save, /tui reload command)
 * Phase 2: Footer (configurable segments, git info, session metrics)
 *
 * Editor, telemetry, and context-view are deferred to later phases.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, type PiTuiConfig } from "./config.ts";
import { installHeader } from "./header/index.ts";
import { installFooter } from "./footer/index.ts";

export default function (pi: ExtensionAPI) {
  let config: PiTuiConfig = loadConfig();
  let cleanupHeader: (() => void) | undefined;
  let cleanupFooter: (() => void) | undefined;

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
    // Footer data provider is available via ctx.footerData
    const footerData = (ctx as any).footerData;
    if (footerData) {
      cleanupFooter = installFooter(pi, ctx, config.footer, footerData);
    }
  };

  const uninstallFooter = () => {
    cleanupFooter?.();
    cleanupFooter = undefined;
  };

  /* ── Session lifecycle ── */

  pi.on("session_start", (event, ctx) => {
    config = loadConfig();

    // Skip animation on reload and resume to avoid screen flickering
    const skipAnimation =
      event.reason === "reload" ||
      event.reason === "resume";

    // Defer to TUI pipeline ready
    setTimeout(() => {
      applyHeader(ctx, skipAnimation);
      applyFooter(ctx);
    }, 0);
  });

  pi.on("session_shutdown", (_event, _ctx) => {
    uninstallHeader();
    uninstallFooter();
  });

  /* ── /tui command ── */

  pi.registerCommand("tui", {
    description: "Configure TUI — /tui reload to refresh from config",
    handler: async (args, ctx) => {
      const subcommand = args?.trim() ?? "";

      if (subcommand === "reload" || subcommand === "") {
        config = loadConfig();
        uninstallHeader();
        uninstallFooter();
        setTimeout(() => {
          applyHeader(ctx, true);
          applyFooter(ctx);
        }, 0);
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
