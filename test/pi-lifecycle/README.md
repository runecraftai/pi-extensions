# Pi lifecycle regression harness

Run `npm run test:lifecycle` or the repository-wide `npm test`.

The harness requires **Pi 1.4.0**; it resolves the binary from
`PI_LIFECYCLE_BIN` or the install managed by mise, then checks `pi --version`
and fails rather than skipping if Pi is missing or incompatible. It never probes
a bare `pi` from `PATH`, whose launcher can re-resolve and install Pi over the
network.

Pi is resolved through mise's read-only `mise which pi`, which returns the
install path rather than a launcher; that candidate is realpath-resolved and
validated under the harness's isolated environment before spawning, because a
launcher's stdout preamble would corrupt the RPC stream and, under the isolated
`HOME`, re-resolve and re-download Pi. When mise is absent or does not provide
Pi 1.4.0, set `PI_LIFECYCLE_BIN` to the concrete executable's path (`mise which
pi`, or the install path from a global npm/pnpm bin directory); a bare `pi` name
is rejected instead of being resolved through `PATH`, and a `PI_LIFECYCLE_BIN`
that behaves as a launcher is rejected rather than resolved. Version-manager
shims are not usable here: a mise shim is a symlink to the mise binary, so
`readlink -f "$(command -v pi)"` yields mise itself rather than the install it
manages.

Preflight regression tests cover a bare `PI_LIFECYCLE_BIN` name, a missing or
failing mise, and a wrong-version mise candidate: each fails with a diagnostic
while spawning no `pi` launcher and no mise command beyond the read-only `which
pi` query.

CI installs the pinned Pi CLI and exports it as `PI_LIFECYCLE_BIN` before
running `npm test`. Pi resolves extension
imports of `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent` to its
own bundled modules, so the fixture uses the same `SettingsManager` and stream
factory as Pi itself; each scenario asserts the loaded module versions equal the
preflighted binary version instead of relying on a hoisted copy.

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

`lifecycle.test.mjs` retains small, test-only policies reproducing the recon's
unsafe abort/apply/resume behavior, safe threshold handoff, busy observer,
guardrail, and resilience interaction. `package.test.mjs` runs A–J again with the
real `@runecraft/pi-async-compaction-lite` entrypoint, job state machine,
preparation, validation, settings resolver, and registry-backed summary path.
Neither suite loads the third-party package or the full Squad extensions.
External Squad integration belongs to later slices. Synthetic summaries prove
lifecycle mechanics, not summary fidelity.

For package runs, A/B/E now preserve the tool and perform native threshold
handoff, without an async continuation. H also uses native handoff rather than
the baseline actionable-boundary prototype; resilience remains a separate
policy. I injects a background provider failure through the fake transport and
proves native fallback. D asserts model budgets at preparation and at the native
hook, with zero synchronous fallback calls. The package emits its own `busy`
event on each handoff, independently of the threshold-only observer.

The harness invokes the registered `/async-compact-now` handler when the tool
starts, then releases the real summary request mid-tool. It sets the automatic
start ratio to 0.95 to avoid a job during history seeding. Automatic starts,
idle application, pending messages, invalidation, and timeouts have retained
package unit coverage. All calls use the real package; no production summary,
settings, or handoff implementation is replaced.

Authority: the approved `recon-squad-async-compaction-2/report.md`, sections 2,
3, 6, and Appendix A. Its appendix omits D. The accepted clarification assigns
D to the model-settings defect in F9 (also summarized by executive finding F5).
`compaction.modelOverrides` configures token budgets, not a different model.

Baseline (`lifecycle.test.mjs`) contracts. `package.test.mjs` deviations for
A/B/E/H are described above.

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

The baseline A/B/E deliberately assert the **observed unsafe behavior**, not
its safety; the package A/B/E assert that the tool survives. The J safety
contract rejects exactly that behavior in both suites. Native compaction
makes two fake summary requests here because the tiny keep budget splits the
user-message span; ready-summary handoff makes none.

## Demonstrate that the safety net fails

The normal suite includes negative controls for both defects. These commands
also make the positive contracts fail, with a nonzero exit status:

```sh
PI_LIFECYCLE_MUTATION=abort node --test --test-name-pattern='^J: ' test/pi-lifecycle/lifecycle.test.mjs
PI_LIFECYCLE_MUTATION=abort node --test --test-name-pattern='^package J:' test/pi-lifecycle/package.test.mjs
PI_LIFECYCLE_MUTATION=settings node --test --test-name-pattern='^D: ' test/pi-lifecycle/lifecycle.test.mjs
```

The first invokes the real `ctx.abort()`, observes the tool's aborted signal,
and fails with `Safety violation: ctx.abort() called`. The second makes this
package call the same real `ctx.abort()` on a ready summary and fails the same
safety contract. The third resolves settings without the active model, observes
`SETTINGS_CHANGED` and native fallback requests, and fails the ready-summary
contract. None of these commands loads upstream code or accesses a paid
provider.
