// Real-Pi checks for @runecraft/pi-lane-router and @runecraft/pi-decisions: the packages
// load from their package roots, and their behavior reaches Pi's own session entries.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { requirePi } from './driver.mjs';

const binary = requirePi();
const root = fileURLToPath(new URL('../..', import.meta.url));
const fixture = fileURLToPath(new URL('./surfaces-fixture.ts', import.meta.url));
const OPERATOR_BRIEF = '\u2063SQUAD_OP: v1 launch-brief: You are an operator: an autonomous worker agent managed by Squad.';

async function run(scenario, { packages, model, tools, prompt, settled = 1 }) {
  const scratch = await mkdtemp(resolve('.pi-lifecycle-surfaces-'));
  const home = join(scratch, 'home');
  const agentDir = join(home, '.pi', 'agent');
  await mkdir(agentDir, { recursive: true });
  await writeFile(join(agentDir, 'settings.json'), JSON.stringify({ retry: { enabled: false } }));
  const configPath = join(scratch, 'pi-lane-router.json');
  await writeFile(configPath, JSON.stringify({ pairs: [{ id: 'duo', strong: 'surfaces-fake/strong', cheap: 'surfaces-fake/cheap' }] }));
  const decisionsDir = join(scratch, 'decisions');
  const trace = [];
  const rpc = [];
  let stderr = '';
  let failure;
  const updates = new EventEmitter();
  const child = spawn(binary, [
    '--mode', 'rpc', '--no-session', '--offline', '--no-extensions', '--no-mcp', '--no-skills',
    '--no-prompt-templates', '--no-themes', '--no-context-files', '--no-approve', '--no-builtin-tools',
    '--extension', fixture, ...packages.flatMap((p) => ['--extension', join(root, 'packages', p)]),
    '--model', model, '--tools', tools, '--system-prompt', 'Deterministic surfaces test.',
  ], {
    cwd: scratch,
    env: {
      PATH: process.env.PATH, HOME: home, XDG_CONFIG_HOME: join(home, '.config'), PI_CODING_AGENT_DIR: agentDir,
      PI_OFFLINE: '1', NO_COLOR: '1', PI_SURFACES_SCENARIO: scenario,
      PI_LANE_ROUTER_CONFIG: configPath, PI_DECISIONS_DIR: decisionsDir,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const exited = once(child, 'close');
  child.on('error', (error) => { failure = error; updates.emit('update'); });
  child.on('close', (code, signal) => { failure ||= new Error(`Pi exited: code=${code}, signal=${signal}\n${stderr}`); updates.emit('update'); });
  const watchdog = setTimeout(() => { failure = new Error(`Scenario ${scenario} timed out\n${stderr}\n${JSON.stringify(trace)}`); child.kill('SIGKILL'); }, 15000);
  const lines = (stream, callback) => {
    let pending = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      pending += chunk;
      let end;
      while ((end = pending.indexOf('\n')) !== -1) { callback(pending.slice(0, end)); pending = pending.slice(end + 1); }
      updates.emit('update');
    });
  };
  lines(child.stdout, (line) => { try { rpc.push(JSON.parse(line)); } catch { failure = new Error(`Non-JSON RPC output: ${line}`); } });
  lines(child.stderr, (line) => { if (line.startsWith('SURFACES ')) trace.push(JSON.parse(line.slice(9))); else stderr += `${line}\n`; });
  const until = async (predicate) => { while (!predicate()) { if (failure) throw failure; await once(updates, 'update'); } };
  let id = 0;
  const command = async (type, data = {}) => {
    const key = String(++id);
    child.stdin.write(`${JSON.stringify({ id: key, type, ...data })}\n`);
    await until(() => rpc.some((r) => r.type === 'response' && r.id === key));
    const response = rpc.find((r) => r.type === 'response' && r.id === key);
    assert.equal(response.success, true, JSON.stringify(response));
    return response.data;
  };
  try {
    await until(() => trace.some((t) => t.event === 'fixture.loaded'));
    await command('prompt', { message: prompt });
    await until(() => trace.filter((t) => t.event === 'agent_settled').length >= settled);
    const { entries } = await command('get_entries');
    assert.deepEqual(rpc.filter((r) => r.type === 'extension_error'), []);
    assert.equal(trace.some((t) => t.event === 'network.forbidden'), false);
    return { trace, rpc, entries, decisionsDir, stderr };
  } finally {
    clearTimeout(watchdog);
    child.kill('SIGKILL');
    await exited;
    await rm(scratch, { recursive: true, force: true });
  }
}

const requests = (r) => r.trace.filter((t) => t.event === 'provider.request').map((t) => t.model);
const custom = (r, type) => r.entries.filter((e) => e.type === 'custom' && e.customType === type).map((e) => e.data);

test('lane router: plans on strong, builds on cheap after the first write, and reports every turn', { timeout: 20000 }, async () => {
  const r = await run('switch', { packages: ['pi-lane-router'], model: 'lanes/duo', tools: 'write', prompt: 'Write the plan.' });
  assert.deepEqual(requests(r), ['surfaces-fake/strong', 'surfaces-fake/cheap']);
  assert.deepEqual(custom(r, 'lane-router.turn').map(({ turn, ...rest }) => rest), [
    { v: 1, pair: 'duo', phase: 'plan', lane: 'strong', model: 'surfaces-fake/strong', stopReason: 'toolUse',
      tokens: { input: 1000, output: 50, cacheRead: 0, cacheWrite: 0, total: 1050 },
      cost: { input: 0.015, output: 0.00375, cacheRead: 0, cacheWrite: 0, total: 0.01875 } },
    { v: 1, pair: 'duo', phase: 'build', lane: 'cheap', model: 'surfaces-fake/cheap', stopReason: 'stop',
      tokens: { input: 1000, output: 50, cacheRead: 0, cacheWrite: 0, total: 1050 },
      cost: { input: 0.0008, output: 0.0002, cacheRead: 0, cacheWrite: 0, total: 0.001 } },
  ]);
  // The phase is Pi router state on the session branch, not extension memory.
  assert.deepEqual(r.entries.filter((e) => e.type === 'custom' && e.customType === 'pi.virtual-model-state').map((e) => e.data.state),
    [{ phase: 'plan' }, { phase: 'build' }]);
});

test('lane router: cheap-lane quota exhaustion is reported and the task continues on the strong lane', { timeout: 20000 }, async () => {
  const r = await run('quota', { packages: ['pi-lane-router'], model: 'lanes/duo', tools: 'write', prompt: 'Write the plan.', settled: 2 });
  assert.deepEqual(requests(r), ['surfaces-fake/strong', 'surfaces-fake/cheap', 'surfaces-fake/strong']);
  const turns = custom(r, 'lane-router.turn');
  assert.deepEqual(turns.map((t) => [t.lane, t.stopReason]), [['strong', 'toolUse'], ['cheap', 'error'], ['strong', 'stop']]);
  assert.match(turns[1].error, /insufficient_quota/);
  assert.match(turns[2].fallback, /^cheap lane surfaces-fake\/cheap unavailable \(429 insufficient_quota.*continuing on strong lane surfaces-fake\/strong$/);
  assert.deepEqual(custom(r, 'lane-router.unavailable'), [{ pair: 'duo', model: 'surfaces-fake/cheap', reason: '429 insufficient_quota: You exceeded your current quota' }]);
  const fallback = r.entries.find((e) => e.type === 'custom_message' && e.customType === 'lane-router.fallback');
  assert.ok(fallback, 'the conversation says the cheap lane is unavailable');
  assert.ok(r.rpc.some((e) => e.type === 'extension_ui_request' && e.method === 'notify' && /cheap lane surfaces-fake\/cheap unavailable/.test(e.message)));
});

test('decisions: without a terminal, Pi gets a structured ask-in-chat request and nothing is recorded', { timeout: 20000 }, async () => {
  const r = await run('decisions', { packages: ['pi-decisions'], model: 'surfaces-fake/strong', tools: 'ask_decisions', prompt: 'Decide the merge.' });
  const result = r.trace.find((t) => t.event === 'tool_result' && t.toolName === 'ask_decisions');
  assert.equal(result.isError, false);
  assert.equal(result.details.status, 'ask_in_chat');
  assert.equal(result.details.reason, 'no_terminal');
  assert.equal(result.details.prose, [
    'D1 - Merge Strategy (ref: merge-strategy)',
    '  How should we merge the authentication fix PR?',
    '  O1 - Squash & Merge: Combine into one clean commit on main (recommended)',
    '  O2 - Rebase & Merge: Preserve both commits in history',
    '  O0 - Your own words',
  ].join('\n'));
  assert.equal(existsSync(join(r.decisionsDir, 'decisions.jsonl')), false);
});

test('decisions: a Squad operator session is refused', { timeout: 20000 }, async () => {
  const r = await run('operator', { packages: ['pi-decisions'], model: 'surfaces-fake/strong', tools: 'ask_decisions', prompt: OPERATOR_BRIEF });
  const result = r.trace.find((t) => t.event === 'tool_result' && t.toolName === 'ask_decisions');
  assert.deepEqual(result.details, { status: 'refused', reason: 'operator_session' });
});
