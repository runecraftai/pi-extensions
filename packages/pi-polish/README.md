# @runecraft/pi-polish

Runecraft Polish makes a Squad operator's work legible in Pi: phased working
indicators, compact tool groups, and syntax-highlighted diffs. It changes
presentation, not tool execution.

## Use

Requires Pi 1.4 or later. From this monorepo, try both extension entry points
without installing the package or changing your Pi settings:

```bash
pi -e ./packages/pi-polish/extensions/tools.ts \
   -e ./packages/pi-polish/extensions/chrome.ts
```

## Rendering

- Consecutive shell commands, code blocks, reads, searches, directory listings,
  tool searches, and MCP calls fold into a summary. Live groups show the current
  call and latest output. Click a finished group to expand it, or use `ctrl+o`
  to expand all tool output.
- Edits and writes show colored diff bands, syntax highlighting, and changed-word
  highlights that follow your dark or light Pi theme.
- A pulsing dot marks running tools; failed tools retain an error marker.
- Submitted user messages have a `❯` marker; assistant replies have `●`.
- Tool guidelines encourage Pi's file tools so edits remain visible as diffs.

The orange working line keeps the phase, elapsed seconds, and output-token count:

```text
Working... Thinking… (2s · ↓ 0 tokens)
Working... Responding… (4s · ↓ 120 tokens)
Working... Running… (6s · ↓ 240 tokens)
```

Other phases include reading, editing, writing, searching, preparing a tool call,
starting a background job, calling an MCP tool, and waiting for an answer.
Streaming token counts are estimates until the assistant message finishes.
A completed turn leaves a dim duration and completion-time summary.

## Squad monitoring contract

Every active working line contains the exact ASCII token `Working...`. Squad's
legacy rendered-line matcher requires those three full stops, even though the
phase uses a Unicode ellipsis. This fallback supports submit acknowledgement
and away-mode delivery guards; Pi lifecycle records remain the modern worker
state source. A phase describing a question is not itself proof of idle state.

Polish never writes to the editor buffer, replaces the live editor, adds editor
padding, or draws a prompt into its content rows. An empty composer stays empty,
and typed, unsubmitted text stays pending. Existing editor customizations are
left intact. Markers apply only to submitted message history.

Message styling patches Pi's internal component rendering, so verify it when
upgrading Pi. Tool schemas, execution, and session contents are unchanged.

## Development

From the repository root:

```bash
npm install
npm test
npm run typecheck
```

Root `npm test` also runs the lifecycle harness; see
[`test/pi-lifecycle/README.md`](../../test/pi-lifecycle/README.md) for its pinned
Pi requirement and setup.

`test/compat.test.ts` exercises lifecycle rendering against Squad's actual busy
regex and a snapshot of its shell composer classifier. It also checks that no
editor-buffer writes occur. The package's identity guard checks its distributable
surfaces. No inherited test suite is shipped with this package.

## License

MIT. See [LICENSE](LICENSE).
