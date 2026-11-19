// Durable, append-only decision record.
//
// Two files under one directory, written together for every transition:
// - decisions.jsonl: one JSON event per line, carrying the full v1 card when a
//   decision opens and the standard result object when it is answered.
// - decisions.status: the same transitions in Squad's status-line grammar
//   (`needs-decision [key=..]: ..` opens, `resolved [key=..]: ..` closes), so the
//   existing status fold (sq-classify-lib.sh status_open_decisions) can
//   reconcile which keyed decisions are still open.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	type DecisionCard,
	type DecisionResult,
	openStatusLine,
	resolvedStatusLine,
} from "./card.ts";

export const RECORD_SCHEMA = "runecraft.pi-decisions/v1";

export interface SessionRef {
	id?: string;
	file?: string;
}

export interface OpenEvent {
	schema: typeof RECORD_SCHEMA;
	event: "open";
	key: string;
	at: string;
	session: SessionRef;
	card: DecisionCard;
	status_line: string;
}

export interface ResolvedEvent {
	schema: typeof RECORD_SCHEMA;
	event: "resolved";
	key: string;
	at: string;
	session: SessionRef;
	result: DecisionResult;
	/** Optional note from the person answering. Not part of the standard result object. */
	note: string | null;
	status_line: string;
}

export type RecordEvent = OpenEvent | ResolvedEvent;

export class DecisionRecord {
	readonly jsonlPath: string;
	readonly statusPath: string;
	private readonly dir: string;
	private readonly now: () => Date;

	constructor(dir: string, now: () => Date = () => new Date()) {
		this.dir = dir;
		this.jsonlPath = join(dir, "decisions.jsonl");
		this.statusPath = join(dir, "decisions.status");
		this.now = now;
	}

	events(): RecordEvent[] {
		if (!existsSync(this.jsonlPath)) return [];
		return readFileSync(this.jsonlPath, "utf8")
			.split("\n")
			.filter((line) => line.trim())
			.map((line) => JSON.parse(line) as RecordEvent)
			.filter((event) => event.schema === RECORD_SCHEMA);
	}

	/** The latest event for `key`, or undefined when the key has never been used. */
	latest(key: string): RecordEvent | undefined {
		return this.events().filter((event) => event.key === key).at(-1);
	}

	open(card: DecisionCard, session: SessionRef): OpenEvent {
		const event: OpenEvent = {
			schema: RECORD_SCHEMA,
			event: "open",
			key: card.metadata!.key!,
			at: this.now().toISOString(),
			session,
			card,
			status_line: openStatusLine(card),
		};
		this.append(event);
		return event;
	}

	resolve(result: DecisionResult, note: string | null, session: SessionRef): ResolvedEvent {
		const event: ResolvedEvent = {
			schema: RECORD_SCHEMA,
			event: "resolved",
			key: result.decision_id,
			at: this.now().toISOString(),
			session,
			result,
			note,
			status_line: resolvedStatusLine(result),
		};
		this.append(event);
		return event;
	}

	private append(event: RecordEvent): void {
		mkdirSync(this.dir, { recursive: true, mode: 0o700 });
		appendFileSync(this.jsonlPath, `${JSON.stringify(event)}\n`, { mode: 0o600 });
		appendFileSync(this.statusPath, `${event.status_line}\n`, { mode: 0o600 });
	}
}
