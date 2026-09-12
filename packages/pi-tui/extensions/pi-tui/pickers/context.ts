/**
 * Context inspector — read-only overlay showing context usage details.
 *
 * Uses ctx.ui.custom() pattern from settings-command.ts.
 * Read-only; no session mutation.
 */

import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Box, Key, matchesKey, Text, type TUI } from "@earendil-works/pi-tui";
import type { PiTuiConfig } from "../config.ts";

/* ── Copy ── */

const COPY = {
  title: "Context Inspector",
  hint: "↑/↓: navigate · Esc/q: close",
  fields: {
    usage: "Usage",
    remaining: "Remaining",
    limit: "Context Window",
    model: "Model",
    thinking: "Thinking Level",
    breakdown: "Estimated Breakdown",
    topConsumers: "Top Consumers",
    lastCompaction: "Last Compaction",
    growthHistory: "Growth History",
  },
  compactInfo: "Use /compact to compact context when needed.",
  noData: "No data available",
} as const;

/* ── Types ── */

interface ContextField {
  label: string;
  value: string;
  color?: string;
}

interface ContextSection {
  title: string;
  fields: ContextField[];
}

/* ── Data extraction ── */

function extractContextData(
  ctx: ExtensionContext,
  config: PiTuiConfig,
): ContextSection[] {
  const sections: ContextSection[] = [];
  const usage = ctx.getContextUsage();
  const model = ctx.model;
  const sessionManager = ctx.sessionManager;

  // Usage section
  const usageFields: ContextField[] = [];
  if (usage) {
    const percent = usage.percent ?? 0;
    const tokens = usage.tokens ?? 0;
    const limit = usage.contextWindow;
    const remaining = Math.max(0, limit - tokens);

    usageFields.push({
      label: COPY.fields.usage,
      value: `${tokens.toLocaleString()} / ${limit.toLocaleString()} (${percent.toFixed(1)}%)`,
      color: percent > 80 ? "error" : percent > 50 ? "warning" : "success",
    });
    usageFields.push({
      label: COPY.fields.remaining,
      value: `${remaining.toLocaleString()} tokens`,
      color: remaining < limit * 0.2 ? "error" : "dim",
    });
    usageFields.push({
      label: COPY.fields.limit,
      value: `${limit.toLocaleString()} tokens`,
    });
  } else {
    usageFields.push({
      label: COPY.fields.usage,
      value: COPY.noData,
      color: "dim",
    });
  }

  // Model section
  const modelFields: ContextField[] = [];
  if (model) {
    modelFields.push({
      label: COPY.fields.model,
      value: model.id ?? "unknown",
    });
  }
  if (ctx.thinkingLevel) {
    modelFields.push({
      label: COPY.fields.thinking,
      value: ctx.thinkingLevel,
    });
  }

  // Estimated breakdown (by entry type)
  const breakdownFields: ContextField[] = [];
  try {
    let messageTokens = 0;
    let toolTokens = 0;
    let otherTokens = 0;
    let entryCount = 0;

    for (const entry of sessionManager.getEntries()) {
      if (entry.type === "message") {
        entryCount++;
        const msgUsage = (entry as any).message?.usage;
        if (msgUsage) {
          const entryTokens = (msgUsage.input ?? 0) + (msgUsage.output ?? 0);
          if ((entry as any).message?.role === "toolResult") {
            toolTokens += entryTokens;
          } else {
            messageTokens += entryTokens;
          }
        }
      } else if (entry.type === "compaction" || entry.type === "branch_summary") {
        const entryUsage = (entry as any).usage;
        if (entryUsage) {
          otherTokens += (entryUsage.input ?? 0) + (entryUsage.output ?? 0);
        }
      }
    }

    if (entryCount > 0) {
      breakdownFields.push({
        label: "Messages",
        value: `${messageTokens.toLocaleString()} tokens`,
      });
      breakdownFields.push({
        label: "Tool Results",
        value: `${toolTokens.toLocaleString()} tokens`,
      });
      if (otherTokens > 0) {
        breakdownFields.push({
          label: "Compaction/Summaries",
          value: `${otherTokens.toLocaleString()} tokens`,
        });
      }
      breakdownFields.push({
        label: "Total Entries",
        value: entryCount.toString(),
      });
    }
  } catch {
    breakdownFields.push({
      label: COPY.fields.breakdown,
      value: COPY.noData,
      color: "dim",
    });
  }

  // Top consumers (by entry)
  const topConsumerFields: ContextField[] = [];
  try {
    const entries: Array<{ type: string; tokens: number; preview: string }> = [];

    for (const entry of sessionManager.getEntries()) {
      if (entry.type === "message") {
        const msgUsage = (entry as any).message?.usage;
        const content = (entry as any).message?.content;
        const tokens = msgUsage ? (msgUsage.input ?? 0) + (msgUsage.output ?? 0) : 0;
        const preview = typeof content === "string"
          ? content.slice(0, 40).replace(/\n/g, " ")
          : (entry as any).message?.role ?? "unknown";
        entries.push({ type: (entry as any).message?.role ?? "message", tokens, preview });
      }
    }

    entries.sort((a, b) => b.tokens - a.tokens);
    const top5 = entries.slice(0, 5);

    if (top5.length > 0) {
      for (const entry of top5) {
        topConsumerFields.push({
          label: `${entry.type}: ${entry.preview}`,
          value: `${entry.tokens.toLocaleString()} tokens`,
        });
      }
    } else {
      topConsumerFields.push({
        label: COPY.fields.topConsumers,
        value: COPY.noData,
        color: "dim",
      });
    }
  } catch {
    topConsumerFields.push({
      label: COPY.fields.topConsumers,
      value: COPY.noData,
      color: "dim",
    });
  }

  // Last compaction
  const compactionFields: ContextField[] = [];
  try {
    let lastCompaction: any = null;
    for (const entry of sessionManager.getEntries()) {
      if (entry.type === "compaction") {
        lastCompaction = entry;
      }
    }
    if (lastCompaction) {
      compactionFields.push({
        label: COPY.fields.lastCompaction,
        value: "Available",
        color: "success",
      });
    } else {
      compactionFields.push({
        label: COPY.fields.lastCompaction,
        value: "None",
        color: "dim",
      });
    }
  } catch {
    compactionFields.push({
      label: COPY.fields.lastCompaction,
      value: COPY.noData,
      color: "dim",
    });
  }

  // Build sections
  if (usageFields.length > 0) sections.push({ title: "Usage", fields: usageFields });
  if (modelFields.length > 0) sections.push({ title: "Model", fields: modelFields });
  if (breakdownFields.length > 0) sections.push({ title: "Breakdown", fields: breakdownFields });
  if (topConsumerFields.length > 0) sections.push({ title: "Top Consumers", fields: topConsumerFields });
  if (compactionFields.length > 0) sections.push({ title: "Compaction", fields: compactionFields });

  // Compact info
  sections.push({
    title: "Info",
    fields: [{
      label: "Tip",
      value: COPY.compactInfo,
      color: "dim",
    }],
  });

  return sections;
}

/* ── UI Component ── */

class ContextInspectorUi {
  private sections: ContextSection[];
  private selectedIndex = 0;
  private container: Box;
  private readonly theme: Theme;
  private readonly onClose: () => void;
  private cachedWidth: number | undefined;
  private cachedLines: string[] | undefined;

  constructor(
    theme: Theme,
    sections: ContextSection[],
    onClose: () => void,
  ) {
    this.theme = theme;
    this.sections = sections;
    this.onClose = onClose;
    this.container = new Box(1, 1, (s: string) => theme.bg("customMessageBg", s));
    this.rebuild();
  }

  private getTotalFields(): number {
    return this.sections.reduce((sum, s) => sum + s.fields.length, 0);
  }

  private getFieldAt(index: number): { section: ContextSection; field: ContextField } | null {
    let current = 0;
    for (const section of this.sections) {
      for (const field of section.fields) {
        if (current === index) return { section, field };
        current++;
      }
    }
    return null;
  }

  private rebuild(): void {
    this.container.clear();
    this.container.addChild(new Text(this.theme.bold(this.theme.fg("accent", COPY.title)), 1, 0));
    this.container.addChild(new Text(this.theme.fg("dim", COPY.hint), 1, 0));

    let fieldIndex = 0;
    for (const section of this.sections) {
      this.container.addChild(new Text("", 1, 0));
      this.container.addChild(new Text(
        this.theme.bold(this.theme.fg("accent", section.title)),
        1,
        0,
      ));

      for (const field of section.fields) {
        const isSelected = fieldIndex === this.selectedIndex;
        const prefix = isSelected ? this.theme.fg("accent", "▸ ") : "  ";
        const color: string = isSelected ? "accent" : (field.color ?? "dim");
        const label = this.theme.fg("dim", `${field.label}:`);
        const value = this.theme.fg(color as any, field.value);
        this.container.addChild(new Text(`${prefix}${label} ${value}`, 1, 0));
        fieldIndex++;
      }
    }

    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || data === "q") {
      this.onClose();
      return;
    }
    if (matchesKey(data, Key.up) || data === "k") {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.rebuild();
      return;
    }
    if (matchesKey(data, Key.down) || data === "j") {
      this.selectedIndex = Math.min(this.getTotalFields() - 1, this.selectedIndex + 1);
      this.rebuild();
      return;
    }
    if (matchesKey(data, Key.home) || data === "g") {
      this.selectedIndex = 0;
      this.rebuild();
      return;
    }
    if (matchesKey(data, Key.end) || data === "G") {
      this.selectedIndex = this.getTotalFields() - 1;
      this.rebuild();
      return;
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
    this.cachedWidth = width;
    this.cachedLines = this.container.render(width);
    return this.cachedLines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
    this.container.invalidate();
  }
}

/* ── Command registration ── */

export function registerContextCommand(
  pi: ExtensionAPI,
  getConfig: () => PiTuiConfig,
): void {
  pi.registerCommand("pi-tui context", {
    description: "Open the context inspector (read-only)",
    handler: async (_args, ctx: ExtensionContext) => {
      if (!ctx.hasUI) return;

      const sections = extractContextData(ctx, getConfig());

      await ctx.ui.custom<void>((tui: TUI, theme, _kb, done) => {
        const ui = new ContextInspectorUi(
          theme,
          sections,
          () => done(undefined),
        );
        return {
          render: (w: number) => ui.render(w),
          invalidate: () => ui.invalidate(),
          handleInput: (data: string) => {
            ui.handleInput(data);
            tui.requestRender();
          },
        };
      }, { overlay: true });
    },
  });
}
