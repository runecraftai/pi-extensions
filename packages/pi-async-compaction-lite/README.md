# Runecraft async compaction lite

Precompute compaction summaries while Pi works, without interrupting tools.
Supports **Pi 1.4.x** and rejects other host versions when loaded. This package
is private pending a separate publication decision.

## Load locally

From the monorepo root, after `npm ci`:

```sh
pi -e ./packages/pi-async-compaction-lite
```

No global settings are changed by this invocation. Don't load another async
compaction implementation in the same session.

## Behavior

- At `turn_end`, start one background summary when context is above the start
  ratio but below Pi's native compaction threshold.
- If the summary finishes during a turn, retain it. Never abort the turn, force
  a checkpoint, or inject a continuation message.
- At `session_before_compact`, validate the ready summary and hand it to Pi.
  Native threshold compaction can consume it without another summary request.
- If Pi is idle and has no queued messages, a ready summary may also trigger
  idle compaction. `/async-compact-now` starts preparation early; it does not
  interrupt a busy turn.
- Model, thinking, branch, session, or token-budget changes invalidate a result.
  Custom compaction instructions use Pi's normal compaction instead. Failed,
  timed-out, or pending summaries leave native compaction available. Histories
  containing Pi context edits always use native compaction; raw superseded text
  is never summarized by this package.

Summary generation uses Pi's compaction implementation and the active model's
registry transport. Pi owns authentication and routing; this package never
extracts credentials, adds endpoints, registers providers, or opens sockets.
With a remote model, Pi's normal provider still makes model requests and uses
quota. The package does not make that work free or offline.

## Settings

Pi's `compaction.enabled`, `reserveTokens`, `keepRecentTokens`, and matching
`compaction.modelOverrides["provider/modelId"]` apply. Project trust is respected.

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `PI_ASYNC_PREFIX_COMPACTION` | enabled | Set to `0` to disable preparation. |
| `PI_ASYNC_PREFIX_COMPACTION_START_RATIO` | `0.8` | Fraction of the context window that starts background work. Clamped to 0–1. |
| `PI_ASYNC_PREFIX_COMPACTION_TIMEOUT_MS` | `300000` | Background deadline; `0` disables the timeout. |

A start ratio at or above the native threshold leaves no automatic start window.
An earlier guardrail may also prevent preparation; configuring that guardrail is
outside this package. No operator settings or quota pilot are part of this slice.

## Extension events

Listen through `pi.events.on(...)`:

- `runecraft:async-compaction`: `started`, `ready`, `handed_off`, `invalidated`,
  and `failed`, with adapter/job correlation and timing information.
- `busy`: emitted when a validated summary is handed off, including manual idle
  handoffs. Payload: `{ state: "busy", activity: "compaction", source:
  "runecraft-async-compaction", jobId, reason }`.

The busy event marks the handoff, not successful persistence. Pi's
`session_compact` and `session_compact_failed` are the terminal signals. This
package does not write Squad state or emit idle on behalf of an agent.

The `./core` export supports local adapters through `registerAsyncCompaction`.
Adapters obey the same no-interruption lifecycle and host-version guard.

## Verify

From the monorepo root:

```sh
npm run build
npm run typecheck
npm run lint
npm test
npm run test:release
```

The package's lint command uses TypeScript's unused-local and unused-parameter
checks. The build emits `dist/` for verification; Pi and the tarball load the
TypeScript sources directly. Tests retain preparation, validation, replacement,
and failure coverage, and run the real-Pi A–J lifecycle integration without
network access. See [the lifecycle harness](../../test/pi-lifecycle/README.md).
Synthetic summaries verify mechanics, not real-model summary fidelity.
