// The extension wired to a fake Pi: every turn appends a lane report entry.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import laneRouter, { FALLBACK_MESSAGE } from "../src/index.ts";
import { formatTurnReport, TURN_ENTRY, UNAVAILABLE_ENTRY } from "../src/report.ts";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function configFile(config: unknown): string {
	const dir = mkdtempSync(join(tmpdir(), "lane-router-"));
	dirs.push(dir);
	const path = join(dir, "pi-lane-router.json");
	writeFileSync(path, JSON.stringify(config));
	return path;
}

function harness(config: unknown) {
	const handlers = new Map<string, (event: unknown, ctx: unknown) => unknown>();
	const virtual: { provider: string; id: string; route: (request: unknown, ctx: unknown) => { model: { id: string } } }[] = [];
	const branch: Record<string, unknown>[] = [];
	const notices: [string, string?][] = [];
	const sent: { message: { customType: string; content: string }; options: unknown }[] = [];
	const status = new Map<string, string | undefined>();
	const pi = {
		on: (name: string, handler: (event: unknown, ctx: unknown) => unknown) => { handlers.set(name, handler); },
		registerVirtualModel: (definition: never) => { virtual.push(definition); },
		registerEntryRenderer: () => {},
		registerCommand: () => {},
		appendEntry: (customType: string, data: unknown) => { branch.push({ type: "custom", customType, data }); },
		sendMessage: (message: never, options: unknown) => { sent.push({ message, options }); },
	};
	laneRouter(pi as never, { configPath: configFile(config) });
	const models = { "acme/big": { provider: "acme", id: "big", contextWindow: 1000 }, "acme/small": { provider: "acme", id: "small", contextWindow: 1000 } };
	const ctx = {
		model: { provider: "lanes", id: "duo" },
		modelRegistry: {
			find: (provider: string, id: string) => models[`${provider}/${id}` as keyof typeof models],
			hasConfiguredAuth: () => true,
		},
		sessionManager: { getBranch: () => branch },
		ui: { notify: (m: string, t?: string) => notices.push([m, t]), setStatus: (k: string, v?: string) => status.set(k, v) },
	};
	return { handlers, virtual, branch, notices, sent, status, ctx };
}

const config = { pairs: [{ id: "duo", strong: "acme/big", cheap: "acme/small" }] };
const assistant = (model: string, extra: Record<string, unknown> = {}) => ({
	role: "assistant", provider: "acme", model, stopReason: "toolUse", content: [],
	usage: { input: 1200, output: 80, cacheRead: 300, cacheWrite: 0, totalTokens: 1580, cost: { input: 0.012, output: 0.004, cacheRead: 0.0003, cacheWrite: 0, total: 0.0163 } },
	...extra,
});

test("registers one virtual model per configured pair under the configured provider", () => {
	const h = harness({ provider: "router", pairs: [config.pairs[0], { id: "trio", strong: "x/a", cheap: "x/b" }] });
	assert.deepEqual(h.virtual.map((v) => `${v.provider}/${v.id}`), ["router/duo", "router/trio"]);
});

test("every turn reports its lane, model, tokens, and cost", () => {
	const h = harness(config);
	h.handlers.get("session_start")!({}, h.ctx);
	const plan = h.virtual[0].route({ thinkingLevel: "high", reason: "user", messages: [{ role: "user" }] }, h.ctx);
	assert.equal(plan.model.id, "big");
	h.handlers.get("turn_end")!({ turnIndex: 0, message: assistant("big") }, h.ctx);
	const build = h.virtual[0].route({
		thinkingLevel: "high", reason: "continuation", state: { phase: "plan" },
		messages: [{ role: "user" }, { role: "toolResult", toolName: "edit", isError: false }],
	}, h.ctx);
	assert.equal(build.model.id, "small");
	h.handlers.get("turn_end")!({ turnIndex: 1, message: assistant("small", { stopReason: "stop", usage: { input: 900, output: 40, cacheRead: 0, cacheWrite: 0, totalTokens: 940, cost: { input: 0.0009, output: 0.0002, cacheRead: 0, cacheWrite: 0, total: 0.0011 } } }) }, h.ctx);

	const reports = h.branch.filter((e) => e.customType === TURN_ENTRY).map((e) => e.data);
	assert.deepEqual(reports, [
		{
			v: 1, pair: "duo", turn: 0, phase: "plan", lane: "strong", model: "acme/big",
			tokens: { input: 1200, output: 80, cacheRead: 300, cacheWrite: 0, total: 1580 },
			cost: { input: 0.012, output: 0.004, cacheRead: 0.0003, cacheWrite: 0, total: 0.0163 },
			stopReason: "toolUse",
		},
		{
			v: 1, pair: "duo", turn: 1, phase: "build", lane: "cheap", model: "acme/small",
			tokens: { input: 900, output: 40, cacheRead: 0, cacheWrite: 0, total: 940 },
			cost: { input: 0.0009, output: 0.0002, cacheRead: 0, cacheWrite: 0, total: 0.0011 },
			stopReason: "stop",
		},
	]);
	assert.equal(formatTurnReport(reports[0] as never), "lane duo · plan · strong acme/big · 1,200 in / 80 out (cache 300 read / 0 write) · $0.0163");
	assert.equal(h.status.get("lane-router"), "lanes duo build→cheap · strong $0.0163 · cheap $0.0011");
});

test("turns on a model that is not a lane pair are not reported", () => {
	const h = harness(config);
	h.handlers.get("turn_end")!({ turnIndex: 0, message: assistant("big") }, { ...h.ctx, model: { provider: "acme", id: "big" } });
	assert.equal(h.branch.length, 0);
});

test("quota exhaustion on the cheap lane is reported, never silent, and the task continues on the strong lane", () => {
	const h = harness(config);
	h.handlers.get("session_start")!({}, h.ctx);
	const build = { thinkingLevel: "high", reason: "user", state: { phase: "build" }, messages: [{ role: "user" }] };
	assert.equal(h.virtual[0].route(build, h.ctx).model.id, "small");
	const quota = assistant("small", { stopReason: "error", errorMessage: "429 insufficient_quota: You exceeded your current quota" });
	h.handlers.get("turn_end")!({ turnIndex: 0, message: quota }, h.ctx);
	h.branch.push({ type: "message", message: quota });

	const unavailable = h.branch.filter((e) => e.customType === UNAVAILABLE_ENTRY).map((e) => e.data);
	assert.deepEqual(unavailable, [{ pair: "duo", model: "acme/small", reason: "429 insufficient_quota: You exceeded your current quota" }]);
	assert.equal(h.notices.at(-1)![1], "warning");
	assert.match(h.notices.at(-1)![0], /cheap lane acme\/small unavailable .*continuing on strong lane acme\/big/);

	h.handlers.get("agent_settled")!({ aborted: false }, h.ctx);
	assert.equal(h.sent.length, 1);
	assert.equal(h.sent[0].message.customType, FALLBACK_MESSAGE);
	assert.match(h.sent[0].message.content, /cheap lane acme\/small is unavailable .*Continuing this task on the strong lane acme\/big/);
	assert.deepEqual(h.sent[0].options, { triggerTurn: true });

	const next = h.virtual[0].route({ ...build, reason: "continuation" }, h.ctx);
	assert.equal(next.model.id, "big");
	h.handlers.get("turn_end")!({ turnIndex: 0, message: assistant("big", { stopReason: "stop" }) }, h.ctx);
	const last = h.branch.filter((e) => e.customType === TURN_ENTRY).at(-1)!.data as { lane: string; fallback: string };
	assert.equal(last.lane, "strong");
	assert.match(last.fallback, /^cheap lane acme\/small unavailable \(429 insufficient_quota/);
	assert.match(h.status.get("lane-router")!, /cheap lane unavailable/);
});

test("a cheap lane that is missing or has no credentials is marked unavailable once, warned, and shown in the footer", () => {
	for (const [kind, reason] of [["missing", "not in the model catalog"], ["noauth", "no credentials"]] as const) {
		const h = harness(config);
		const ctx = {
			...h.ctx,
			modelRegistry: {
				find: (provider: string, id: string) => (kind === "missing" && id !== "big" ? undefined : h.ctx.modelRegistry.find(provider, id)),
				hasConfiguredAuth: (model: { id: string }) => kind !== "noauth" || model.id === "big",
			},
		};
		h.handlers.get("session_start")!({}, ctx);
		const build = { thinkingLevel: "high", reason: "continuation", state: { phase: "build" }, messages: [{ role: "user" }] };
		for (let i = 0; i < 2; i++) assert.equal(h.virtual[0].route(build, ctx).model.id, "big");

		assert.deepEqual(h.branch.filter((e) => e.customType === UNAVAILABLE_ENTRY).map((e) => e.data), [
			{ pair: "duo", model: "acme/small", reason },
		]);
		assert.deepEqual(h.notices.map(([message, type]) => [type, /cheap lane acme\/small unavailable/.test(message)]), [["warning", true]]);
		// The cheap lane was never reached, so no turn failed and no continuation message is sent.
		h.handlers.get("agent_settled")!({ aborted: false }, ctx);
		assert.equal(h.sent.length, 0);

		h.handlers.get("turn_end")!({ turnIndex: 0, message: assistant("big") }, ctx);
		const report = h.branch.filter((e) => e.customType === TURN_ENTRY).at(-1)!.data as { lane: string; fallback?: string };
		assert.equal(report.lane, "strong");
		assert.equal(report.fallback, `cheap lane acme/small unavailable (${reason}); continuing on strong lane acme/big`);
		assert.match(h.status.get("lane-router")!, /cheap lane unavailable/);
	}
});

test("an aborted run does not continue on its own", () => {
	const h = harness(config);
	h.virtual[0].route({ thinkingLevel: "high", reason: "user", state: { phase: "build" }, messages: [] }, h.ctx);
	const quota = assistant("small", { stopReason: "error", errorMessage: "insufficient_quota" });
	h.handlers.get("turn_end")!({ turnIndex: 0, message: quota }, h.ctx);
	h.branch.push({ type: "message", message: quota });
	h.handlers.get("agent_settled")!({ aborted: true }, h.ctx);
	assert.equal(h.sent.length, 0);
});

test("a missing or invalid config registers nothing and says so", () => {
	for (const [cfg, pattern] of [[{ pairs: [] }, /invalid config/], [undefined, /no config/]] as const) {
		const handlers = new Map<string, (e: unknown, c: unknown) => void>();
		const notices: string[] = [];
		const registered: unknown[] = [];
		const pi = { on: (n: string, h: (e: unknown, c: unknown) => void) => handlers.set(n, h), registerVirtualModel: (d: unknown) => registered.push(d) };
		laneRouter(pi as never, { configPath: cfg ? configFile(cfg) : "/nonexistent/pi-lane-router.json" });
		handlers.get("session_start")!({}, { ui: { notify: (m: string) => notices.push(m) } });
		assert.equal(registered.length, 0);
		assert.match(notices[0], pattern);
	}
});
