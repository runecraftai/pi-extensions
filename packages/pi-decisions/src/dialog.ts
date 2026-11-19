// Terminal dialog for a set of decision cards.
//
// One tab per decision plus a Submit tab. Every decision shows its options with
// their descriptions, marks the recommended one, and offers the free-text escape
// (`O0 - Your own words`). `n` attaches a note to the current decision. Nothing is
// answered until the Submit tab is confirmed, so the record is written once.
import { Key, matchesKey, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { type DecisionCard, freeTextError, keyOf, LIM, LIT, printable } from "./card.ts";

export interface DialogTheme {
	fg(color: string, text: string): string;
	bg(color: string, text: string): string;
	bold(text: string): string;
}

export interface DialogAnswer {
	/** 1-based option index, or 0 for free text. */
	option: number;
	freeText: string | null;
	note: string | null;
}

export type DialogOutcome = { cancelled: true } | { cancelled: false; answers: DialogAnswer[] };

interface Input {
	kind: "free" | "note";
	buffer: string;
	error?: string;
}

export interface DialogComponent {
	render(width: number): string[];
	invalidate(): void;
	handleInput(data: string): void;
}

export function createDecisionDialog(
	cards: DecisionCard[],
	theme: DialogTheme,
	requestRender: () => void,
	done: (outcome: DialogOutcome) => void,
): DialogComponent {
	const submitTab = cards.length;
	const picks = new Map<number, { option: number; freeText: string | null }>();
	const notes = new Map<number, string>();
	const cursors = cards.map((card) => card.options.findIndex((o) => o.id === card.default_option_id));
	let tab = 0;
	let input: Input | undefined;
	let cache: string[] | undefined;
	let finished = false;

	const freeAllowed = (i: number) => cards[i].allow_free_text ?? true;
	const rowCount = (i: number) => cards[i].options.length + (freeAllowed(i) ? 1 : 0);
	const allAnswered = () => cards.every((_, i) => picks.has(i));

	function refresh(): void {
		cache = undefined;
		requestRender();
	}

	function finish(outcome: DialogOutcome): void {
		if (finished) return;
		finished = true;
		done(outcome);
	}

	function advance(): void {
		const next = cards.findIndex((_, i) => i > tab && !picks.has(i));
		const wrap = cards.findIndex((_, i) => !picks.has(i));
		tab = next >= 0 ? next : wrap >= 0 && wrap !== tab ? wrap : submitTab;
		refresh();
	}

	function choose(row: number): void {
		const card = cards[tab];
		if (row < card.options.length) {
			picks.set(tab, { option: row + 1, freeText: null });
			advance();
		} else if (freeAllowed(tab)) {
			const previous = picks.get(tab);
			input = { kind: "free", buffer: previous?.option === 0 ? previous.freeText ?? "" : "" };
			refresh();
		}
	}

	function commitInput(): void {
		if (!input) return;
		const text = input.buffer;
		if (input.kind === "note") {
			if (!text.trim()) notes.delete(tab);
			else {
				const error = freeTextError(text);
				if (error) {
					input.error = error.replace("free text", "note");
					refresh();
					return;
				}
				notes.set(tab, text);
			}
			input = undefined;
			refresh();
			return;
		}
		const error = freeTextError(text);
		if (error) {
			input.error = error;
			refresh();
			return;
		}
		picks.set(tab, { option: 0, freeText: text });
		cursors[tab] = cards[tab].options.length;
		input = undefined;
		advance();
	}

	function handleInputMode(data: string): void {
		if (!input) return;
		if (matchesKey(data, Key.escape)) {
			input = undefined;
			refresh();
		} else if (matchesKey(data, Key.enter)) {
			commitInput();
		} else if (matchesKey(data, Key.backspace)) {
			input.buffer = input.buffer.slice(0, -1);
			input.error = undefined;
			refresh();
		} else if (data.length > 0 && printable(data)) {
			input.buffer = (input.buffer + data).slice(0, LIM.free);
			input.error = undefined;
			refresh();
		}
	}

	function handleInput(data: string): void {
		if (finished) return;
		if (input) return handleInputMode(data);
		if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
			tab = (tab + 1) % (cards.length + 1);
			return refresh();
		}
		if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
			tab = (tab + cards.length) % (cards.length + 1);
			return refresh();
		}
		if (matchesKey(data, Key.escape)) return finish({ cancelled: true });
		if (tab === submitTab) {
			if (matchesKey(data, Key.enter) && allAnswered()) {
				finish({
					cancelled: false,
					answers: cards.map((_, i) => ({ ...picks.get(i)!, note: notes.get(i) ?? null })),
				});
			}
			return;
		}
		if (matchesKey(data, Key.up)) {
			cursors[tab] = Math.max(0, cursors[tab] - 1);
			return refresh();
		}
		if (matchesKey(data, Key.down)) {
			cursors[tab] = Math.min(rowCount(tab) - 1, cursors[tab] + 1);
			return refresh();
		}
		if (matchesKey(data, Key.enter)) return choose(cursors[tab]);
		if (data === "n" || data === "N") {
			input = { kind: "note", buffer: notes.get(tab) ?? "" };
			return refresh();
		}
		if (/^[0-9]$/.test(data)) {
			const n = Number(data);
			if (n === 0 && freeAllowed(tab)) {
				cursors[tab] = cards[tab].options.length;
				return choose(cursors[tab]);
			}
			if (n >= 1 && n <= cards[tab].options.length) {
				cursors[tab] = n - 1;
				return choose(n - 1);
			}
		}
	}

	function answerSummary(i: number): string {
		const pick = picks.get(i);
		if (!pick) return theme.fg("warning", "unanswered");
		if (pick.option === 0) return `${theme.fg("muted", "own words: ")}"${pick.freeText}"`;
		return cards[i].options[pick.option - 1].label;
	}

	function render(width: number): string[] {
		if (cache) return cache;
		const w = Math.max(1, width);
		const lines: string[] = [];
		const wrapped = (prefix: string, text: string) => {
			const pw = visibleWidth(prefix);
			if (pw >= w) return void lines.push(...wrapTextWithAnsi(prefix + text, w));
			wrapTextWithAnsi(text, w - pw).forEach((line, i) => lines.push(`${i === 0 ? prefix : " ".repeat(pw)}${line}`));
		};

		lines.push(theme.fg("accent", "─".repeat(w)));
		const tabs = cards.map((card, i) => {
			const label = ` ${picks.has(i) ? "■" : "□"} D${i + 1} ${card.title} `;
			if (i === tab) return theme.bg("selectedBg", theme.fg("text", label));
			return theme.fg(picks.has(i) ? "success" : "muted", label);
		});
		const submit = " ✓ Submit ";
		tabs.push(tab === submitTab ? theme.bg("selectedBg", theme.fg("text", submit)) : theme.fg(allAnswered() ? "success" : "dim", submit));
		wrapped(" ", tabs.join(" "));
		lines.push("");

		if (tab === submitTab) {
			wrapped(" ", theme.fg("accent", theme.bold("Review and submit")));
			lines.push("");
			cards.forEach((card, i) => {
				wrapped(" ", `${theme.fg("muted", `D${i + 1} ${card.title} ${LIT.ref} ${keyOf(card)}): `)}${answerSummary(i)}`);
				const note = notes.get(i);
				if (note) wrapped("     ", theme.fg("dim", `note: ${note}`));
			});
			lines.push("");
			wrapped(" ", allAnswered()
				? theme.fg("success", "Enter records these decisions • Esc cancels")
				: theme.fg("warning", "Answer every decision before submitting • Esc cancels"));
		} else {
			const card = cards[tab];
			wrapped(" ", `${theme.fg("accent", theme.bold(card.title))} ${theme.fg("dim", `${LIT.ref} ${keyOf(card)})`)}`);
			if (card.question !== card.title) wrapped(" ", theme.fg("text", card.question));
			if (card.context) wrapped(" ", theme.fg("muted", `${LIT.ctx} ${card.context}`));
			lines.push("");
			const pick = picks.get(tab);
			const rows = card.options.map((o, i) => ({ code: `O${i + 1}`, label: o.label, description: o.description, rec: o.id === card.default_option_id }));
			if (freeAllowed(tab)) rows.push({ code: "O0", label: LIT.own, description: undefined, rec: false });
			rows.forEach((row, i) => {
				const selected = i === cursors[tab];
				const chosen = pick && (row.code === "O0" ? pick.option === 0 : pick.option === i + 1);
				const pointer = selected ? theme.fg("accent", "› ") : "  ";
				const mark = chosen ? theme.fg("success", "● ") : "○ ";
				const rec = row.rec ? ` ${theme.fg("success", LIT.rec)}` : "";
				wrapped(`${pointer}${mark}`, `${theme.fg(selected ? "accent" : "text", `${row.code} - ${row.label}`)}${rec}`);
				if (row.description) wrapped("       ", theme.fg("muted", row.description));
				if (row.code === "O0" && pick?.option === 0 && !(input?.kind === "free")) {
					wrapped("       ", theme.fg("text", `"${pick.freeText}"`));
				}
			});
			const note = notes.get(tab);
			if (note && input?.kind !== "note") {
				lines.push("");
				wrapped(" ", theme.fg("dim", `note: ${note}`));
			}
			if (input) {
				lines.push("");
				wrapped(" ", theme.fg("muted", input.kind === "free" ? "Your own words:" : "Note for this decision:"));
				wrapped(" › ", `${input.buffer}${theme.fg("accent", "▏")}`);
				if (input.error) wrapped(" ", theme.fg("error", input.error));
			}
		}

		lines.push("");
		const help = input
			? "Enter confirm • Backspace delete • Esc back"
			: tab === submitTab
				? "Tab/←→ decisions • Enter submit • Esc cancel"
				: "↑↓ move • Enter or 1-9 choose • 0 own words • n note • Tab/←→ decisions • Esc cancel";
		wrapped(" ", theme.fg("dim", help));
		lines.push(theme.fg("accent", "─".repeat(w)));
		cache = lines;
		return lines;
	}

	return { render, handleInput, invalidate: () => { cache = undefined; } };
}
