import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PI_VERSION = '1.4.0';
const fixture = fileURLToPath(new URL('./fixture.ts', import.meta.url));
const deadline = 15000;

// Deliberately allowlisted environment: no provider credentials or agent config leak.
function baseEnv(home, agentDir) {
  return {
    PATH: process.env.PATH, HOME: home, XDG_CONFIG_HOME: join(home, '.config'),
    PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: '1', NO_COLOR: '1',
  };
}

function probeVersion(binary) {
  const scratch = mkdtempSync(resolve('.pi-lifecycle-probe-'));
  try {
    const home = join(scratch, 'home');
    const agentDir = join(home, '.pi', 'agent');
    mkdirSync(agentDir, { recursive: true });
    const result = spawnSync(binary, ['--version'], {
      encoding: 'utf8', timeout: 5000, cwd: scratch, env: baseEnv(home, agentDir),
    });
    const lines = (result.stdout ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
    return {
      ok: !result.error && result.status === 0 && lines.at(-1) === PI_VERSION,
      // Scenarios spawn with the same isolated environment, so a version-only stdout here is what
      // proves the executable is concrete instead of a launcher that re-resolves and installs Pi.
      clean: lines.length === 1 && lines[0] === PI_VERSION,
      detail: result.error?.message || lines.join(' | ') || result.stderr?.trim() || `exit ${result.status}`,
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function resolveLauncher() {
  const which = spawnSync('mise', ['which', 'pi'], { encoding: 'utf8', timeout: 5000 });
  const candidate = (which.stdout ?? '').split('\n').map((line) => line.trim()).filter(Boolean).at(-1);
  if (which.error) return { detail: `\`mise which pi\` could not be queried (${which.error.message})` };
  if (which.status !== 0 || !candidate) {
    return { detail: `\`mise which pi\` resolved no Pi install (${which.stderr?.trim() || `exit ${which.status}`})` };
  }
  let target;
  try { target = realpathSync(candidate); } catch {
    return { detail: `\`mise which pi\` reported ${candidate}, which is not a resolvable file` };
  }
  const probe = probeVersion(target);
  if (probe.ok && probe.clean) return { target };
  return { detail: `the mise-managed candidate ${target} is not a concrete Pi ${PI_VERSION} executable (${probe.detail})` };
}

export function requirePi(binary = process.env.PI_LIFECYCLE_BIN) {
  if (!binary) {
    // Never fall back to a bare `pi` from PATH: that launcher may re-resolve and install Pi, which is
    // neither read-only nor guaranteed to land on the version the scenarios must use.
    const launcher = resolveLauncher();
    if (launcher.target) return launcher.target;
    throw new Error(`Lifecycle tests REQUIRE Pi ${PI_VERSION} and never execute a bare PATH \`pi\` launcher, ` +
      `which can re-resolve and install Pi over the network. ${launcher.detail}. Install Pi ${PI_VERSION} and ` +
      'set PI_LIFECYCLE_BIN to the concrete executable (`mise which pi`); tests never skip.');
  }
  if (!binary.includes('/')) {
    throw new Error(`Lifecycle tests REQUIRE Pi ${PI_VERSION} at a concrete executable path, not the bare name ` +
      `"${binary}", which would probe PATH and may run a launcher that installs Pi over the network. ` +
      'Set PI_LIFECYCLE_BIN to the path reported by `command -v pi` or `mise which pi`; tests never skip.');
  }
  const target = resolve(binary);
  const probe = probeVersion(target);
  if (!probe.ok) {
    throw new Error(`Lifecycle tests REQUIRE Pi ${PI_VERSION} at the PI_LIFECYCLE_BIN executable. ` +
      `Install that exact version; tests never skip. Got: ${probe.detail}`);
  }
  if (probe.clean) return target;
  throw new Error(`Lifecycle tests REQUIRE Pi ${PI_VERSION} as a concrete JSON-only RPC executable. ` +
    `${target} printed "${probe.detail}" under the harness's isolated environment, so it is a launcher whose ` +
    'preamble corrupts the RPC stream while it re-resolves Pi (network install). ' +
    `Set PI_LIFECYCLE_BIN to the concrete Pi ${PI_VERSION} executable (mise users: \`mise which pi\`); tests never skip.`);
}

export async function runScenario(binary, scenario, mutation) {
  // Keep every generated file inside the worktree, not the operator's ~/.pi.
  const scratch = await mkdtemp(resolve('.pi-lifecycle-'));
  const home = join(scratch, 'home');
  const agentDir = join(home, '.pi', 'agent');
  await mkdir(agentDir, { recursive: true });
  const override = scenario === 'D';
  await writeFile(join(agentDir, 'settings.json'), JSON.stringify({
    compaction: {
      enabled: true, reserveTokens: 100, keepRecentTokens: 1,
      ...(override ? { modelOverrides: { 'lifecycle-fake/scripted': { reserveTokens: 200, keepRecentTokens: 2 } } } : {}),
    }, retry: { enabled: false },
  }));
  const trace = [];
  const rpc = [];
  let stderr = '';
  let failure;
  const updates = new EventEmitter();
  const child = spawn(binary, [
    '--mode', 'rpc', '--no-session', '--offline', '--no-extensions', '--no-mcp',
    '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files',
    '--no-approve', '--no-builtin-tools', '--extension', fixture,
    '--provider', 'lifecycle-fake', '--model', 'scripted', '--tools', 'slow',
    '--system-prompt', 'Deterministic lifecycle test.',
  ], {
    cwd: scratch,
    env: {
      ...baseEnv(home, agentDir),
      PI_LIFECYCLE_SCENARIO: scenario, ...(mutation ? { PI_LIFECYCLE_MUTATION: mutation } : {}),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const exited = once(child, 'close');
  const diagnostic = () => `Scenario ${scenario}${mutation ? ` (${mutation})` : ''}: ${stderr}\n` +
    JSON.stringify(trace, null, 2);
  child.on('error', (error) => { failure = error; updates.emit('update'); });
  child.stdin.on('error', (error) => { failure ??= error; updates.emit('update'); });
  child.on('close', (code, signal) => {
    failure ||= new Error(`Pi exited unexpectedly: code=${code}, signal=${signal}`);
    updates.emit('update');
  });
  const watchdog = setTimeout(() => {
    failure = new Error(`Scenario exceeded ${deadline}ms. ${diagnostic()}`);
    child.kill('SIGKILL');
    updates.emit('update');
  }, deadline);
  function lines(stream, callback) {
    let pending = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      pending += chunk;
      let end;
      while ((end = pending.indexOf('\n')) !== -1) {
        callback(pending.slice(0, end).replace(/\r$/, ''));
        pending = pending.slice(end + 1);
      }
      updates.emit('update');
    });
  }
  lines(child.stdout, (line) => {
    try { rpc.push(JSON.parse(line)); } catch { failure = new Error(`Non-JSON RPC output: ${line}`); }
  });
  lines(child.stderr, (line) => {
    if (line.startsWith('LIFECYCLE ')) {
      trace.push(JSON.parse(line.slice('LIFECYCLE '.length)));
    } else stderr += `${line}\n`;
  });
  async function until(predicate) {
    while (!predicate()) {
      if (failure) throw failure;
      await once(updates, 'update');
    }
  }
  let id = 0;
  async function command(type, data = {}) {
    const key = String(++id);
    child.stdin.write(`${JSON.stringify({ id: key, type, ...data })}\n`);
    await until(() => rpc.some((record) => record.type === 'response' && record.id === key));
    const response = rpc.find((record) => record.type === 'response' && record.id === key);
    assert.equal(response.success, true, `${JSON.stringify(response)}\n${diagnostic()}`);
    return response.data;
  }
  const has = (event) => trace.some((record) => record.event === event);
  try {
    await until(() => has('fixture.loaded'));
    const loaded = trace.find((record) => record.event === 'fixture.loaded');
    // The fixture's modules must be the executable under test, not a resolved or hoisted copy.
    assert.deepEqual([loaded.piAiVersion, loaded.piCodingAgentVersion], [PI_VERSION, PI_VERSION],
      `Fixture Pi modules are not Pi ${PI_VERSION}: ${JSON.stringify(loaded)}`);
    const historyRepeats = ['A', 'B', 'E'].includes(scenario) || mutation === 'abort' ? 4200 : 3500;
    await command('prompt', { message: `History: ${'history '.repeat(historyRepeats)}` });
    await until(() => has('agent_settled'));
    await command('prompt', { message: '/harness-work' });
    trace.length = 0;
    rpc.length = 0;
    await command('prompt', { message: 'Run the controlled tool, then finish.' });
    if (['C', 'G'].includes(scenario)) {
      await until(() => has('session_compact'));
    } else {
      await until(() => has('tool.started'));
      if (!['F', 'I'].includes(scenario)) {
        await command('prompt', { message: '/harness-summary' });
        await until(() => has('summary.ready'));
      }
      if (scenario === 'I') await until(() => has('summary.failed'));
      if (['A', 'B', 'E'].includes(scenario) || mutation === 'abort') {
        await until(() => has('session_compact'));
      } else {
        await command('prompt', { message: '/harness-release' });
      }
    }
    // The legacy async continuation is scheduled after the manual compaction callback.
    if (['A', 'B', 'E'].includes(scenario) || mutation === 'abort') {
      await until(() => trace.some((record) => record.event === 'resume' && record.source === 'async'));
      await until(() => trace.filter((record) => record.event === 'agent_settled').length >= 2);
    } else {
      await until(() => has('agent_settled'));
    }
    await command('prompt', { message: '/harness-drain' });
    const messages = await command('get_messages');
    const entries = await command('get_entries');
    assert.equal(rpc.some((record) => record.type === 'extension_error'), false, JSON.stringify(rpc.filter((record) => record.type === 'extension_error')));
    assert.equal(has('fixture.error'), false, diagnostic());
    assert.equal(has('network.forbidden'), false, diagnostic());
    assert.ok(trace.filter((record) => record.event === 'provider.request')
      .every((record) => record.model === 'lifecycle-fake/scripted'), diagnostic());
    return { scenario, trace, rpc, messages: messages.messages, entries: entries.entries, diagnostic: diagnostic() };
  } catch (error) {
    error.message += `\n${diagnostic()}`;
    throw error;
  } finally {
    clearTimeout(watchdog);
    child.kill('SIGKILL');
    await exited;
    await rm(scratch, { recursive: true, force: true });
  }
}

export function assertToolIntact(result) {
  assert.equal(result.trace.some((record) => record.event === 'ctx.abort'), false, 'Safety violation: ctx.abort() called');
  const tool = result.trace.filter((record) => record.event === 'tool.finished');
  assert.equal(tool.length, 1, 'Expected exactly one real tool execution');
  assert.equal(tool[0].aborted, false, 'Safety violation: running tool was aborted');
}
