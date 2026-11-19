// Durable, append-only decision record.
//
// Two files under one directory, written together for every transition:
// - decisions.jsonl: one JSON event per line, carrying the full v1 card when a
//   decision opens and the standard result object when it is answered.
// - decisions.status: the same transitions in Squad's status-line grammar
//   (`needs-decision [key=..]: ..` opens, `resolved [key=..]: ..` closes), so the
//   existing status fold (sq-classify-lib.sh status_open_decisions) can
//   reconcile which keyed decisions are still open.
import { appendFileSync, existsSync, mkdirSync, readFileSync, truncateSync } from "node:fs";
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

const STATUS_LINE_RE = /^(?:needs-decision \[key=[A-Za-z0-9._-]+\]: .+ \| options: .+ \| default: .+|resolved \[key=[A-Za-z0-9._-]+\]: .+)$/;

function parses(line: string): boolean {
	try {
		JSON.parse(line);
		return true;
	} catch {
		return false;
	}
}

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
		const lines = readFileSync(this.jsonlPath, "utf8").split("\n");
		const lastFilled = lines.reduce((acc, line, index) => (line.trim() ? index : acc), -1);
		const events: RecordEvent[] = [];
		lines.forEach((line, index) => {
			if (!line.trim()) return;
			let event: RecordEvent;
			try {
				event = JSON.parse(line) as RecordEvent;
			} catch (error) {
				if (index === lastFilled) return;
				throw new Error(`Decision record ${this.jsonlPath} line ${index + 1} is not valid JSON (${(error as Error).message}). Repair or move that line before asking again.`);
			}
			if (event.schema === RECORD_SCHEMA) events.push(event);
		});
		return events;
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
		this.appendLine(this.jsonlPath, JSON.stringify(event), parses);
		this.appendLine(this.statusPath, event.status_line, (line) => STATUS_LINE_RE.test(line));
	}

	/** Append a line, first discarding a fragment left by a torn write so later reads stay parseable. */
	private appendLine(path: string, line: string, complete: (line: string) => boolean): void {
		let lead = "";
		if (existsSync(path)) {
			const content = readFileSync(path, "utf8");
			if (content && !content.endsWith("\n")) {
				const tailStart = content.lastIndexOf("\n") + 1;
				if (complete(content.slice(tailStart))) lead = "\n";
				else truncateSync(path, tailStart);
			}
		}
		appendFileSync(path, `${lead}${line}\n`, { mode: 0o600 });
	}
}
