// The tool end to end: dialog keystrokes in, durable record out.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { type DecisionResult, renderProse, resolvedStatusLine } from "../src/card.ts";
import { runDecisions, toCard } from "../src/index.ts";
import { DecisionRecord, RECORD_SCHEMA } from "../src/record.ts";

const KEY = { enter: "\r", down: "\x1b[B", tab: "\t", esc: "\x1b", backspace: "\x7f" };
const theme = { fg: (_c: string, s: string) => s, bg: (_c: string, s: string) => s, bold: (s: string) => s };

const merge = {
	key: "merge-strategy",
	title: "Merge Strategy",
	question: "How should we merge the authentication fix PR?",
	context: "PR #42 fixes the OAuth token refresh bug. CI is green, 2 commits, time-sensitive.",
	options: [
		{ id: "squash", label: "Squash & Merge", description: "Combine into one clean commit on main" },
		{ id: "rebase", label: "Rebase & Merge", description: "Preserve both commits in history" },
		{ id: "merge-commit", label: "Create Merge Commit", description: "Standard merge with a merge commit message" },
	],
	recommended: "squash",
};
const scope = {
	key: "dashboard-scope",
	title: "Dashboard Scope",
	question: "Should the user dashboard include analytics widgets in the initial release?",
	options: [
		{ id: "minimal", label: "Ship Without Analytics", description: "Release with profile and activity only" },
		{ id: "full", label: "Include Analytics", description: "Add analytics widgets before release (+2 days)" },
	],
	recommended: "minimal",
};

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function recordDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "pi-decisions-"));
	dirs.push(dir);
	return dir;
}

function ctx(keys: string[], options: { mode?: string; branch?: unknown[] } = {}) {
	const frames: string[] = [];
	return {
		frames,
		mode: (options.mode ?? "tui") as "tui",
		hasUI: (options.mode ?? "tui") === "tui",
		sessionManager: {
			getBranch: () => options.branch ?? [],
			getSessionId: () => "session-1",
			getSessionFile: () => "/sessions/session-1.jsonl",
		},
		ui: {
			custom: (factory: (...args: unknown[]) => { render(w: number): string[]; handleInput(d: string): void }) =>
				new Promise((resolve) => {
					const component = factory({ requestRender() {} }, theme, {}, resolve);
					frames.push(component.render(100).join("\n"));
					for (const key of keys) {
						component.handleInput(key);
						frames.push(component.render(100).join("\n"));
					}
				}),
		},
	} as never as Parameters<typeof runDecisions>[1] & { frames: string[] };
}

const now = () => new Date("2026-01-02T03:04:05.000Z");

test("submitting writes an open and a resolved record with the standard's result object", async () => {
	const dir = recordDir();
	// O2, then review tab, then Enter submits.
	const result = await runDecisions({ decisions: [merge] }, ctx(["2", KEY.enter]), { recordDir: dir, now });
	const record = new DecisionRecord(dir);
	const events = record.events();
	assert.equal(events.length, 2);
	const [open, resolved] = events;
	assert.equal(open.event, "open");
	assert.deepEqual(open.event === "open" && open.card, toCard(merge));
	assert.deepEqual(open.session, { id: "session-1", file: "/sessions/session-1.jsonl" });
	assert.equal(resolved.event, "resolved");
	assert.deepEqual(resolved.event === "resolved" && resolved.result, {
		decision_id: "merge-strategy", selected_option_id: "rebase", selected_label: "Rebase & Merge",
		selected_payload: null, free_text: null, method: "picker",
	});
	assert.equal(resolved.at, "2026-01-02T03:04:05.000Z");
	assert.deepEqual(readFileSync(record.statusPath, "utf8").split("\n"), [
		"needs-decision [key=merge-strategy]: Merge Strategy | options: Squash & Merge|Rebase & Merge|Create Merge Commit | default: Squash & Merge",
		"resolved [key=merge-strategy]: Rebase & Merge",
		"",
	]);
	assert.equal((result.details as { status: string }).status, "answered");
	assert.match(result.content[0].text, /merge-strategy: Rebase & Merge \(rebase\)/);
});

test("several decisions, own words, and a note travel into the record", async () => {
	const dir = recordDir();
	const keys = [
		"n", ..."needs PM sign-off", KEY.enter, // note on D1
		KEY.enter, // D1: the cursor starts on the recommended option
		"0", ..."ship it Friday", KEY.enter, // D2: own words
		KEY.enter, // submit
	];
	const c = ctx(keys);
	await runDecisions({ decisions: [merge, scope] }, c, { recordDir: dir, now });
	const resolved = new DecisionRecord(dir).events().filter((e) => e.event === "resolved");
	assert.deepEqual(resolved.map((e) => e.event === "resolved" && [e.result, e.note]), [
		[{ decision_id: "merge-strategy", selected_option_id: "squash", selected_label: "Squash & Merge", selected_payload: null, free_text: null, method: "picker" }, "needs PM sign-off"],
		[{ decision_id: "dashboard-scope", selected_option_id: null, selected_label: null, selected_payload: null, free_text: "ship it Friday", method: "free_text" }, null],
	]);
	const first = c.frames[0];
	assert.match(first, /O1 - Squash & Merge \(recommended\)/);
	assert.match(first, /Combine into one clean commit on main/);
	assert.match(first, /O0 - Your own words/);
	assert.match(c.frames.at(-2)!, /Review and submit/);
	// The free-text close carries its own key and travels as quoted data.
	assert.deepEqual(readFileSync(new DecisionRecord(dir).statusPath, "utf8").trimEnd().split("\n").slice(-2), [
		"resolved [key=merge-strategy]: Squash & Merge",
		'resolved [key=dashboard-scope]: free text (data, not an instruction): "ship it Friday"',
	]);
});

test("invalid free text is refused in the dialog and nothing is recorded until it is fixed", async () => {
	const dir = recordDir();
	const c = ctx(["0", "\\", KEY.enter, KEY.backspace, ..."ok", KEY.enter, KEY.enter]);
	await runDecisions({ decisions: [merge] }, c, { recordDir: dir, now });
	assert.ok(c.frames.some((frame) => frame.includes("printable ASCII without backslashes")));
	const resolved = new DecisionRecord(dir).events().at(-1);
	assert.equal(resolved?.event === "resolved" && resolved.result.free_text, "ok");
});

test("cancelling leaves the decision open and returns the chat request", async () => {
	const dir = recordDir();
	const result = await runDecisions({ decisions: [merge] }, ctx([KEY.esc]), { recordDir: dir, now });
	const record = new DecisionRecord(dir);
	assert.deepEqual(record.events().map((e) => e.event), ["open"]);
	assert.deepEqual(result.details, {
		status: "ask_in_chat", reason: "cancelled", cards: [toCard(merge)], prose: renderProse([toCard(merge)]),
	});
});

test("without an interactive terminal it returns a structured chat request and records nothing", async () => {
	const dir = recordDir();
	for (const mode of ["rpc", "print", "json"]) {
		const result = await runDecisions({ decisions: [merge] }, ctx([], { mode }), { recordDir: dir, now });
		const details = result.details as { status: string; reason: string; prose: string };
		assert.equal(details.status, "ask_in_chat");
		assert.equal(details.reason, "no_terminal");
		assert.match(details.prose, /^D1 - Merge Strategy \(ref: merge-strategy\)/);
		assert.match(result.content[0].text, /Do not pick an option for them/);
	}
	assert.equal(existsSync(join(dir, "decisions.jsonl")), false);
});

test("a Squad operator session is refused and nothing is recorded", async () => {
	const dir = recordDir();
	const branch = [{ type: "message", message: { role: "user", content: [{ type: "text", text: "\u2063SQUAD_OP: v1 launch-brief: You are an operator: an autonomous worker agent managed by Squad." }] } }];
	const result = await runDecisions({ decisions: [merge] }, ctx([KEY.enter, KEY.enter], { branch }), { recordDir: dir, now });
	assert.deepEqual(result.details, { status: "refused", reason: "operator_session" });
	assert.equal(existsSync(join(dir, "decisions.jsonl")), false);
});

test("a resolved key cannot be asked again, and an open key may only gain options", async () => {
	const dir = recordDir();
	await runDecisions({ decisions: [merge] }, ctx([KEY.esc]), { recordDir: dir, now });
	const changed = { ...merge, options: [merge.options[1], merge.options[0]] };
	await assert.rejects(runDecisions({ decisions: [changed] }, ctx([KEY.esc]), { recordDir: dir, now }), /options may only be appended/);
	const appended = { ...merge, options: [...merge.options, { id: "later", label: "Decide Later", description: "Leave the PR open" }] };
	await runDecisions({ decisions: [appended] }, ctx(["4", KEY.enter]), { recordDir: dir, now });
	assert.deepEqual(new DecisionRecord(dir).events().map((e) => e.event), ["open", "open", "resolved"]);
	await assert.rejects(runDecisions({ decisions: [merge] }, ctx([]), { recordDir: dir, now }), /already resolved/);
});

test("invalid cards are rejected before anything is shown or written", async () => {
	const dir = recordDir();
	const bad = { ...merge, options: [{ ...merge.options[0], label: "Squash: now" }, merge.options[1]] };
	await assert.rejects(runDecisions({ decisions: [bad] }, ctx([]), { recordDir: dir, now }), /Invalid decision card/);
	assert.equal(existsSync(join(dir, "decisions.jsonl")), false);
});

test("a torn final append is dropped and the record stays usable", async () => {
	const dir = recordDir();
	await runDecisions({ decisions: [merge] }, ctx([KEY.esc]), { recordDir: dir, now });
	const firstLine = readFileSync(join(dir, "decisions.status"), "utf8").trimEnd().split("\n");
	appendFileSync(join(dir, "decisions.jsonl"), '{"schema":"runecraft.pi-decisions/v1","event":"open","key":"merge-strat');
	// A torn resolved line (grammar-valid prefix, wrong label) must be dropped, not kept.
	appendFileSync(join(dir, "decisions.status"), "resolved [key=merge-strategy]: Reb");
	const record = new DecisionRecord(dir);
	assert.deepEqual(record.events().map((e) => e.event), ["open"]);
	assert.equal(record.latest("merge-strategy")?.event, "open");
	// The tool reads the earlier decision (so the open key may still gain options) and answers it.
	const appended = { ...merge, options: [...merge.options, { id: "later", label: "Decide Later", description: "Leave the PR open" }] };
	const result = await runDecisions({ decisions: [appended] }, ctx(["4", KEY.enter]), { recordDir: dir, now });
	assert.equal((result.details as { status: string }).status, "answered");
	const after = new DecisionRecord(dir);
	assert.deepEqual(after.events().map((e) => e.event), ["open", "open", "resolved"]);
	// The whole status file carries only real transitions, so no truncated label is visible to the fold.
	assert.deepEqual(readFileSync(after.statusPath, "utf8").split("\n"), [
		...firstLine,
		"needs-decision [key=merge-strategy]: Merge Strategy | options: Squash & Merge|Rebase & Merge|Create Merge Commit|Decide Later | default: Squash & Merge",
		"resolved [key=merge-strategy]: Decide Later",
		"",
	]);
});

test("a torn append after a non-ASCII record truncates on a byte boundary", async () => {
	const dir = recordDir();
	const record = new DecisionRecord(dir, now);
	// The session path is recorded verbatim, so a record can contain multi-byte characters.
	const session = { id: "session-1", file: "/sessions/séance-1.jsonl" };
	record.open(toCard(merge), session);
	appendFileSync(record.jsonlPath, '{"schema":"runecraft.pi-decisions/v1","event":"open","key":"tor');
	assert.deepEqual(record.events().map((e) => e.event), ["open"]);
	const result: DecisionResult = {
		decision_id: "merge-strategy", selected_option_id: "squash", selected_label: "Squash & Merge",
		selected_payload: null, free_text: null, method: "picker",
	};
	record.resolve(result, null, session);
	const events = new DecisionRecord(dir).events();
	assert.deepEqual(events.map((e) => e.event), ["open", "resolved"]);
	assert.deepEqual(events[0].event === "open" && events[0].session, session);
	assert.deepEqual(events[0].event === "open" && events[0].card, toCard(merge));
	// Nothing was cut out of the earlier record: every persisted line is a whole event.
	for (const line of readFileSync(record.jsonlPath, "utf8").trimEnd().split("\n")) {
		assert.doesNotThrow(() => JSON.parse(line));
	}
	record.open(toCard(scope), session);
	assert.deepEqual(readFileSync(record.jsonlPath, "utf8").trimEnd().split("\n").map((line) => JSON.parse(line).key), [
		"merge-strategy", "merge-strategy", "dashboard-scope",
	]);
});

test("a crash between the record and status writes is repaired on the next append", () => {
	const dir = recordDir();
	const record = new DecisionRecord(dir, now);
	const session = { id: "session-1", file: "/sessions/session-1.jsonl" };
	const opened = record.open(toCard(merge), session);
	const result: DecisionResult = {
		decision_id: "merge-strategy", selected_option_id: "rebase", selected_label: "Rebase & Merge",
		selected_payload: null, free_text: null, method: "picker",
	};
	// The process wrote the resolved event, then died before the status write.
	const killed = {
		schema: RECORD_SCHEMA, event: "resolved" as const, key: result.decision_id, at: "2026-01-02T03:04:05.000Z",
		session, result, note: null, status_line: resolvedStatusLine(result),
	};
	appendFileSync(record.jsonlPath, `${JSON.stringify(killed)}\n`);
	const stale = readFileSync(record.statusPath, "utf8");
	assert.deepEqual(stale.trimEnd().split("\n"), [opened.status_line]);
	// Reading the authoritative record neither hides the answer nor repairs the status file.
	assert.deepEqual(new DecisionRecord(dir).events().map((e) => e.status_line), [opened.status_line, killed.status_line]);
	assert.equal(readFileSync(record.statusPath, "utf8"), stale);
	// The next append re-emits the missing transition before its own line, once.
	const scopeOpen = record.open(toCard(scope), session);
	assert.deepEqual(readFileSync(record.statusPath, "utf8").split("\n"), [
		opened.status_line, killed.status_line, scopeOpen.status_line, "",
	]);
	// A later append does not re-emit lines the status file already has.
	const again = record.open(toCard(merge), session);
	const statusLines = readFileSync(record.statusPath, "utf8").trimEnd().split("\n");
	assert.deepEqual(statusLines, [opened.status_line, killed.status_line, scopeOpen.status_line, again.status_line]);
	assert.deepEqual(statusLines, new DecisionRecord(dir).events().map((e) => e.status_line));
});

test("a corrupt line before the end fails with the file and line number", async () => {
	const dir = recordDir();
	await runDecisions({ decisions: [merge] }, ctx([KEY.esc]), { recordDir: dir, now });
	const file = join(dir, "decisions.jsonl");
	const content = readFileSync(file, "utf8");
	writeFileSync(file, `not a record\n${content}`);
	const failed = (error: Error) => error.message.includes(file) && error.message.includes("line 1") && error.message.includes("not valid JSON");
	assert.throws(() => new DecisionRecord(dir).events(), failed);
	assert.throws(() => new DecisionRecord(dir).latest("merge-strategy"), failed);
	// The tool surfaces the same actionable error instead of hiding the damaged record.
	await assert.rejects(runDecisions({ decisions: [merge] }, ctx([KEY.esc]), { recordDir: dir, now }), failed);
});

test("a newline-terminated corrupt final line fails instead of being skipped", async () => {
	const dir = recordDir();
	await runDecisions({ decisions: [merge] }, ctx([KEY.esc]), { recordDir: dir, now });
	const file = join(dir, "decisions.jsonl");
	// Not torn: the bad line ends with a newline, so it is damage and must be reported.
	appendFileSync(file, "not a record\n");
	const failed = (error: Error) => error.message.includes(file) && error.message.includes("line 2") && error.message.includes("not valid JSON");
	assert.throws(() => new DecisionRecord(dir).events(), failed);
	assert.throws(() => new DecisionRecord(dir).latest("merge-strategy"), failed);
	await assert.rejects(runDecisions({ decisions: [merge] }, ctx([KEY.esc]), { recordDir: dir, now }), failed);
});

// Cross-check against Squad's own tooling when it is installed next to this checkout.
const squad = process.env.SQUAD_ROOT ?? join(process.env.HOME ?? "", "Projects", "squad");
const hasSquad = existsSync(join(squad, "bin", "sq-ask.sh")) && existsSync(join(squad, "bin", "sq-classify-lib.sh"));
test("Squad's sq-ask.sh and status fold accept the record", { skip: hasSquad ? false : `Squad not found at ${squad}` }, async () => {
	const dir = recordDir();
	await runDecisions({ decisions: [merge] }, ctx(["2", KEY.enter]), { recordDir: dir, now });
	const [open, resolved] = new DecisionRecord(dir).events();
	assert.ok(open.event === "open" && resolved.event === "resolved");
	const sqAsk = (args: string[]) => execFileSync(join(squad, "bin", "sq-ask.sh"), args, { input: JSON.stringify(open.card), encoding: "utf8" });
	assert.equal(sqAsk(["--validate"]).trim(), "valid");
	assert.equal(sqAsk(["--render"]).trimEnd(), renderProse([open.card]));
	// The same answer typed as prose resolves to the same result; only the method differs.
	assert.deepEqual({ ...JSON.parse(sqAsk(["--answer", "d1 o2"])), method: "picker" }, resolved.result);
	const fold = (file: string) => execFileSync("bash", ["-c", `. "$1"; status_open_decisions "$2"`, "fold", join(squad, "bin", "sq-classify-lib.sh"), file], { encoding: "utf8" });
	const record = new DecisionRecord(dir);
	assert.equal(fold(record.statusPath), "");
	const openOnly = join(dir, "open-only.status");
	execFileSync("bash", ["-c", `head -n 1 "$1" > "$2"`, "head", record.statusPath, openOnly]);
	assert.match(fold(openOnly), /^merge-strategy\tneeds-decision\tMerge Strategy \| options: /);
});

test("Squad's sq-ask.sh renders a two-card array with the same blank-line separator", { skip: hasSquad ? false : `Squad not found at ${squad}` }, () => {
	const cards = [toCard(merge), toCard(scope)];
	const rendered = execFileSync(join(squad, "bin", "sq-ask.sh"), ["--render"], { input: JSON.stringify(cards), encoding: "utf8" });
	assert.equal(rendered.trimEnd(), renderProse(cards));
});

test("Squad's sq-ask.sh and status fold accept the free-text close variant", { skip: hasSquad ? false : `Squad not found at ${squad}` }, async () => {
	const dir = recordDir();
	await runDecisions({ decisions: [scope] }, ctx(["0", ..."ship it Friday", KEY.enter, KEY.enter]), { recordDir: dir, now });
	const [open, resolved] = new DecisionRecord(dir).events();
	assert.ok(open.event === "open" && resolved.event === "resolved");
	assert.equal(resolved.result.free_text, "ship it Friday");
	const sqAsk = (args: string[]) => execFileSync(join(squad, "bin", "sq-ask.sh"), args, { input: JSON.stringify(open.card), encoding: "utf8" });
	// The same own-words answer typed as prose resolves to the same result; only the method differs.
	assert.deepEqual({ ...JSON.parse(sqAsk(["--answer", 'd1 o0 "ship it Friday"'])), method: "free_text" }, resolved.result);
	// With another decision left open, the fold closes only the free-text key.
	await runDecisions({ decisions: [merge] }, ctx([KEY.esc]), { recordDir: dir, now });
	const folded = execFileSync("bash", ["-c", `. "$1"; status_open_decisions "$2"`, "fold", join(squad, "bin", "sq-classify-lib.sh"), new DecisionRecord(dir).statusPath], { encoding: "utf8" });
	assert.match(folded, /^merge-strategy\tneeds-decision\tMerge Strategy \| options: /);
	assert.doesNotMatch(folded, /dashboard-scope/);
});
