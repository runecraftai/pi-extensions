# Pi lifecycle regression harness

Run `npm run test:lifecycle` or the repository-wide `npm test`.

The harness requires **Pi 1.4.0** on `PATH`; it checks `pi --version` and fails
rather than skipping if Pi is missing or incompatible. Set `PI_LIFECYCLE_BIN`
to an explicit executable to test another installation of that same version.
CI installs the pinned Pi CLI before running `npm test`.

## What executes

`driver.mjs` launches the real Pi executable in RPC mode. `fixture.ts` registers
an in-process fake provider and a signal-aware, manually released tool. The
controller completes the background provider request only after the tool has
started. No sleep-based races are needed. Pi itself dispatches lifecycle hooks,
executes tools, aborts runs, compacts history, and processes continuations.
Tests assert ordered lifecycle traces, RPC compaction start/end records,
persisted entries, tool results, model-visible tool pairing, and provider calls.

Every scenario has a 15-second process watchdog and a 20-second test deadline.
Failure diagnostics include the scenario and its trace. The child is always
terminated and its sandbox removed. A normal run takes about four seconds on
the development machine.

The child receives an allowlisted environment, an isolated home and agent
configuration, and no inherited credentials. All generated files stay in a
`.pi-lifecycle-*` directory inside the worktree. Resource discovery, context
files, built-in tools, MCP, and online refresh are disabled. The provider never
opens a socket; network entry points throw if called. The literal
`not-a-real-credential` only satisfies Pi's authentication preflight; it cannot
authenticate to any service. Scenario I also registers a keyless fake provider.

## Scope and scenario authority

This slice does **not** install, vendor, or claim to validate the upstream
package. The fixture contains small, explicitly test-only policies reproducing
the recon's unsafe abort/apply/resume behavior, safe threshold handoff, busy
observer, guardrail, and resilience interaction. These are not the full Squad
extensions. S2 must connect the adapted implementation to these contracts;
external Squad integration belongs to later slices. Synthetic summaries prove
lifecycle mechanics, not summary fidelity.

Authority: the approved `recon-squad-async-compaction-2/report.md`, sections 2,
3, 6, and Appendix A. Its appendix omits D. The accepted clarification assigns
D to the model-settings defect in F9 (also summarized by executive finding F5).
`compaction.modelOverrides` configures token budgets, not a different model.

| Scenario | Contract |
| --- | --- |
| A | Unsafe async + resilience: tool aborted, manual handoff, two resumes. |
| B | Unsafe async alone: tool aborted, manual handoff, one `continue`. |
| C | Guardrail blocks the tool, aborts the run, compacts natively, stays idle. |
| D | Active-model override budgets reach `session_before_compact`; ready summary is consumed without synchronous fallback. |
| E | A plus busy observer: idle precedes manual compaction; no busy-compaction notification. |
| F | Native threshold: tool completes, native summaries run, busy-compaction notification appears. |
| G | Guardrail + resilience + observer: no tool execution, manual compaction invisible, no resume. |
| H | Actionable `turn_end`: tool completes, compaction entry persists, continuation runs, no session compaction hooks, resilience resumes. |
| I | Keyless background preflight fails; tool survives and native compaction succeeds. |
| J | Ready summary completes mid-tool, waits for native threshold, preserves the tool pair, emits busy-compaction, sends no `continue`. |

A/B/E deliberately assert the **observed unsafe behavior**, not its safety.
The separate J safety contract rejects exactly that behavior. Native compaction
makes two fake summary requests here because the tiny keep budget splits the
user-message span; ready-summary handoff makes none.

## Demonstrate that the safety net fails

The normal suite includes negative controls for both defects. These commands
also make the positive contracts fail, with a nonzero exit status:

```sh
PI_LIFECYCLE_MUTATION=abort node --test --test-name-pattern='^J: ' test/pi-lifecycle/lifecycle.test.mjs
PI_LIFECYCLE_MUTATION=settings node --test --test-name-pattern='^D: ' test/pi-lifecycle/lifecycle.test.mjs
```

The first invokes the real `ctx.abort()`, observes the tool's aborted signal,
and fails with `Safety violation: ctx.abort() called`. The second resolves
settings without the active model, observes `SETTINGS_CHANGED` and native
fallback requests, and fails the ready-summary contract. Neither command
loads upstream code or accesses a paid provider.
