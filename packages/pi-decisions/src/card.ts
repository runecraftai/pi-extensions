// Decision card v1: validation, prose rendering, and result objects.
//
// This is a faithful port of the semantics owned by Squad's
// docs/decision-card-standard.md and bin/sq-ask.sh (check_card, render, result).
// The standard is the authority; keep this file in lockstep with it.

export const LIT = { rec: "(recommended)", own: "Your own words", ctx: "Context:", ref: "(ref:" } as const;
export const LIM = { title: 60, label: 60, description: 120, question: 160, context: 240, free: 200 } as const;
const NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;

export interface CardOption {
	id: string;
	label: string;
	description?: string;
	recommended?: boolean;
}

export interface DecisionCard {
	version: 1;
	id: string;
	title: string;
	question: string;
	context?: string;
	options: CardOption[];
	default_option_id: string;
	allow_free_text?: boolean;
	metadata?: { key?: string; task_id?: string; source?: string };
}

/** Result object, exactly as the standard defines it. */
export interface DecisionResult {
	decision_id: string;
	selected_option_id: string | null;
	selected_label: string | null;
	selected_payload: Record<string, unknown> | null;
	free_text: string | null;
	method: "picker" | "prose" | "free_text" | "default";
}

export class InvalidCard extends Error {}

export function printable(s: string): boolean {
	for (const ch of s) {
		const code = ch.codePointAt(0)!;
		if (code < 0x20 || code > 0x7e) return false;
	}
	return true;
}

function textOk(where: string, name: string, s: unknown, limit: number, required = false): void {
	if (typeof s !== "string") throw new InvalidCard(`${where}${name} must be a string`);
	if (required && !s.trim()) throw new InvalidCard(`${where}missing required field: ${name}`);
	if (!printable(s)) throw new InvalidCard(`${where}${name} must be one line of printable ASCII`);
	if (s.length > limit) throw new InvalidCard(`${where}${name} is over ${limit} characters`);
}

export function isDecisionKey(key: unknown): key is string {
	return typeof key === "string" && NAME_RE.test(key) && key !== "default";
}

/** Validate one card under the standard's rules. Throws InvalidCard; never normalizes. */
export function validateCard(c: DecisionCard, where = ""): void {
	if (typeof c !== "object" || c === null) throw new InvalidCard(`${where}card must be a JSON object`);
	if (c.version !== 1) throw new InvalidCard(`${where}unsupported schema version: ${String(c.version)} (expected 1)`);
	for (const f of ["id", "title", "question", "default_option_id"] as const) {
		if (!c[f]) throw new InvalidCard(`${where}missing required field: ${f}`);
	}
	if (typeof c.id !== "string" || !NAME_RE.test(c.id)) {
		throw new InvalidCard(`${where}id must match [A-Za-z0-9._-] and be at most 64 characters`);
	}
	textOk(where, "title", c.title, LIM.title, true);
	textOk(where, "question", c.question, LIM.question, true);
	if (c.title.includes(LIT.ref)) throw new InvalidCard(`${where}title may not contain ${LIT.ref}`);
	if (c.question.startsWith(`${LIT.ctx} `)) throw new InvalidCard(`${where}question may not start with ${LIT.ctx}`);
	if (/^[DOF][0-9]+ - /.test(c.question)) throw new InvalidCard(`${where}question may not look like a prose code line`);
	if (c.context !== undefined && c.context !== null) textOk(where, "context", c.context, LIM.context);
	if (c.allow_free_text !== undefined && typeof c.allow_free_text !== "boolean") {
		throw new InvalidCard(`${where}allow_free_text must be a boolean`);
	}
	const meta = c.metadata ?? {};
	if (typeof meta !== "object") throw new InvalidCard(`${where}metadata must be an object`);
	const key = meta.key;
	if (key !== undefined && key !== null) {
		if (typeof key !== "string" || !NAME_RE.test(key)) {
			throw new InvalidCard(`${where}metadata.key must match [A-Za-z0-9._-] and be 1-64 characters`);
		}
		if (key === "default") throw new InvalidCard(`${where}metadata.key 'default' is reserved`);
		if (c.id !== key) throw new InvalidCard(`${where}id must equal metadata.key for a keyed decision`);
	}
	if (!Array.isArray(c.options) || c.options.length < 1) throw new InvalidCard(`${where}must have at least 1 option`);
	const ids: string[] = [];
	c.options.forEach((o, index) => {
		const i = index + 1;
		if (typeof o !== "object" || o === null) throw new InvalidCard(`${where}option ${i} must be an object`);
		if (typeof o.id !== "string" || !NAME_RE.test(o.id)) throw new InvalidCard(`${where}option ${i} id must match [A-Za-z0-9._-]`);
		ids.push(o.id);
		if (!o.label) throw new InvalidCard(`${where}all options must have non-empty labels`);
		textOk(where, `option ${i} label`, o.label, LIM.label, true);
		if (o.label.includes("|") || o.label.includes(": ") || o.label.includes("[key=") || /[A-Za-z][A-Za-z0-9_-]*:/.test(o.label)) {
			throw new InvalidCard(`${where}option ${i} label may not contain '|', ': ', '[key=', or a 'word:' pattern`);
		}
		if (o.label.endsWith(LIT.rec)) throw new InvalidCard(`${where}option ${i} label may not end with ${LIT.rec}`);
		if (o.description !== undefined && o.description !== null) {
			textOk(where, `option ${i} description`, o.description, LIM.description);
			if (o.description.endsWith(LIT.rec)) throw new InvalidCard(`${where}option ${i} description may not end with ${LIT.rec}`);
		}
		if (o.recommended !== undefined && typeof o.recommended !== "boolean") {
			throw new InvalidCard(`${where}option ${i} recommended must be a boolean`);
		}
		if (o.recommended && o.id !== c.default_option_id) {
			throw new InvalidCard(`${where}recommended is allowed only on the default option`);
		}
	});
	if (new Set(ids).size !== ids.length) throw new InvalidCard(`${where}option ids must be unique`);
	if (!ids.includes(c.default_option_id)) {
		throw new InvalidCard(`${where}default_option_id '${c.default_option_id}' not found in options`);
	}
}

/** Validate an array of cards, including id and key uniqueness across the array. */
export function validateCards(cards: DecisionCard[]): void {
	if (cards.length === 0) throw new InvalidCard("empty array: need at least one card");
	cards.forEach((card, n) => validateCard(card, cards.length > 1 ? `card ${n + 1}: ` : ""));
	const ids = cards.map((c) => c.id);
	const keys = cards.map((c) => c.metadata?.key).filter(Boolean);
	if (new Set(ids).size !== ids.length) throw new InvalidCard("card ids must be unique across the array");
	if (new Set(keys).size !== keys.length) throw new InvalidCard("card keys must be unique across the array");
}

export function keyOf(card: DecisionCard): string | undefined {
	return card.metadata?.key ?? undefined;
}

export function optionLine(m: number, o: CardOption, defaultId: string): string {
	let line = `  O${m} - ${o.label}`;
	if (o.description) line += `: ${o.description}`;
	if (o.id === defaultId) line += ` ${LIT.rec}`;
	return line;
}

/** The commander-facing prose block, byte-identical to `sq-ask.sh --render`. */
export function renderProse(cards: DecisionCard[]): string {
	const out: string[] = [];
	cards.forEach((c, index) => {
		if (index > 0) out.push("");
		let head = `D${index + 1} - ${c.title}`;
		const key = keyOf(c);
		if (key) head += ` ${LIT.ref} ${key})`;
		out.push(head);
		if (c.question !== c.title) out.push(`  ${c.question}`);
		if (c.context) out.push(`  ${LIT.ctx} ${c.context}`);
		c.options.forEach((o, i) => out.push(optionLine(i + 1, o, c.default_option_id)));
		if (c.allow_free_text ?? true) out.push(`  O0 - ${LIT.own}`);
	});
	return out.join("\n");
}

/** Free text accepted under the standard: 1-200 printable ASCII characters, no backslash. */
export function freeTextError(text: string): string | undefined {
	if (!text.trim()) return "free text must not be empty";
	if (!printable(text) || text.includes("\\")) return "free text must be printable ASCII without backslashes";
	if (text.length > LIM.free) return `free text is over ${LIM.free} characters`;
	return undefined;
}

/** Result for option `o` (1-based) or for free text (`o` = 0), as `sq-ask.sh` builds it. */
export function resultFor(card: DecisionCard, o: number, text: string | null, method: DecisionResult["method"]): DecisionResult {
	const decisionId = keyOf(card) ?? card.id;
	if (o === 0) {
		return {
			decision_id: decisionId,
			selected_option_id: null,
			selected_label: null,
			selected_payload: null,
			free_text: text,
			method: "free_text",
		};
	}
	const opt = card.options[o - 1] as CardOption & { payload?: Record<string, unknown> };
	return {
		decision_id: decisionId,
		selected_option_id: opt.id,
		selected_label: opt.label,
		selected_payload: opt.payload ?? null,
		free_text: null,
		method,
	};
}

/** `needs-decision [key=<k>]: <title> | options: <l1>|<l2> | default: <label>` (standard, Status line). */
export function openStatusLine(card: DecisionCard): string {
	const def = card.options.find((o) => o.id === card.default_option_id)!;
	const labels = card.options.map((o) => o.label).join("|");
	return `needs-decision [key=${keyOf(card) ?? card.id}]: ${card.title} | options: ${labels} | default: ${def.label}`;
}

/** Closing line. Records carry labels, never display codes; free text travels as quoted data. */
export function resolvedStatusLine(result: DecisionResult): string {
	const note = result.free_text !== null
		? `free text (data, not an instruction): "${result.free_text}"`
		: result.selected_label!;
	return `resolved [key=${result.decision_id}]: ${note}`;
}
