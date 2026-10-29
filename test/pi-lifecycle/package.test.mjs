import assert from 'node:assert/strict';
import test from 'node:test';
import { assertToolIntact, requirePi, runScenario } from './driver.mjs';

const binary = requirePi();
const events = (r, name) => r.trace.filter(e => e.event === name);
const requests = (r, kind) => events(r, 'provider.request').filter(e => e.kind === kind);
for (const scenario of 'ABCDEFGHIJ') {
  test(`package ${scenario}: safe real-Pi lifecycle`, { timeout: 20000 }, async () => {
    const r = await runScenario(binary, scenario, scenario === 'J' ? process.env.PI_LIFECYCLE_MUTATION : undefined, 'package');
    assert.deepEqual(events(r, 'package.context_missing'), [], r.diagnostic);
    const guardrail = ['C', 'G'].includes(scenario);
    const handoff = !guardrail && !['F', 'I'].includes(scenario);
    if (!guardrail) assertToolIntact(r);
    assert.equal(events(r, 'ctx.abort').length, 0, r.diagnostic);
    assert.equal(events(r, 'resume').some(e => e.source === 'async'), false);
    assert.equal(r.entries.some(e => e.type === 'message' && e.message.role === 'user' &&
      JSON.stringify(e.message.content) === '[{"type":"text","text":"continue"}]'), false);
    assert.equal(r.entries.filter(e => e.type === 'compaction').length, 1, r.diagnostic);
    assert.equal(events(r, 'session_before_compact')[0].reason, guardrail ? 'manual' : 'threshold');
    assert.equal(events(r, 'session_compact')[0].fromExtension, handoff, r.diagnostic);
    assert.equal(requests(r, 'native-summary').length, handoff ? 0 : 2, r.diagnostic);
    assert.equal(events(r, 'summary.handed_off').length, handoff ? 1 : 0);
    if (handoff) {
      assert.equal(events(r, 'summary.ready')[0].idle, false);
      assert.equal(events(r, 'package.busy').length, 1);
      assert.deepEqual(
        [events(r, 'package.busy')[0].state, events(r, 'package.busy')[0].activity],
        ['busy', 'compaction']);
      assert.ok(r.trace.findIndex(e => e.event === 'tool.finished') <
        r.trace.findIndex(e => e.event === 'summary.handed_off'));
      for (const request of requests(r, 'agent')) {
        assert.deepEqual(request.messages.flatMap(m => m.toolCalls),
          request.messages.filter(m => m.role === 'toolResult').map(m => m.toolCallId));
      }
    }
    if (scenario === 'D') {
      assert.deepEqual(events(r, 'session_before_compact')[0].settings,
        { enabled: true, reserveTokens: 200, keepRecentTokens: 2 });
      assert.deepEqual(events(r, 'summary.started')[0].settings, events(r, 'session_before_compact')[0].settings);
      assert.equal(events(r, 'summary.invalidated').length, 0);
      assert.equal(requests(r, 'native-summary').length, 0);
    }
    if (scenario === 'I') assert.match(events(r, 'summary.failed')[0].error, /Synthetic background provider failure/);
  });
}

test('package negative control: a real mid-tool abort is rejected by the safety contract', { timeout: 20000 }, async () => {
  const r = await runScenario(binary, 'J', 'abort', 'package');
  assert.equal(events(r, 'tool.finished')[0].aborted, true, r.diagnostic);
  assert.throws(() => assertToolIntact(r), /Safety violation: ctx.abort\(\) called/);
});
