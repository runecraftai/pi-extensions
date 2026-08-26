/**
 * Tests for /pi-tui command registration.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerSettingsCommand } from "../extensions/pi-tui/settings/settings-command.ts";

/* ── Simulated extension API ── */

interface RegisteredCommand {
  name: string;
  description: string;
  handler: (args: string, ctx: any) => Promise<void>;
}

function createMockPI() {
  const cmds: RegisteredCommand[] = [];
  return {
    _commands: cmds,
    registerCommand(name: string, options: Omit<RegisteredCommand, "name">) {
      cmds.push({ name, ...options });
    },
    getCommands() {
      return cmds.map((c) => ({ name: c.name, description: c.description }));
    },
  };
}

function createMockCtx(overrides: Record<string, any> = {}) {
  let notified: { msg: string; type?: string } | null = null;
  let customCalled = false;

  return {
    mode: "tui" as const,
    hasUI: true,
    cwd: "/home/user/project",
    model: { id: "test-model", provider: "test" },
    thinkingLevel: "medium" as const,
    sessionManager: {
      getCwd: () => "/home/user/project",
      getSessionName: () => undefined,
    },
    getContextUsage: () => ({ tokens: 5000, contextWindow: 200000, percent: 2.5 }),
    ui: {
      notify: (msg: string, type?: string) => { notified = { msg, type }; },
      custom: async () => { customCalled = true; },
      setHeader: () => {},
      setFooter: () => {},
    },
    getNotified: () => notified,
    getCustomCalled: () => customCalled,
    ...overrides,
  };
}

/* ── Tests ── */

describe("Command registration", () => {
  it("registers /pi-tui command", () => {
    const pi = createMockPI();
    registerSettingsCommand(pi, { getConfig: () => ({}), onConfigChanged: () => {} });
    assert.equal(pi._commands.length, 1);
    assert.equal(pi._commands[0]!.name, "pi-tui");
  });

  it("command has description", () => {
    const pi = createMockPI();
    registerSettingsCommand(pi, { getConfig: () => ({}), onConfigChanged: () => {} });
    assert.ok(pi._commands[0]!.description.includes("pi-tui"));
  });

  it("command handler is a function", () => {
    const pi = createMockPI();
    registerSettingsCommand(pi, { getConfig: () => ({}), onConfigChanged: () => {} });
    assert.equal(typeof pi._commands[0]!.handler, "function");
  });
});

describe("Command handler behavior", () => {
  it("/pi-tui reload triggers config reload and notification", async () => {
    const pi = createMockPI();
    let reloadCalled = false;
    registerSettingsCommand(pi, {
      getConfig: () => ({ enabled: true }),
      onConfigChanged: () => { reloadCalled = true; },
    });
    const ctx = createMockCtx();
    await pi._commands[0]!.handler("reload", ctx);
    assert.ok(reloadCalled);
    assert.equal(ctx.getNotified()?.msg, "TUI reloaded from config");
  });

  it("/pi-tui with no args opens settings overlay", async () => {
    const pi = createMockPI();
    registerSettingsCommand(pi, { getConfig: () => ({}), onConfigChanged: () => {} });
    const ctx = createMockCtx();
    await pi._commands[0]!.handler("", ctx);
    assert.ok(ctx.getCustomCalled());
  });

  it("/pi-tui with unknown subcommand shows warning", async () => {
    const pi = createMockPI();
    registerSettingsCommand(pi, { getConfig: () => ({}), onConfigChanged: () => {} });
    const ctx = createMockCtx();
    await pi._commands[0]!.handler("foobar", ctx);
    assert.equal(ctx.getNotified()?.type, "warning");
    assert.ok(ctx.getNotified()?.msg.includes("Unknown"));
  });

  it("/pi-tui does nothing when hasUI is false", async () => {
    const pi = createMockPI();
    registerSettingsCommand(pi, { getConfig: () => ({}), onConfigChanged: () => {} });
    const ctx = createMockCtx({ hasUI: false });
    await pi._commands[0]!.handler("", ctx);
    assert.equal(ctx.getCustomCalled(), false);
    assert.equal(ctx.getNotified(), null);
  });
});
