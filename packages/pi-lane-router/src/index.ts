import type { AssistantMessage } from "@earendil-works/pi-ai";
import { isContextOverflow } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { join } from "node:path";
import { type LanePair, formatRef, loadConfig } from "./config.ts";
import {
	AVAILABLE_ENTRY,
	buildTurnReport,
	formatCost,
	formatTurnReport,
	type LaneTurnReport,
	totalsByLane,
	TURN_ENTRY,
	UNAVAILABLE_ENTRY,
	type UnavailableData,
} from "./report.ts";
import { type LaneDecision, type LaneState, routeLane, sameRef } from "./router.ts";

export const FALLBACK_MESSAGE = "lane-router.fallback";
const STATUS_KEY = "lane-router";
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export interface LaneRouterOptions {
	configPath?: string;
}

export function defaultConfigPath(): string {
	return process.env.PI_LANE_ROUTER_CONFIG || join(getAgentDir(), "pi-lane-router.json");
}

interface BranchEntry {
	type: string;
	customType?: string;
	data?: unknown;
	message?: { role?: string } & Partial<AssistantMessage>;
}

/** The latest unavailable/available marker for `pair` on the branch decides; markers are durable session entries. */
export function cheapBlockedOn(branch: readonly BranchEntry[], pair: string): string | undefined {
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (entry.type !== "custom" || (entry.data as { pair?: string } | undefined)?.pair !== pair) continue;
		if (entry.customType === AVAILABLE_ENTRY) return undefined;
		if (entry.customType === UNAVAILABLE_ENTRY) return (entry.data as UnavailableData).reason;
	}
	return undefined;
}

function turnReports(branch: readonly BranchEntry[], pair?: string): LaneTurnReport[] {
	return branch
		.filter((entry) => entry.type === "custom" && entry.customType === TURN_ENTRY)
		.map((entry) => entry.data as LaneTurnReport)
		.filter((report) => !pair || report.pair === pair);
}

export default function laneRouter(pi: ExtensionAPI, options: LaneRouterOptions = {}): void {
	const configPath = options.configPath ?? defaultConfigPath();
	const loaded = loadConfig(configPath);
	let lastDecision: LaneDecision | undefined;
	let pendingFallback: LanePair | undefined;

	if (loaded.status !== "ok") {
		pi.on("session_start", (_event, ctx) => {
			ctx.ui.notify(loaded.status === "missing"
				? `lane-router: no config at ${configPath}; no lane models registered. See the package README.`
				: `lane-router: invalid config ${configPath}: ${loaded.error}; no lane models registered.`, loaded.status === "missing" ? "warning" : "error");
		});
		return;
	}
	const { config } = loaded;
	const pairs = new Map(config.pairs.map((pair) => [pair.id, pair]));
	const activePair = (ctx: ExtensionContext) =>
		ctx.model?.provider === config.provider ? pairs.get(ctx.model.id) : undefined;

	function refreshStatus(ctx: ExtensionContext): void {
		const pair = activePair(ctx);
		if (!pair) return ctx.ui.setStatus(STATUS_KEY, undefined);
		const branch = ctx.sessionManager.getBranch() as BranchEntry[];
		const totals = Object.entries(totalsByLane(turnReports(branch, pair.id)))
			.map(([lane, t]) => `${lane.split(" ")[0]} ${formatCost(t.cost)}`)
			.join(" · ");
		const phase = lastDecision?.pair === pair.id ? `${lastDecision.phase}→${lastDecision.lane}` : "plan→strong";
		const blocked = cheapBlockedOn(branch, pair.id) ? " · cheap lane unavailable" : "";
		ctx.ui.setStatus(STATUS_KEY, `lanes ${pair.id} ${phase}${totals ? ` · ${totals}` : ""}${blocked}`);
	}

	function markCheapUnavailable(ctx: ExtensionContext, pair: LanePair, reason: string): void {
		if (cheapBlockedOn(ctx.sessionManager.getBranch() as BranchEntry[], pair.id) === reason) return;
		pi.appendEntry<UnavailableData>(UNAVAILABLE_ENTRY, { pair: pair.id, model: formatRef(pair.cheap), reason });
		ctx.ui.notify(`lane-router: cheap lane ${formatRef(pair.cheap)} unavailable (${reason}); continuing on strong lane ${formatRef(pair.strong)}. Run /lane-router reset to try it again.`, "warning");
	}

	for (const pair of config.pairs) {
		pi.registerVirtualModel<LaneState>({
			provider: config.provider,
			id: pair.id,
			name: pair.name,
			thinkingLevels: THINKING_LEVELS,
			route(request, ctx) {
				const outcome = routeLane(pair, request, {
					find: (ref) => ctx.modelRegistry.find(ref.provider, ref.id),
					hasAuth: (model) => ctx.modelRegistry.hasConfiguredAuth(model),
					cheapBlocked: (id) => cheapBlockedOn(ctx.sessionManager.getBranch() as BranchEntry[], id),
					markCheapUnavailable: (_id, reason) => markCheapUnavailable(ctx, pair, reason),
					isContextOverflow,
				});
				if (request.reason !== "direct") lastDecision = outcome.decision;
				return outcome.route;
			},
		});
	}

	pi.registerEntryRenderer<LaneTurnReport>(TURN_ENTRY, (entry, _options, theme) => {
		if (!entry.data) return undefined;
		const color = entry.data.error ? "error" : entry.data.fallback ? "warning" : "dim";
		return new Text(theme.fg(color, formatTurnReport(entry.data)), 1, 0);
	});

	pi.on("session_start", (_event, ctx) => {
		lastDecision = undefined;
		pendingFallback = undefined;
		refreshStatus(ctx);
	});
	pi.on("model_select", (_event, ctx) => refreshStatus(ctx));

	pi.on("turn_end", (event, ctx) => {
		const pair = activePair(ctx);
		const message = event.message as AssistantMessage;
		if (!pair || message.role !== "assistant") return;
		const decision = lastDecision?.pair === pair.id ? lastDecision : undefined;
		const report = buildTurnReport(pair, decision, message, event.turnIndex);
		pi.appendEntry<LaneTurnReport>(TURN_ENTRY, report);
		if (report.lane === "cheap" && message.stopReason === "error"
			&& !isContextOverflow(message, ctx.modelRegistry.find(pair.cheap.provider, pair.cheap.id)?.contextWindow ?? 0)) {
			markCheapUnavailable(ctx, pair, message.errorMessage || "request failed");
			pendingFallback = pair;
		}
		refreshStatus(ctx);
	});

	// A non-retryable cheap-lane failure (such as quota exhaustion) ends the run. Once Pi has
	// settled without recovering, say so in the conversation and continue on the strong lane.
	pi.on("agent_settled", (event, ctx) => {
		const pair = pendingFallback;
		pendingFallback = undefined;
		if (!pair || event.aborted) return;
		const last = [...(ctx.sessionManager.getBranch() as BranchEntry[])].reverse().find((entry) => entry.type === "message")?.message;
		if (last?.role !== "assistant" || last.stopReason !== "error" || !sameRef({ provider: last.provider!, id: last.model! }, pair.cheap)) return;
		const reason = cheapBlockedOn(ctx.sessionManager.getBranch() as BranchEntry[], pair.id) ?? "request failed";
		pi.sendMessage({
			customType: FALLBACK_MESSAGE,
			content: `[lane-router] The cheap lane ${formatRef(pair.cheap)} is unavailable (${reason}). Continuing this task on the strong lane ${formatRef(pair.strong)}; pick up where the failed turn stopped.`,
			display: true,
			details: { pair: pair.id, cheap: formatRef(pair.cheap), strong: formatRef(pair.strong), reason },
		}, { triggerTurn: true });
	});

	pi.registerCommand("lane-router", {
		description: "Lane router: status (default) or reset (retry an unavailable cheap lane)",
		handler: async (args, ctx) => {
			const pair = activePair(ctx);
			const branch = ctx.sessionManager.getBranch() as BranchEntry[];
			if (args.trim() === "reset") {
				const blocked = config.pairs.filter((p) => cheapBlockedOn(branch, p.id));
				for (const p of blocked) pi.appendEntry(AVAILABLE_ENTRY, { pair: p.id, model: formatRef(p.cheap) });
				ctx.ui.notify(blocked.length ? `lane-router: cheap lane available again for ${blocked.map((p) => p.id).join(", ")}` : "lane-router: no cheap lane is marked unavailable", "info");
				return refreshStatus(ctx);
			}
			const lines = Object.entries(totalsByLane(turnReports(branch)))
				.map(([lane, t]) => `${lane}: ${t.turns} turns, ${t.tokens.toLocaleString("en-US")} tokens, ${formatCost(t.cost)}`);
			const header = pair ? `lane-router: ${pair.id} (strong ${formatRef(pair.strong)}, cheap ${formatRef(pair.cheap)})` : `lane-router: active model is not a lane pair (${config.pairs.map((p) => `${config.provider}/${p.id}`).join(", ")})`;
			ctx.ui.notify([header, ...(lines.length ? lines : ["no lane turns on this branch yet"])].join("\n"), "info");
		},
	});
}
