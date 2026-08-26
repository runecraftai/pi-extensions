/**
 * pi-tui — Customizable TUI for pi.
 *
 * Features:
 * - Animated logo header with configurable icons, info bar, and tips
 * - Starship-style footer with left-packed segments and right-filling context bar
 * - Interactive settings UI via /pi-tui command
 * - JSON config at ~/.pi/agent/pi-tui.json
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_ICONS } from "./icons.ts";
import { loadConfig, saveConfig, type PiTuiConfig } from "./config.ts";
import { installHeader } from "./header/index.ts";
import { installFooter } from "./footer/index.ts";
import { emptyGitStatus, readGitStatus, type GitStatus } from "./footer/git.ts";
import { registerSettingsCommand } from "./settings/settings-command.ts";

export default function (pi: ExtensionAPI) {
  let config: PiTuiConfig = loadConfig();
  let cleanupHeader: (() => void) | undefined;
  let cleanupFooter: (() => void) | undefined;
  let gitStatus: GitStatus = emptyGitStatus();
  let gitRefreshGeneration = 0;
  let requestRender: (() => void) | undefined;

  const getConfig = () => config;

  const refreshGitStatus = async (ctx: ExtensionContext): Promise<void> => {
    if (ctx.mode !== "tui" || !config.enabled || !config.footer.enabled) return;
    const generation = ++gitRefreshGeneration;
    const cwd = ctx.sessionManager.getCwd();
    const result = await readGitStatus(cwd, {
      readCommit: config.footer.git.showCommit,
      readTag: config.footer.git.showCommit,
      readCounts: config.footer.git.showStatus,
    });
    // A slower result from an earlier event must never replace newer state.
    if (generation !== gitRefreshGeneration) return;
    gitStatus = result;
    requestRender?.();
  };

  const applyHeader = (ctx: ExtensionContext, skipAnimation: boolean = false) => {
    if (ctx.mode !== "tui" || !config.enabled || !config.header.enabled) return;
    if (cleanupHeader) return;
    const headerIcons = config.icons.mode === "ascii"
      ? Object.fromEntries(Object.keys(DEFAULT_ICONS).map((key) => [key, ""]))
      : { ...config.icons.custom, ...config.header.icons };
    cleanupHeader = installHeader(pi, ctx, { ...config.header, icons: headerIcons }, skipAnimation);
  };

  const uninstallHeader = () => {
    cleanupHeader?.();
    cleanupHeader = undefined;
  };

  const applyFooter = (ctx: ExtensionContext) => {
    if (ctx.mode !== "tui" || !config.enabled || !config.footer.enabled) return;
    if (cleanupFooter) return;
    cleanupFooter = installFooter(
      ctx,
      getConfig,
      () => gitStatus,
      (fn) => { requestRender = fn; },
    );
  };

  const uninstallFooter = () => {
    cleanupFooter?.();
    cleanupFooter = undefined;
    requestRender = undefined;
  };

  const applyAll = (ctx: ExtensionContext, skipAnimation: boolean = false) => {
    applyHeader(ctx, skipAnimation);
    applyFooter(ctx);
    void refreshGitStatus(ctx);
  };

  const uninstallAll = () => {
    gitRefreshGeneration++;
    uninstallHeader();
    uninstallFooter();
  };

  registerSettingsCommand(pi, {
    getConfig,
    onConfigChanged: (newConfig: PiTuiConfig) => {
      config = newConfig;
      saveConfig(config);
    },
  });

  pi.on("session_start", (event, ctx) => {
    config = loadConfig();
    const skipAnimation = event.reason === "reload" || event.reason === "resume";
    setTimeout(() => applyAll(ctx, skipAnimation), 0);
  });

  pi.on("tool_result", (_event, ctx) => {
    void refreshGitStatus(ctx);
  });

  pi.on("user_bash", (_event, ctx) => {
    void refreshGitStatus(ctx);
  });

  pi.on("session_shutdown", (_event, _ctx) => {
    uninstallAll();
  });
}
