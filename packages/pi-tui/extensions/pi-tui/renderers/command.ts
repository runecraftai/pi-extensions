/**
 * Command renderer: shell command with duration, exit code, and ANSI output.
 *
 * Preserves ANSI colors from command output, truncates when too long,
 * and shows exit code status (0 = muted ok, non-zero = warning).
 */

export interface CommandRendererInput {
  /** Raw command output */
  content: string;
  /** The command that was run */
  command?: string;
  /** Exit code (null if killed/unknown) */
  exitCode?: number | null;
  /** Execution duration in milliseconds */
  durationMs?: number;
  /** Whether output was truncated by the tool */
  truncated?: boolean;
}

export interface CommandRendererOutput {
  /** One-line compact summary */
  summary: string;
  /** Full expanded view */
  expanded: string;
  /** Whether the command succeeded */
  success: boolean;
}

/**
 * Format duration in human-readable form.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Strip ANSI escape codes from text.
 */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
}

/**
 * Truncate text with a marker.
 */
export function truncateOutput(text: string, maxChars: number = 2000): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return {
    text: text.slice(0, maxChars) + "\n... (output truncated)",
    truncated: true,
  };
}

/**
 * Format a compact summary line.
 */
export function formatCommandSummary(
  command?: string,
  exitCode?: number | null,
  durationMs?: number,
): string {
  const cmd = command ? command.slice(0, 40) + (command.length > 40 ? "..." : "") : "command";
  const success = exitCode === 0 || exitCode == null;
  const duration = durationMs != null ? ` (${formatDuration(durationMs)})` : "";
  const exitStr = exitCode != null && exitCode !== 0 ? ` [exit ${exitCode}]` : "";

  if (success) {
    return `${cmd}${duration}`;
  }
  return `${cmd}${exitStr}${duration}`;
}

/**
 * Render the full expanded view with preserved ANSI output.
 */
export function renderCommandExpanded(
  content: string,
  command?: string,
  maxChars: number = 2000,
): string {
  const header = command ? `$ ${command}\n` : "";
  const { text, truncated } = truncateOutput(content, maxChars);
  const truncNote = truncated ? "\n(output truncated at " + maxChars + " chars)" : "";
  return header + text + truncNote;
}

/**
 * Main render function.
 */
export function renderCommand(
  input: CommandRendererInput,
  options?: { maxChars?: number },
): CommandRendererOutput {
  const success = input.exitCode === 0 || input.exitCode == null;
  const summary = formatCommandSummary(input.command, input.exitCode, input.durationMs);
  const expanded = renderCommandExpanded(
    input.content,
    input.command,
    options?.maxChars ?? 2000,
  );

  return { summary, expanded, success };
}
