/**
 * Tasks tab for the Control Center — displays local Squad task status.
 *
 * Shows running/parked/done/failed tasks with project name, elapsed time,
 * and model. Reads from local state files; no bridge, no writes.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  Box,
  Key,
  matchesKey,
  SelectList,
  type SelectItem,
  type TUI,
  Text,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import {
  type TaskInfo,
  readAllTasks,
  getStateIcon,
  formatElapsed,
} from "./state-reader.ts";

/* ── Copy ── */

const COPY = {
  title: "Tasks",
  hint: "↑/↓: navigate · Esc/q: close",
  noTasks: "No tasks found",
  stateIcons: {
    running: "\u{F04B}",
    parked: "\u{F04C}",
    done: "\u{F00C}",
    failed: "\u{F00D}",
    unknown: "?",
  },
} as const;

/* ── Tasks UI component ── */

class TasksUi {
  private selectList: SelectList;
  private readonly container: Box;
  private readonly theme: Theme;
  private readonly tasks: TaskInfo[];
  private readonly onClose: () => void;
  private cachedWidth: number | undefined;
  private cachedLines: string[] | undefined;

  constructor(
    theme: Theme,
    tasks: TaskInfo[],
    onClose: () => void,
  ) {
    this.theme = theme;
    this.tasks = tasks;
    this.onClose = onClose;
    this.container = new Box(1, 1, (s: string) => theme.bg("customMessageBg", s));
    this.selectList = new SelectList([], 10, {
      selectedPrefix: (t) => theme.fg("accent", t),
      selectedText: (t) => theme.fg("accent", t),
      description: (t) => theme.fg("muted", t),
      scrollInfo: (t) => theme.fg("dim", t),
      noMatch: (t) => theme.fg("warning", t),
    });
    this.rebuild();
  }

  private stateColor(state: TaskInfo["displayState"]): string {
    switch (state) {
      case "running": return this.theme.fg("accent", COPY.stateIcons[state]);
      case "parked": return this.theme.fg("warning", COPY.stateIcons[state]);
      case "done": return this.theme.fg("dim", COPY.stateIcons[state]);
      case "failed": return this.theme.fg("error", COPY.stateIcons[state]);
      case "unknown": return this.theme.fg("dim", COPY.stateIcons[state]);
    }
  }

  private rebuild(): void {
    this.container.clear();
    this.container.addChild(new Text(this.theme.bold(this.theme.fg("accent", COPY.title)), 1, 0));
    this.container.addChild(new Text(this.theme.fg("dim", COPY.hint), 1, 0));

    if (this.tasks.length === 0) {
      this.container.addChild(new Text(this.theme.fg("dim", COPY.noTasks), 1, 0));
      return;
    }

    const items: SelectItem[] = this.tasks.map((task) => {
      const icon = this.stateColor(task.displayState);
      const elapsed = formatElapsed(task.elapsedMs);
      const model = task.model !== "—"
        ? this.theme.fg("dim", task.model)
        : this.theme.fg("muted", task.model);
      const project = truncateToWidth(task.project, 25, "…");
      const label = `${icon} ${task.slug}`;
      const description = `${project}  ${elapsed}  ${model}`;
      return {
        value: task.slug,
        label,
        description,
      };
    });

    this.selectList = new SelectList(items, Math.min(items.length, 12), {
      selectedPrefix: (t) => this.theme.fg("accent", t),
      selectedText: (t) => this.theme.fg("accent", t),
      description: (t) => this.theme.fg("dim", t),
      scrollInfo: (t) => this.theme.fg("dim", t),
      noMatch: (t) => this.theme.fg("warning", t),
    });

    this.selectList.onSelectionChange = () => {};
    this.selectList.onSelect = () => {};
    this.selectList.onCancel = () => {
      this.onClose();
    };

    this.container.addChild(this.selectList);
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || data === "q") {
      this.onClose();
      return;
    }
    this.selectList.handleInput?.(data);
    this.invalidate();
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

/* ── Public API ── */

/**
 * Render the tasks tab content for the Control Center.
 * Returns the lines to display.
 */
export function renderTasksTab(theme: Theme, width: number): string[] {
  const tasks = readAllTasks();
  const container = new Box(1, 1, (s: string) => theme.bg("customMessageBg", s));

  container.addChild(new Text(theme.bold(theme.fg("accent", COPY.title)), 1, 0));
  container.addChild(new Text(theme.fg("dim", COPY.hint), 1, 0));

  if (tasks.length === 0) {
    container.addChild(new Text(theme.fg("dim", COPY.noTasks), 1, 0));
    return container.render(width);
  }

  for (const task of tasks) {
    const icon = getStateIcon(task.displayState);
    const elapsed = formatElapsed(task.elapsedMs);
    const model = task.model !== "—"
      ? theme.fg("dim", task.model)
      : theme.fg("muted", task.model);
    const project = truncateToWidth(task.project, 25, "…");
    const line = `${icon} ${task.slug}  ${project}  ${elapsed}  ${model}`;
    container.addChild(new Text(line, 1, 0));
  }

  return container.render(width);
}

/**
 * Open the tasks tab as an overlay.
 */
export async function openTasksOverlay(
  ctx: { hasUI: boolean; ui: { custom: <T>(factory: (tui: TUI, theme: Theme, kb: any, done: (value: T) => void) => any, options?: any) => Promise<T> } },
): Promise<void> {
  if (!ctx.hasUI) return;

  const tasks = readAllTasks();

  await ctx.ui.custom<void>((tui: TUI, theme, _kb, done) => {
    const ui = new TasksUi(
      theme,
      tasks,
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
}
