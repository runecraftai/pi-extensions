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
  it("registers /pi-tui and subcommands", () => {
    const pi = createMockPI();
    registerSettingsCommand(pi, { getConfig: () => ({}), onConfigChanged: () => {} });
    const names = pi._commands.map((c) => c.name);
    assert.ok(names.includes("pi-tui"), "should register /pi-tui");
    assert.ok(names.includes("pi-tui-reload"), "should register /pi-tui-reload");
    assert.ok(names.includes("pi-tui-conversations"), "should register /pi-tui-conversations");
    assert.ok(names.includes("pi-tui-tasks"), "should register /pi-tui-tasks");
    assert.equal(pi._commands.length, 4);
  });

  it("/pi-tui has description", () => {
    const pi = createMockPI();
    registerSettingsCommand(pi, { getConfig: () => ({}), onConfigChanged: () => {} });
    const cmd = pi._commands.find((c) => c.name === "pi-tui");
    assert.ok(cmd!.description.includes("Control Center"));
  });

  it("subcommands have descriptions", () => {
    const pi = createMockPI();
    registerSettingsCommand(pi, { getConfig: () => ({}), onConfigChanged: () => {} });
    for (const cmd of pi._commands) {
      assert.equal(typeof cmd.handler, "function", `${cmd.name} handler should be a function`);
      assert.ok(cmd.description.length > 0, `${cmd.name} should have a description`);
    }
  });

  it("all command handlers are functions", () => {
    const pi = createMockPI();
    registerSettingsCommand(pi, { getConfig: () => ({}), onConfigChanged: () => {} });
    for (const cmd of pi._commands) {
      assert.equal(typeof cmd.handler, "function");
    }
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
    const reloadCmd = pi._commands.find((c) => c.name === "pi-tui-reload");
    await reloadCmd!.handler("", ctx);
    assert.ok(reloadCalled);
    assert.equal(ctx.getNotified()?.msg, "TUI reloaded from config");
  });

  it("/pi-tui with no args opens settings overlay", async () => {
    const pi = createMockPI();
    registerSettingsCommand(pi, { getConfig: () => ({}), onConfigChanged: () => {} });
    const ctx = createMockCtx();
    const mainCmd = pi._commands.find((c) => c.name === "pi-tui");
    await mainCmd!.handler("", ctx);
    assert.ok(ctx.getCustomCalled());
  });

  it("/pi-tui with unknown subcommand shows warning", async () => {
    const pi = createMockPI();
    registerSettingsCommand(pi, { getConfig: () => ({}), onConfigChanged: () => {} });
    const ctx = createMockCtx();
    const mainCmd = pi._commands.find((c) => c.name === "pi-tui");
    await mainCmd!.handler("foobar", ctx);
    assert.equal(ctx.getNotified()?.type, "warning");
    assert.ok(ctx.getNotified()?.msg.includes("Unknown"));
  });

  it("/pi-tui does nothing when hasUI is false", async () => {
    const pi = createMockPI();
    registerSettingsCommand(pi, { getConfig: () => ({}), onConfigChanged: () => {} });
    const ctx = createMockCtx({ hasUI: false });
    const mainCmd = pi._commands.find((c) => c.name === "pi-tui");
    await mainCmd!.handler("", ctx);
    assert.equal(ctx.getCustomCalled(), false);
    assert.equal(ctx.getNotified(), null);
  });
});
