import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import test from 'node:test';
import { assertToolIntact, PI_VERSION, requirePi, runScenario } from './driver.mjs';

const binary = requirePi(); // Missing/wrong Pi is a hard failure, never a skip.
const options = { timeout: 20000 };
const records = (result, event) => result.trace.filter((record) => record.event === event);
const countRequests = (result, kind) => records(result, 'provider.request').filter((record) => record.kind === kind).length;
const resumes = (result) => records(result, 'resume').map((record) => record.source);
const lifecycleEvents = new Set([
  'agent_start', 'turn_start', 'tool.started', 'tool.finished', 'tool_result', 'turn_end',
  'agent_end', 'agent_before_settle', 'agent_settled', 'summary.started', 'summary.ready',
  'summary.failed', 'summary.handed_off', 'summary.invalidated', 'ctx.abort',
  'session_before_compact', 'session_compact', 'guardrail.blocked', 'boundary.compaction', 'resume',
]);
function sequence(result, expected) {
  assert.deepEqual(result.trace.filter((record) => lifecycleEvents.has(record.event)).map((record) => record.event),
    expected, result.diagnostic);
}
const start = ['agent_start', 'turn_start', 'tool.started'];
const summary = ['summary.started', 'summary.ready'];
const toolEnd = ['tool.finished', 'tool_result', 'turn_end'];
const finish = ['turn_start', 'turn_end', 'agent_end', 'agent_before_settle', 'agent_settled'];
const continued = ['agent_start', 'turn_start', 'turn_end', 'agent_end', 'agent_before_settle'];
const legacy = [...start, ...summary, 'ctx.abort', ...toolEnd, 'turn_start', 'turn_end', 'agent_end', 'agent_settled',
  'session_before_compact', 'summary.handed_off', 'session_compact', 'resume'];
const safe = [...start, ...summary, ...toolEnd, 'session_before_compact', 'summary.handed_off', 'session_compact', ...finish];
const blocked = ['agent_start', 'turn_start', 'guardrail.blocked', 'turn_end', 'turn_start', 'turn_end',
  'agent_end', 'agent_settled', 'session_before_compact', 'session_compact'];

function compaction(result, reason, fromExtension) {
  assert.deepEqual(records(result, 'session_before_compact').map((event) => event.reason), [reason]);
  assert.deepEqual(records(result, 'session_compact').map((event) => event.fromExtension), [fromExtension]);
  assert.equal(result.entries.filter((entry) => entry.type === 'compaction').length, 1);
  const events = result.rpc.filter((event) => ['compaction_start', 'compaction_end'].includes(event.type));
  assert.deepEqual(events.map((event) => [event.type, event.reason]), [
    ['compaction_start', reason], ['compaction_end', reason],
  ]);
  assert.equal(events[1].aborted, false);
  assert.equal(typeof events[1].result?.summary, 'string');
  assert.equal(events[1].errorMessage, undefined);
}
function toolResult(result, isError) {
  const events = result.rpc.filter((event) => event.type === 'tool_execution_end');
  assert.equal(events.length, 1);
  assert.equal(events[0].toolCallId, 'slow-1');
  assert.equal(events[0].isError, isError);
  const persisted = result.entries.filter((entry) => entry.type === 'message' && entry.message.role === 'toolResult');
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].message.toolCallId, 'slow-1');
  assert.equal(persisted[0].message.isError, isError);
}
function midTurn(result) {
  assert.equal(records(result, 'summary.started')[0].idle, false);
  assert.equal(records(result, 'summary.ready')[0].idle, false);
}
function legacyAbort(result) {
  midTurn(result);
  assert.equal(records(result, 'ctx.abort').length, 1);
  assert.deepEqual(records(result, 'tool.finished').map((event) => event.aborted), [true]);
  assert.throws(() => assertToolIntact(result), /Safety violation: ctx.abort\(\) called/);
  assert.deepEqual(result.rpc.filter((event) => event.type === 'agent_settled').map((event) => event.aborted), [true, false]);
  toolResult(result, true);
  compaction(result, 'manual', true);
  assert.equal(countRequests(result, 'native-summary'), 0);
  assert.equal(result.entries.some((entry) => entry.type === 'message' && entry.message.role === 'assistant' && entry.message.stopReason === 'error'), true);
}
function readyHandoff(result) {
  assertToolIntact(result);
  midTurn(result);
  assert.equal(records(result, 'summary.invalidated').length, 0, 'Ready summary invalidated: SETTINGS_CHANGED');
  assert.equal(records(result, 'summary.handed_off').length, 1, 'Ready summary was not handed off');
  assert.equal(countRequests(result, 'background'), 1);
  assert.equal(countRequests(result, 'native-summary'), 0, 'Unexpected synchronous fallback summary request');
  assert.equal(countRequests(result, 'agent'), 2);
  assert.deepEqual(resumes(result), []);
  compaction(result, 'threshold', true);
  toolResult(result, false);
  const followup = records(result, 'provider.request').filter((record) => record.kind === 'agent').at(-1);
  const modelVisible = followup.messages.find((message) => message.role === 'user');
  assert.equal(modelVisible.text.includes('Synthetic summary.'), true,
    'Handed-off summary missing from the post-compaction model projection');
  // Prove tool-call/result pairing in the model-visible projection, not just raw history.
  for (const request of records(result, 'provider.request').filter((record) => record.kind === 'agent')) {
    const calls = request.messages.flatMap((message) => message.toolCalls);
    const results = request.messages.filter((message) => message.role === 'toolResult').map((message) => message.toolCallId);
    assert.deepEqual(calls, results);
  }
}
function visibility(result, expected) {
  assert.deepEqual(records(result, 'busy').map((event) => `${event.state}:${event.activity}`), expected);
}

test('A: legacy async + resilience aborts a real tool and resumes twice', options, async () => {
  const result = await runScenario(binary, 'A');
  sequence(result, [...legacy, ...continued, 'resume', ...continued, 'agent_settled']);
  legacyAbort(result);
  assert.deepEqual(resumes(result), ['async', 'resilience']);
  assert.equal(countRequests(result, 'agent'), 3);
  const injected = result.entries.filter((entry) => entry.type === 'message' && entry.message.role === 'user')
    .map((entry) => JSON.stringify(entry.message.content));
  assert.equal(injected.filter((text) => text.includes('continue')).length, 1);
  assert.equal(injected.filter((text) => text.includes('Context was compacted')).length, 1);
});

test('B: legacy async alone aborts a real tool and resumes once', options, async () => {
  const result = await runScenario(binary, 'B');
  sequence(result, [...legacy, ...continued, 'agent_settled']);
  legacyAbort(result);
  assert.deepEqual(resumes(result), ['async']);
  assert.equal(countRequests(result, 'agent'), 2);
});

test('C: guardrail blocks tool execution, aborts the run, compacts manually, and stays idle', options, async () => {
  const result = await runScenario(binary, 'C');
  sequence(result, blocked);
  assert.ok(records(result, 'guardrail.blocked')[0].percent >= 70);
  assert.ok(records(result, 'guardrail.blocked')[0].percent < 80);
  compaction(result, 'manual', false);
  assert.deepEqual(records(result, 'tool.started'), []);
  assert.deepEqual(records(result, 'tool.finished'), []);
  toolResult(result, true);
  assert.deepEqual(resumes(result), []);
  assert.equal(countRequests(result, 'native-summary'), 2);
  assert.deepEqual(result.rpc.filter((event) => event.type === 'agent_settled').map((event) => event.aborted), [true]);
});

test('D: active-model token overrides survive ready-summary handoff without synchronous fallback', options, async () => {
  // Recon F9 (executive F5): getCompactionSettings() omitted the active model argument.
  const result = await runScenario(binary, 'D', process.env.PI_LIFECYCLE_MUTATION);
  const effective = records(result, 'session_before_compact')[0].settings;
  assert.deepEqual(effective, { enabled: true, reserveTokens: 200, keepRecentTokens: 2 });
  readyHandoff(result);
  sequence(result, safe);
});

test('E: manual legacy handoff is invisible to the threshold-only busy observer', options, async () => {
  const result = await runScenario(binary, 'E');
  sequence(result, [...legacy, ...continued, 'resume', ...continued, 'agent_settled']);
  legacyAbort(result);
  assert.deepEqual(resumes(result), ['async', 'resilience']);
  visibility(result, ['busy:agent-start', 'idle:agent-settled', 'busy:agent-start', 'busy:agent-start', 'idle:agent-settled']);
  assert.ok(result.trace.findIndex((event) => event.event === 'agent_settled') <
    result.trace.findIndex((event) => event.event === 'session_before_compact'));
});

test('F: native threshold compaction finishes the tool and emits busy compaction', options, async () => {
  const result = await runScenario(binary, 'F');
  sequence(result, [...start, ...toolEnd, 'session_before_compact', 'session_compact', ...finish]);
  assertToolIntact(result);
  toolResult(result, false);
  compaction(result, 'threshold', false);
  assert.equal(countRequests(result, 'native-summary'), 2);
  assert.deepEqual(resumes(result), []);
  visibility(result, ['busy:agent-start', 'busy:compaction', 'idle:agent-settled']);
});

test('G: guardrail + resilience leaves manual compaction invisible and does not resume', options, async () => {
  const result = await runScenario(binary, 'G');
  sequence(result, blocked);
  assert.ok(records(result, 'guardrail.blocked')[0].percent >= 70);
  assert.ok(records(result, 'guardrail.blocked')[0].percent < 80);
  compaction(result, 'manual', false);
  assert.deepEqual(records(result, 'tool.started'), []);
  assert.deepEqual(records(result, 'tool.finished'), []);
  toolResult(result, true);
  assert.deepEqual(resumes(result), []);
  visibility(result, ['busy:agent-start', 'idle:agent-settled']);
});

test('H: actionable turn boundary compacts without session compaction hooks; resilience still resumes', options, async () => {
  const result = await runScenario(binary, 'H');
  sequence(result, [...start, ...summary, ...toolEnd, 'boundary.compaction', ...finish.slice(0, -1),
    'resume', ...continued, 'agent_settled']);
  assertToolIntact(result);
  toolResult(result, false);
  assert.equal(result.entries.filter((entry) => entry.type === 'compaction').length, 1);
  assert.deepEqual(records(result, 'session_before_compact'), []);
  assert.deepEqual(records(result, 'session_compact'), []);
  assert.deepEqual(result.rpc.filter((event) => event.type.startsWith('compaction_')), []);
  assert.deepEqual(resumes(result), ['resilience']);
  assert.equal(countRequests(result, 'agent'), 3);
  assert.equal(countRequests(result, 'native-summary'), 0);
});

test('I: keyless-summary preflight fails safely and Pi falls back to native compaction', options, async () => {
  const result = await runScenario(binary, 'I');
  sequence(result, [...start, 'summary.started', 'summary.failed', ...toolEnd,
    'session_before_compact', 'session_compact', ...finish]);
  assert.match(records(result, 'summary.failed')[0].error, /No API key or headers/);
  assertToolIntact(result);
  toolResult(result, false);
  compaction(result, 'threshold', false);
  assert.equal(countRequests(result, 'background'), 0);
  assert.equal(countRequests(result, 'native-summary'), 2);
  assert.deepEqual(resumes(result), []);
});

test('J: ready summary waits for native threshold; tool intact, busy visible, no continue', options, async () => {
  const result = await runScenario(binary, 'J', process.env.PI_LIFECYCLE_MUTATION);
  readyHandoff(result);
  sequence(result, safe);
  visibility(result, ['busy:agent-start', 'busy:compaction', 'idle:agent-settled']);
});

test('D negative control: legacy model-less resolver triggers SETTINGS_CHANGED and native fallback', options, async () => {
  const result = await runScenario(binary, 'D', 'settings');
  sequence(result, [...start, ...summary, ...toolEnd, 'session_before_compact', 'summary.invalidated', 'session_compact', ...finish]);
  assert.deepEqual(records(result, 'summary.started')[0].settings, { enabled: true, reserveTokens: 100, keepRecentTokens: 1 });
  assert.deepEqual(records(result, 'session_before_compact')[0].settings, { enabled: true, reserveTokens: 200, keepRecentTokens: 2 });
  assert.deepEqual(records(result, 'summary.invalidated').map((event) => event.reason), ['SETTINGS_CHANGED']);
  assert.throws(() => readyHandoff(result), /Ready summary invalidated: SETTINGS_CHANGED/);
  compaction(result, 'threshold', false);
  assert.equal(countRequests(result, 'native-summary'), 2);
  assertToolIntact(result);
});

test('J negative control: the safety assertion detects the real ctx.abort call and tool signal', options, async () => {
  const result = await runScenario(binary, 'J', 'abort');
  sequence(result, [...legacy, ...continued, 'agent_settled']);
  legacyAbort(result);
  assert.throws(() => readyHandoff(result), /Safety violation: ctx.abort\(\) called/);
});

test('version preflight fails loudly for missing and incompatible Pi', () => {
  assert.throws(() => requirePi('/nonexistent/pi-lifecycle-binary'), /REQUIRE Pi 1\.4\.0.*never skip/);
  assert.throws(() => requirePi(process.execPath), /REQUIRE Pi 1\.4\.0.*never skip/);
});

test('version preflight accepts a concrete executable and rejects a preamble launcher', async () => {
  const scratch = await mkdtemp(resolve('.pi-lifecycle-probe-'));
  try {
    const concrete = join(scratch, 'pi-concrete');
    await writeFile(concrete, `#!/bin/sh\necho ${PI_VERSION}\n`, { mode: 0o755 });
    assert.equal(requirePi(concrete), resolve(concrete));
    assert.equal(requirePi(relative(process.cwd(), concrete)), resolve(concrete));

    // Same version, but announced behind a launcher preamble: unusable for RPC.
    const wrapper = join(scratch, 'pi-wrapper');
    await writeFile(wrapper, `#!/bin/sh\necho "launcher: pinned ${PI_VERSION}"\necho ${PI_VERSION}\n`, { mode: 0o755 });
    let error;
    try { requirePi(wrapper); } catch (failure) { error = failure; }
    assert.ok(error, 'preamble launcher was accepted as the RPC binary');
    assert.match(error.message, /PI_LIFECYCLE_BIN/);
    assert.match(error.message, /launcher/);
    assert.doesNotMatch(error.message, /Install that exact version/);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test('version preflight resolves a launcher to the concrete executable mise manages', async () => {
  const scratch = await mkdtemp(resolve('.pi-lifecycle-probe-'));
  const path = process.env.PATH;
  const explicit = process.env.PI_LIFECYCLE_BIN;
  const agentDir = process.env.PI_CODING_AGENT_DIR;
  try {
    const concrete = join(scratch, 'pi-concrete');
    await writeFile(concrete, `#!/bin/sh\necho ${PI_VERSION}\n`, { mode: 0o755 });
    await writeFile(join(scratch, 'mise'), `#!/bin/sh\necho "${concrete}"\n`, { mode: 0o755 });
    // This launcher looks clean under the operator environment and noisy under the isolated one,
    // so classifying it by a single operator-environment probe hands the harness a broken RPC pipe.
    await writeFile(join(scratch, 'pi'),
      `#!/bin/sh\n[ -z "$PI_CODING_AGENT_DIR" ] || echo "launcher: pinned ${PI_VERSION}"\nexec "${concrete}" "$@"\n`,
      { mode: 0o755 });
    process.env.PATH = `${scratch}:${path}`;
    delete process.env.PI_LIFECYCLE_BIN;
    delete process.env.PI_CODING_AGENT_DIR;
    assert.equal(requirePi(), realpathSync(concrete));
  } finally {
    process.env.PATH = path;
    if (explicit !== undefined) process.env.PI_LIFECYCLE_BIN = explicit;
    if (agentDir !== undefined) process.env.PI_CODING_AGENT_DIR = agentDir;
    await rm(scratch, { recursive: true, force: true });
  }
});

test('version preflight never executes the PATH pi launcher when resolution fails', async () => {
  const scratch = await mkdtemp(resolve('.pi-lifecycle-probe-'));
  const path = process.env.PATH;
  const explicit = process.env.PI_LIFECYCLE_BIN;
  const agentDir = process.env.PI_CODING_AGENT_DIR;
  const marker = join(scratch, 'launcher-invocations');
  const rejection = () => {
    try { requirePi(); } catch (error) { return error; }
    assert.fail('PATH launcher accepted as the RPC binary');
  };
  const launcherRan = async () => {
    try { return `PATH pi launcher executed: ${await readFile(marker, 'utf8')}`; } catch { return false; }
  };
  try {
    const bare = join(scratch, 'bare');
    await mkdir(bare, { recursive: true });
    const stale = join(scratch, 'pi-stale');
    await writeFile(stale, '#!/bin/sh\necho 1.5.0\n', { mode: 0o755 });
    // Any execution - version probe or RPC spawn - records the invocation.
    await writeFile(join(scratch, 'pi'),
      `#!/bin/sh\necho "$@" >> "${marker}"\necho ${PI_VERSION}\n`, { mode: 0o755 });
    delete process.env.PI_LIFECYCLE_BIN;
    delete process.env.PI_CODING_AGENT_DIR;

    // No `mise` on PATH: the launcher must not be probed in its place.
    process.env.PATH = scratch;
    const noMise = rejection();
    assert.match(noMise.message, /never execute a bare PATH `pi` launcher/);
    assert.match(noMise.message, /mise which pi/);
    assert.match(noMise.message, /PI_LIFECYCLE_BIN/);
    assert.equal(await launcherRan(), false);

    // Neither `mise` nor `pi` on PATH: still a clear diagnostic, never a skip.
    process.env.PATH = bare;
    assert.match(rejection().message, /PI_LIFECYCLE_BIN/);
    assert.equal(await launcherRan(), false);

    // `mise` resolves a concrete Pi of the wrong version: report that candidate, not a PATH probe.
    await writeFile(join(scratch, 'mise'), `#!/bin/sh\necho "${stale}"\n`, { mode: 0o755 });
    process.env.PATH = scratch;
    const wrongVersion = rejection();
    assert.match(wrongVersion.message, /mise-managed candidate/);
    assert.match(wrongVersion.message, /1\.5\.0/);
    assert.match(wrongVersion.message, /PI_LIFECYCLE_BIN/);
    assert.equal(await launcherRan(), false);
  } finally {
    process.env.PATH = path;
    if (explicit !== undefined) process.env.PI_LIFECYCLE_BIN = explicit;
    if (agentDir !== undefined) process.env.PI_CODING_AGENT_DIR = agentDir;
    await rm(scratch, { recursive: true, force: true });
  }
});
