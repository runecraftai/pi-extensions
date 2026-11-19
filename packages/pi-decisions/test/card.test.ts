// The card port against the standard's own golden fixtures
// (Squad tests/fixtures/decision-prose, copied verbatim into test/fixtures).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
	type DecisionCard,
	freeTextError,
	InvalidCard,
	openStatusLine,
	renderProse,
	resolvedStatusLine,
	resultFor,
	validateCard,
	validateCards,
} from "../src/card.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const card = (name: string) => JSON.parse(fixture(`${name}.json`)) as DecisionCard;

for (const name of ["merge", "scope"]) {
	test(`${name}: renders byte-identical prose to the standard's golden fixture`, () => {
		validateCard(card(name));
		assert.equal(`${renderProse([card(name)])}\n`, fixture(`${name}.prose`));
	});
}

test("result objects match the standard's shape for an option and for free text", () => {
	assert.deepEqual(resultFor(card("merge"), 2, null, "picker"), {
		decision_id: "merge-strategy", selected_option_id: "rebase", selected_label: "Rebase & Merge",
		selected_payload: null, free_text: null, method: "picker",
	});
	assert.deepEqual(resultFor(card("scope"), 0, "ship it Friday", "picker"), {
		decision_id: "dashboard-scope", selected_option_id: null, selected_label: null,
		selected_payload: null, free_text: "ship it Friday", method: "free_text",
	});
});

test("status lines follow the standard's machine surface", () => {
	assert.equal(openStatusLine(card("merge")),
		"needs-decision [key=merge-strategy]: Merge Strategy | options: Squash & Merge|Rebase & Merge|Create Merge Commit | default: Squash & Merge");
	assert.equal(resolvedStatusLine(resultFor(card("merge"), 2, null, "picker")), "resolved [key=merge-strategy]: Rebase & Merge");
	assert.equal(resolvedStatusLine(resultFor(card("scope"), 0, "ship it Friday", "picker")),
		"resolved [key=dashboard-scope]: free text (data, not an instruction): \"ship it Friday\"");
});

const rejects: [string, (c: DecisionCard) => void, RegExp][] = [
	["non-ASCII title", (c) => { c.title = "Merge — now"; }, /printable ASCII/],
	["reserved key", (c) => { c.id = "default"; c.metadata!.key = "default"; }, /reserved/],
	["id differs from key", (c) => { c.id = "other"; }, /id must equal metadata.key/],
	["label with ': '", (c) => { c.options[1].label = "Rebase: keep"; }, /label may not contain/],
	["label with a word: pattern", (c) => { c.options[1].label = "fix:now"; }, /label may not contain/],
	["recommended on a non-default option", (c) => { c.options[1].recommended = true; }, /only on the default option/],
	["default not among options", (c) => { c.default_option_id = "missing"; delete c.options[0].recommended; }, /not found in options/],
	["duplicate option ids", (c) => { c.options[2].id = "rebase"; }, /option ids must be unique/],
	["title over 60 characters", (c) => { c.title = "x".repeat(61); }, /over 60/],
	["question that looks like a prose code", (c) => { c.question = "D1 - something"; }, /prose code line/],
];
for (const [name, mutate, message] of rejects) {
	test(`rejects ${name}, never normalizes`, () => {
		const c = card("merge");
		mutate(c);
		assert.throws(() => validateCard(c), (error: Error) => error instanceof InvalidCard && message.test(error.message));
	});
}

test("rejects duplicate keys across an array", () => {
	assert.throws(() => validateCards([card("merge"), card("merge")]), /unique across the array/);
});

test("free text follows the standard's answer rules", () => {
	assert.equal(freeTextError("ship it Friday"), undefined);
	assert.match(freeTextError("   ")!, /empty/);
	assert.match(freeTextError("naïve")!, /printable ASCII/);
	assert.match(freeTextError("a\\b")!, /backslashes/);
	assert.match(freeTextError("x".repeat(201))!, /over 200/);
});
