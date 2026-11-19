// Per-turn lane report: which model served the turn, its tokens, and its cost.
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { LanePair } from "./config.ts";
import { type Lane, type LaneDecision, type Phase, sameRef } from "./router.ts";

export const TURN_ENTRY = "lane-router.turn";
export const UNAVAILABLE_ENTRY = "lane-router.unavailable";
export const AVAILABLE_ENTRY = "lane-router.available";

export interface LaneTurnReport {
	v: 1;
	pair: string;
	turn: number;
	phase: Phase | null;
	/** Lane of the physical model that answered, from the assistant message itself. */
	lane: Lane | "none";
	model: string;
	tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
	cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
	stopReason: string;
	error?: string;
	fallback?: string;
}

export interface UnavailableData {
	pair: string;
	model: string;
	reason: string;
}

export function buildTurnReport(pair: LanePair, decision: LaneDecision | undefined, message: AssistantMessage, turn: number): LaneTurnReport {
	const served = { provider: message.provider, id: message.model };
	const lane: Lane | "none" = sameRef(served, pair.strong) ? "strong" : sameRef(served, pair.cheap) ? "cheap" : "none";
	const usage = message.usage;
	const cost = usage?.cost;
	return {
		v: 1,
		pair: pair.id,
		turn,
		phase: decision?.phase ?? null,
		lane,
		model: `${message.provider}/${message.model}`,
		tokens: {
			input: usage?.input ?? 0,
			output: usage?.output ?? 0,
			cacheRead: usage?.cacheRead ?? 0,
			cacheWrite: usage?.cacheWrite ?? 0,
			total: usage?.totalTokens ?? 0,
		},
		cost: {
			input: cost?.input ?? 0,
			output: cost?.output ?? 0,
			cacheRead: cost?.cacheRead ?? 0,
			cacheWrite: cost?.cacheWrite ?? 0,
			total: cost?.total ?? 0,
		},
		stopReason: message.stopReason,
		...(message.errorMessage ? { error: message.errorMessage } : {}),
		...(decision?.fallback && lane === decision.lane ? { fallback: decision.fallback } : {}),
	};
}

export function formatCost(value: number): string {
	return `$${value.toFixed(4)}`;
}

export function formatTurnReport(report: LaneTurnReport): string {
	const phase = report.phase ? `${report.phase} · ` : "";
	const tokens = `${report.tokens.input.toLocaleString("en-US")} in / ${report.tokens.output.toLocaleString("en-US")} out`;
	const cache = report.tokens.cacheRead || report.tokens.cacheWrite
		? ` (cache ${report.tokens.cacheRead.toLocaleString("en-US")} read / ${report.tokens.cacheWrite.toLocaleString("en-US")} write)`
		: "";
	let line = `lane ${report.pair} · ${phase}${report.lane} ${report.model} · ${tokens}${cache} · ${formatCost(report.cost.total)}`;
	if (report.fallback) line += ` · ${report.fallback}`;
	if (report.error) line += ` · error: ${report.error}`;
	return line;
}

export interface LaneTotals {
	turns: number;
	tokens: number;
	cost: number;
}

export function totalsByLane(reports: readonly LaneTurnReport[]): Record<string, LaneTotals> {
	const totals: Record<string, LaneTotals> = {};
	for (const report of reports) {
		const key = `${report.lane} ${report.model}`;
		const t = (totals[key] ??= { turns: 0, tokens: 0, cost: 0 });
		t.turns++;
		t.tokens += report.tokens.total;
		t.cost += report.cost.total;
	}
	return totals;
}
