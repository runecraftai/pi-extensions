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
		const raw = readFileSync(this.jsonlPath, "utf8");
		const lines = raw.split("\n");
		// Only an unterminated final line can be a torn append: every record this writer
		// emits ends with a newline, so a newline-terminated bad line is damage, not a fragment.
		const tornLast = !raw.endsWith("\n");
		const events: RecordEvent[] = [];
		lines.forEach((line, index) => {
			if (!line.trim()) return;
			let event: RecordEvent;
			try {
				event = JSON.parse(line) as RecordEvent;
			} catch (error) {
				if (tornLast && index === lines.length - 1) return;
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
		this.repairStatus(this.events());
		this.appendLine(this.jsonlPath, JSON.stringify(event), parses);
		this.appendLine(this.statusPath, event.status_line);
	}

	/** Status lines already persisted, with a torn final fragment discarded. */
	private statusLines(): string[] {
		if (!existsSync(this.statusPath)) return [];
		const content = readFileSync(this.statusPath);
		const head = content.subarray(0, content.lastIndexOf(0x0a) + 1).toString("utf8");
		return head ? head.slice(0, -1).split("\n") : [];
	}

	/**
	 * `decisions.jsonl` is authoritative. Re-emit the transitions the status file is missing,
	 * in event order and once each, so a crash between the two writes is repaired by the next
	 * append. Reading the record never rewrites the status file.
	 */
	private repairStatus(events: readonly RecordEvent[]): void {
		const lines = this.statusLines();
		let cursor = 0;
		for (const event of events) {
			if (lines[cursor] === event.status_line) {
				cursor++;
				continue;
			}
			this.appendLine(this.statusPath, event.status_line);
		}
	}

	/**
	 * Append a line, first discarding a fragment left by a torn write so later reads stay parseable.
	 * `intact` recognizes a tail that is a whole record missing only its newline; without a
	 * predicate a tail is always treated as torn (a status line's grammar is prefix-closed, so
	 * a truncated `resolved [key=..]: <partial label>` looks complete and must never be kept).
	 */
	private appendLine(path: string, line: string, intact: (tail: string) => boolean = () => false): void {
		if (existsSync(path)) {
			// Byte offset: fs.truncate takes bytes, not the code units of a decoded string.
			const content = readFileSync(path);
			const tailStart = content.lastIndexOf(0x0a) + 1;
			if (content.length > tailStart) {
				if (intact(content.subarray(tailStart).toString("utf8"))) appendFileSync(path, "\n", { mode: 0o600 });
				else truncateSync(path, tailStart);
			}
		}
		appendFileSync(path, `${line}\n`, { mode: 0o600 });
	}
}
