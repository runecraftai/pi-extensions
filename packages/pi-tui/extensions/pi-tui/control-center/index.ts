/**
 * Control Center — tabbed overlay for pi-tui features.
 *
 * Tabs: General, Appearance, Footer, Tasks
 *
 * This module provides the tasks tab integration for the Control Center.
 * The existing settings-command.ts handles the main Control Center tabs.
 */

export { renderTasksTab, openTasksOverlay } from "./tasks.ts";
export { readAllTasks, getStateIcon, formatElapsed } from "./state-reader.ts";
export type { TaskInfo, TaskMeta, TaskStatus } from "./state-reader.ts";
