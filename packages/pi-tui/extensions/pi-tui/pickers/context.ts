/**
 * Context inspector — read-only view of context window usage.
 *
 * Phase 2 feature (stub for Phase 3 control center integration).
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export function openContextInspector(ctx: ExtensionContext): void {
  ctx.ui.notify("Context inspector coming in Phase 2", "info");
}
