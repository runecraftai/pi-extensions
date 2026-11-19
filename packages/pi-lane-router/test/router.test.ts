import assert from "node:assert/strict";
import { test } from "node:test";
import { parseConfig } from "../src/config.ts";
import { editedThisTurn, type RouteRequestLike, routeLane, type RouterEnv } from "../src/router.ts";

const config = parseConfig({ pairs: [{ id: "duo", strong: "acme/big", cheap: "acme/small" }] });
const pair = config.pairs[0];
const model = (provider: string, id: string) => ({ provider, id, contextWindow: 1000 }) as never;

function env(overrides: Partial<RouterEnv> & { blocked?: string } = {}) {
	const marked: string[] = [];
	const e: RouterEnv & { marked: string[] } = {
		marked,
		find: (ref) => (ref.id === "big" || ref.id === "small" ? model(ref.provider, ref.id) : undefined),
		hasAuth: () => true,
		cheapBlocked: () => overrides.blocked ?? marked.at(-1),
		markCheapUnavailable: (_pair, reason) => { marked.push(reason); },
		isContextOverflow: (message) => /context/.test(message.errorMessage ?? ""),
		...overrides,
	};
	return e;
}

const user = { role: "user", content: "do it", timestamp: 0 };
const wrote = { role: "toolResult", toolName: "write", isError: false, toolCallId: "1", content: [], timestamp: 0 };
const failedWrite = { ...wrote, isError: true };
const request = (r: Partial<RouteRequestLike>): RouteRequestLike => ({ thinkingLevel: "medium", reason: "user", messages: [user] as never, ...r });

test("config names the pair; nothing about vendors is built in", () => {
	assert.deepEqual(pair, { id: "duo", name: "Lanes: acme/big plans, acme/small builds", strong: { provider: "acme", id: "big" }, cheap: { provider: "acme", id: "small" } });
	assert.deepEqual(parseConfig({ pairs: [{ id: "x", strong: "openrouter/anthropic/opus", cheap: "a/b" }] }).pairs[0].strong, { provider: "openrouter", id: "anthropic/opus" });
	assert.throws(() => parseConfig({ pairs: [] }), /non-empty/);
	assert.throws(() => parseConfig({ pairs: [{ id: "x", strong: "big", cheap: "a/b" }] }), /provider\/model-id/);
	assert.throws(() => parseConfig({ pairs: [{ id: "x", strong: "lanes/x", cheap: "a/b" }] }), /own provider/);
});

test("plans on the strong lane and stores the plan phase", () => {
	const { route, decision } = routeLane(pair, request({}), env());
	assert.equal(route.model.id, "big");
	assert.deepEqual(route.state, { phase: "plan" });
	assert.deepEqual(decision, { pair: "duo", phase: "plan", lane: "strong", model: "acme/big" });
});

test("switches to the cheap lane after the first successful edit or write, once", () => {
	const failed = routeLane(pair, request({ reason: "continuation", state: { phase: "plan" }, messages: [user, failedWrite] as never }), env());
	assert.equal(failed.route.model.id, "big");
	assert.equal(failed.route.state, undefined);
	const switched = routeLane(pair, request({ reason: "continuation", state: { phase: "plan" }, messages: [user, wrote] as never }), env());
	assert.equal(switched.route.model.id, "small");
	assert.deepEqual(switched.route.state, { phase: "build" });
	assert.deepEqual(switched.decision, { pair: "duo", phase: "build", lane: "cheap", model: "acme/small" });
	// The phase is state: a later user turn without edits stays on the cheap lane.
	const later = routeLane(pair, request({ state: { phase: "build" } }), env());
	assert.equal(later.route.model.id, "small");
	assert.equal(later.route.state, undefined);
	assert.equal(editedThisTurn([user, wrote, user] as never), false);
});

test("an unavailable cheap lane is reported and the request continues on the strong lane", () => {
	for (const [e, problem] of [
		[env({ blocked: "insufficient_quota" }), "insufficient_quota"],
		[env({ find: (ref) => (ref.id === "big" ? model(ref.provider, ref.id) : undefined) }), "not in the model catalog"],
		[env({ hasAuth: (m) => (m as { id: string }).id === "big" }), "no credentials"],
	] as const) {
		const { route, decision } = routeLane(pair, request({ state: { phase: "build" } }), e);
		assert.equal(route.model.id, "big");
		assert.deepEqual(decision, {
			pair: "duo", phase: "build", lane: "strong", model: "acme/big",
			fallback: `cheap lane acme/small unavailable (${problem}); continuing on strong lane acme/big`,
		});
	}
});

test("a failed cheap request retried by Pi marks the lane unavailable and retries on the strong lane", () => {
	const e = env();
	const failed = { model: model("acme", "small"), message: { errorMessage: "429 rate limit" } as never };
	const retried = routeLane(pair, request({ reason: "retry", state: { phase: "build" }, failed }), e);
	assert.deepEqual(e.marked, ["429 rate limit"]);
	assert.equal(retried.route.model.id, "big");
	assert.match(retried.decision.fallback!, /cheap lane acme\/small unavailable \(429 rate limit\)/);
	const overflow = env();
	routeLane(pair, request({ reason: "retry", state: { phase: "build" }, failed: { ...failed, message: { errorMessage: "context too long" } as never } }), overflow);
	assert.deepEqual(overflow.marked, []);
});

test("a missing strong lane fails loudly instead of guessing", () => {
	assert.throws(() => routeLane(pair, request({}), env({ find: () => undefined })), /strong lane acme\/big has no model in the catalog/);
});
