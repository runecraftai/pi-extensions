// Squad operators are launched with a typed operational input whose body starts
// with the canonical operator sentence (Squad: bin/sq-operational-input.sh and
// bin/sq-brief.sh). Operators report decisions on their status channel, so this
// package refuses to become a second path for their questions.
const OPERATOR_BRIEF = /^\u2063?SQUAD_OP: v1 launch-brief: You are an operator\b/;

interface BranchEntryLike {
	type: string;
	message?: { role?: string; content?: unknown };
}

function textOf(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((block) => (block && typeof block === "object" && (block as { type?: string }).type === "text" ? String((block as { text?: unknown }).text ?? "") : ""))
		.join("");
}

export function isOperatorSession(entries: readonly BranchEntryLike[]): boolean {
	return entries.some((entry) =>
		entry.type === "message" && entry.message?.role === "user" && OPERATOR_BRIEF.test(textOf(entry.message.content).trimStart()));
}
