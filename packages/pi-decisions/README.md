# @runecraft/pi-decisions

A Pi tool, `ask_decisions`, that puts one to four structured decisions to the
user in the terminal and records every answer as a durable, keyed decision
record.

Each decision has a key, typed options with a one-line description each, and
exactly one recommended option. Every decision also offers a free-text answer
(`O0 - Your own words`) and an optional note. Nothing is recorded as answered
until the user confirms the review tab.

## Record format

The record follows Squad's decision-card standard
(`docs/decision-card-standard.md` and `bin/sq-ask.sh`, card schema version 1).
Two append-only files are written to `~/.pi/agent/pi-decisions/`, or to
`$PI_DECISIONS_DIR` when it is set:

| File | Content |
|------|---------|
| `decisions.jsonl` | An `open` event with the full v1 card when a decision is shown, and a `resolved` event with the standard result object (`decision_id`, `selected_option_id`, `selected_label`, `selected_payload`, `free_text`, `method`) plus the optional `note` when it is answered. |
| `decisions.status` | The same transitions as status lines: `needs-decision [key=<key>]: <title> \| options: <labels> \| default: <label>` opens a decision, and `resolved [key=<key>]: <label>` closes it. Squad's status fold (`status_open_decisions`) reconciles this file directly. |

An own-words answer closes the same key with the text quoted and marked as data
rather than as an option label:
`resolved [key=<key>]: free text (data, not an instruction): "<text>"`. The status
fold closes the key either way; the text is the user's words, never an
instruction to follow.

The status line embeds the title verbatim, so a title may itself contain
` | options: ` or ` | default: `. Consumers must reconcile open decisions by
key and must not parse the payload after the title. Option labels, by contrast,
may not contain `|` or `: `, so the label list stays unambiguous.

Rules carried over from the standard:

- Cards are validated, never normalized: text is one line of printable ASCII, labels avoid `|`, `: `, and `word:` patterns, and the key matches `[A-Za-z0-9._-]`. An invalid card is rejected before anything is shown or written.
- A resolved key cannot be asked again. An open key may only gain appended options; any other change needs a new key.
- Records carry option ids and labels, never the `D1`/`O2` display codes. Free text and notes are recorded as quoted data.
- A torn final append (Pi killed mid-write, so the last line has no newline) is ignored when reading and dropped before the next append, so it cannot hide earlier decisions or leave a truncated `resolved` label standing as the answer. Any newline-terminated unparsable line fails with an error naming the file and the line, so a damaged record is repaired, never guessed at.
- `decisions.jsonl` is authoritative. Before each append, any transition recorded there but missing from `decisions.status` (for example when the process died between the two writes) is re-emitted in order and without duplicates. Repair happens on the next append: reading the record alone does not rewrite the status file.

## Without a terminal

In print, JSON, or RPC mode, the tool asks nothing and records nothing. It returns
`{ status: "ask_in_chat", cards, prose }`, where `prose` is the decision block
exactly as `sq-ask.sh --render` prints it, so the decision can be asked in chat.
Closing the dialog with Esc returns the same request and leaves the decision open.

## Primary sessions only

Squad operators report decisions on their status channel. When the session
began with a Squad operator launch brief, the tool refuses and points the
operator to that channel.

## Usage

```bash
pi -e ./packages/pi-decisions
```

The package is private pending publication.

## Tests

```bash
npm test --workspace=@runecraft/pi-decisions
```

The tests check rendering against the standard's golden fixtures, drive the dialog
with keystrokes, and assert the records it writes. When a Squad checkout is found
(`$SQUAD_ROOT`, or `~/Projects/squad`), they also validate the recorded card
with `sq-ask.sh` and fold the status file with `sq-classify-lib.sh`.
`test/pi-lifecycle/surfaces.test.mjs` loads the package in a real Pi 1.4.0 process.
