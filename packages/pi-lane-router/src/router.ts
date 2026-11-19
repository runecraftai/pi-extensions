// Lane routing: plan on the strong model, build on the cheap one.
//
// A pair starts in the plan phase on the strong lane. After the first successful
// `edit` or `write` tool result since the user's last message, the next request
// switches to the build phase on the cheap lane, and the session stays there.
// The phase is router state, which Pi stores on the session branch, so it follows
// the session tree and survives compaction.
//
// The cheap lane is never dropped silently: when it is missing, has no
// credentials, or has been marked unavailable (for example after quota
// exhaustion), the request goes to the strong lane and the decision carries the
// reason so the turn report says so.
import type { Api, AssistantMessage, Message, Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import { type LanePair, type ModelRef, formatRef } from "./config.ts";

export type Phase = "plan" | "build";
export type Lane = "strong" | "cheap";

export interface LaneState {
	phase: Phase;
}

export interface LaneDecision {
	pair: string;
	phase: Phase;
	lane: Lane;
	model: string;
	/** Why the cheap lane did not serve a build-phase request. */
	fallback?: string;
}

export interface RouteRequestLike {
	thinkingLevel: ModelThinkingLevel;
	reason: "user" | "continuation" | "retry" | "direct";
	state?: LaneState;
	messages: readonly Message[];
	failed?: { model: Model<Api>; message: AssistantMessage };
}

export interface RouterEnv {
	find(ref: ModelRef): Model<Api> | undefined;
	hasAuth(model: Model<Api>): boolean;
	/** Reason the cheap lane of `pair` is marked unavailable on this branch, if it is. */
	cheapBlocked(pair: string): string | undefined;
	markCheapUnavailable(pair: string, reason: string): void;
	isContextOverflow(message: AssistantMessage, contextWindow: number): boolean;
}

export interface RouteOutcome {
	route: { model: Model<Api>; thinkingLevel: ModelThinkingLevel; state?: LaneState };
	decision: LaneDecision;
}

const EDIT_TOOLS = new Set(["edit", "write"]);

export function sameRef(model: { provider: string; id: string } | undefined, ref: ModelRef): boolean {
	return model?.provider === ref.provider && model.id === ref.id;
}

/** Whether a tool call since the last user message edited a file successfully. */
export function editedThisTurn(messages: readonly Message[]): boolean {
	let lastUser = messages.length - 1;
	while (lastUser >= 0 && messages[lastUser].role !== "user") lastUser--;
	return messages
		.slice(lastUser + 1)
		.some((message) => message.role === "toolResult" && EDIT_TOOLS.has(message.toolName) && !message.isError);
}

function cheapProblem(pair: LanePair, env: RouterEnv): { model?: Model<Api>; problem?: string } {
	const model = env.find(pair.cheap);
	if (!model) return { problem: "not in the model catalog" };
	if (!env.hasAuth(model)) return { problem: "no credentials" };
	const blocked = env.cheapBlocked(pair.id);
	if (blocked) return { problem: blocked };
	return { model };
}

export function routeLane(pair: LanePair, request: RouteRequestLike, env: RouterEnv): RouteOutcome {
	const strong = env.find(pair.strong);
	if (!strong || !env.hasAuth(strong)) {
		throw new Error(`lane-router: strong lane ${formatRef(pair.strong)} has ${strong ? "no credentials" : "no model in the catalog"}; pair "${pair.id}" cannot serve this request`);
	}
	const onStrong = (phase: Phase, state: LaneState | undefined, fallback?: string): RouteOutcome => ({
		route: { model: strong, thinkingLevel: request.thinkingLevel, state },
		decision: { pair: pair.id, phase, lane: "strong", model: formatRef(pair.strong), ...(fallback ? { fallback } : {}) },
	});
	const fallbackNote = (problem: string) =>
		`cheap lane ${formatRef(pair.cheap)} unavailable (${problem}); continuing on strong lane ${formatRef(pair.strong)}`;

	if (request.reason === "retry" && request.failed && sameRef(request.failed.model, pair.cheap)
		&& !env.isContextOverflow(request.failed.message, request.failed.model.contextWindow ?? 0)) {
		env.markCheapUnavailable(pair.id, request.failed.message.errorMessage || "request failed");
	}

	const current = request.state ?? { phase: "plan" as const };
	let next: LaneState | undefined = request.state ? undefined : current;
	let phase = current.phase;
	if (request.reason !== "direct" && phase === "plan" && editedThisTurn(request.messages)) {
		phase = "build";
		next = { phase };
	}
	if (phase === "plan") return onStrong(phase, next);

	const cheap = cheapProblem(pair, env);
	if (!cheap.model) return onStrong(phase, next, fallbackNote(cheap.problem!));
	return {
		route: { model: cheap.model, thinkingLevel: request.thinkingLevel, state: next },
		decision: { pair: pair.id, phase, lane: "cheap", model: formatRef(pair.cheap) },
	};
}
