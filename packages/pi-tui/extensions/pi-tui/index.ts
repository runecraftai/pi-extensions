/**
 * pi-tui — Customizable TUI for pi.
 *
 * Phase 2: Footer (segments, context zone bar, git status, token stats)
 * Phase 1: Header (animated logo, info bar, tips panel) + Config (JSON schema, load/save, /tui reload command)
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, type PiTuiConfig } from "./config.ts";
import { installHeader } from "./header/index.ts";
import {
  installFooter,
  createFooterState,
  invalidateUsageCache,
  type FooterState,
} from "./footer/index.ts";
import { emptyGitStatus, readGitStatus } from "./footer/git.ts";

export default function (pi: ExtensionAPI) {
  let config: PiTuiConfig = loadConfig();
  let cleanupHeader: (() => void) | undefined;
  let cleanupFooter: (() => void) | undefined;
  let requestFooterRender: (() => void) | undefined;
  const footerState: FooterState = createFooterState();
  let lastCtx: ExtensionContext | undefined;
  let workingTimer: ReturnType<typeof setInterval> | undefined;

  /* ── Helpers ── */

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
    cleanupFooter = installFooter(pi, ctx, config.footer, footerState, {
      setRequestRender: (fn) => {
        requestFooterRender = fn ?? undefined;
      },
      scheduleGitRefresh: () => {
        void scheduleGitRefresh(ctx);
      },
    }, config.icons.mode);
  };

  const uninstallFooter = () => {
    cleanupFooter?.();
    cleanupFooter = undefined;
    requestFooterRender = undefined;
  };

  const scheduleGitRefresh = async (ctx: ExtensionContext) => {
    const segs = config.footer;
    if (!segs.git.showBranch && !segs.git.showStatus && !segs.git.showCommit) {
      footerState.git = emptyGitStatus();
      requestFooterRender?.();
      return;
    }
    const cwd = ctx.cwd;
    const git = await readGitStatus(cwd, {
      readCommit: segs.git.showCommit,
      readTag: segs.git.showCommit,
      readCounts: segs.git.showStatus,
    });
    footerState.git = git;
    requestFooterRender?.();
  };

  const refreshFooter = (ctx: ExtensionContext, project = false) => {
    if (ctx.mode !== "tui" || !config.enabled || !config.footer.enabled) return;
    if (project) {
      void scheduleGitRefresh(ctx);
    }
    invalidateUsageCache();
    requestFooterRender?.();
  };

  const startWorkingTimer = () => {
    stopWorkingTimer();
    const tick = () => {
      if (!config.enabled || !config.footer.enabled) return;
      requestFooterRender?.();
    };
    tick();
    workingTimer = setInterval(tick, 250);
    workingTimer.unref?.();
  };

  const stopWorkingTimer = () => {
    if (workingTimer) {
      clearInterval(workingTimer);
      workingTimer = undefined;
    }
  };

  /* ── Session lifecycle ── */

  pi.on("session_start", (event, ctx) => {
    config = loadConfig();
    lastCtx = ctx;
    footerState.workingSince = undefined;
    footerState.lastDoneIn = undefined;
    invalidateUsageCache();

    // Skip animation on reload and resume to avoid screen flickering
    const skipAnimation =
      event.reason === "reload" ||
      event.reason === "resume";

    // Defer to TUI pipeline ready
    setTimeout(() => {
      applyHeader(ctx, skipAnimation);
      applyFooter(ctx);
      refreshFooter(ctx, true);
    }, 0);
  });

  pi.on("session_shutdown", (_event, _ctx) => {
    stopWorkingTimer();
    uninstallHeader();
    uninstallFooter();
    lastCtx = undefined;
  });

  /* ── Agent lifecycle ── */

  pi.on("agent_start", (_event, _ctx) => {
    if (!lastCtx || lastCtx.mode !== "tui" || !config.enabled) return;
    footerState.workingSince = Date.now();
    footerState.lastDoneIn = undefined;
    startWorkingTimer();
  });

  pi.on("agent_end", (_event, _ctx) => {
    if (!lastCtx || lastCtx.mode !== "tui" || !config.enabled) return;
    stopWorkingTimer();
    if (footerState.workingSince !== undefined) {
      footerState.lastDoneIn = Date.now() - footerState.workingSince;
      footerState.workingSince = undefined;
    }
    refreshFooter(lastCtx);
  });

  /* ── Message events ── */

  pi.on("message_end", (_event, ctx) => {
    if (!lastCtx || lastCtx.mode !== "tui" || !config.enabled) return;
    refreshFooter(ctx);
  });

  pi.on("tool_execution_end", (_event, ctx) => {
    if (!lastCtx || lastCtx.mode !== "tui" || !config.enabled) return;
    // Invalidate git on tool result (write/edit/bash may change git state)
    void scheduleGitRefresh(ctx);
    refreshFooter(ctx);
  });

  /* ── Session events ── */

  pi.on("session_compact", (_event, ctx) => {
    if (!lastCtx || lastCtx.mode !== "tui" || !config.enabled) return;
    invalidateUsageCache();
    refreshFooter(ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
    if (!lastCtx || lastCtx.mode !== "tui" || !config.enabled) return;
    invalidateUsageCache();
    refreshFooter(ctx);
  });

  /* ── Model/thinking changes ── */

  pi.on("model_select", (_event, ctx) => {
    refreshFooter(ctx);
  });

  pi.on("thinking_level_select", (_event, ctx) => {
    refreshFooter(ctx);
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
          refreshFooter(ctx, true);
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
