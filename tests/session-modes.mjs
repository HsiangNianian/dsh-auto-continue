import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { makeHost, turnEnd, turnStart } from './host-fixture.mjs';

mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
const hosts = [];
const flush = async (ms = 20) => {
  mock.timers.tick(ms);
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const advance = async (ms) => { for (let i = 0; i < 10; i++) await flush(ms / 10); };
function host(options = {}) {
  const h = makeHost({ scanOnBoot: false, sessionModes: {}, ...options });
  h.provide('settings', {
    writable: true,
    async mutate(ns, ops) {
      assert.equal(ns, 'auto-continue');
      for (const op of ops) {
        assert.equal(op.op, 'set');
        assert.equal(op.path[0], 'sessionModes');
        h.config.sessionModes[op.path[1]] = op.value;
      }
    },
  });
  hosts.push(h);
  return h;
}
const setMode = async (h, sessionId, mode) => {
  assert.deepEqual(await h.postAction({ action: 'set-session-mode', sessionId, mode }), { ok: true, sessionId, mode });
};
const end = (h, agent, turn, kind) => {
  h.emit(agent, turnStart(turn));
  h.emit(agent, turnEnd(turn, kind, kind === 'error' ? { error: { message: 'read ECONNRESET' } } : {}));
};

try {
  const h = host();
  h.start();
  const a = h.agent('A'), b = h.agent('B'), c = h.agent('C'), d = h.agent('D');
  await setMode(h, 'A', 'loop');
  await setMode(h, 'B', 'recover');
  await setMode(h, 'C', 'off');
  for (const agent of [a, b, c, d]) end(h, agent, 1, 'completed');
  await flush();
  assert.deepEqual([a, b, c, d].map(agent => agent.followups.length), [1, 0, 0, 0]);
  for (const agent of [a, b, c, d]) end(h, agent, 2, 'error');
  await flush();
  assert.deepEqual([a, b, c, d].map(agent => agent.followups.length), [2, 1, 0, 1], 'recover and loop retry failures; off does nothing');
  h.config.resumeCompletedTurns = true;
  h.settingsChanged();
  for (const agent of [a, b, c, d]) end(h, agent, 3, 'completed');
  await flush();
  assert.deepEqual([a, b, c, d].map(agent => agent.followups.length), [3, 1, 0, 2], 'only inherited modes follow the new default');
  await setMode(h, 'B', 'default');
  end(h, b, 4, 'completed');
  await flush();
  assert.equal(b.followups.length, 2, 'returning to default follows the current profile setting');
  h.config.paused = true;
  h.settingsChanged();
  for (const agent of [a, b, c, d]) end(h, agent, 5, 'no-visible-output');
  await flush();
  assert.deepEqual([a, b, c, d].map(agent => agent.followups.length), [3, 2, 0, 2], 'global pause takes precedence');
  await h.postAction({ action: 'resume', sessionId: 'C' });
  assert.equal(c.followups.length, 1, 'manual Resume now remains an explicit one-off action');
  assert.equal(h.config.sessionModes.C, 'off');
  h.config.paused = false;
  h.settingsChanged();
  end(h, a, 6, 'completed');
  end(h, c, 6, 'max-tokens');
  await flush();
  assert.equal(a.followups.length, 4);
  assert.equal(c.followups.length, 1, 'unpausing preserves off');

  // Cancel work, rather than merely hiding it until the mode is re-enabled.
  for (const change of ['off', 'recover', 'global']) {
    const queued = host({ graceMs: 1000, sessionModes: { A: 'loop', B: 'loop' } });
    queued.start();
    const qa = queued.agent('A'), qb = queued.agent('B');
    end(queued, qa, 1, 'completed');
    end(queued, qb, 1, 'completed');
    if (change === 'global') {
      queued.config.paused = true;
      queued.settingsChanged();
      queued.config.paused = false;
      queued.settingsChanged();
    } else {
      await setMode(queued, 'A', change);
      await setMode(queued, 'A', 'loop');
    }
    await advance(2000);
    assert.equal(qa.followups.length, 0, `${change} cancels the pending send even after re-enabling`);
    assert.equal(qb.followups.length, change === 'global' ? 0 : 1, 'other sessions retain queued work');
  }

  const cooldown = host({ cooldownMs: 1000 });
  cooldown.start();
  const ca = cooldown.agent('cooldown');
  end(cooldown, ca, 1, 'error');
  await flush();
  end(cooldown, ca, 2, 'error');
  await setMode(cooldown, 'cooldown', 'off');
  await setMode(cooldown, 'cooldown', 'recover');
  await advance(5000);
  assert.equal(ca.followups.length, 1, 'off also cancels deferred recovery after cooldown');

  const guard = host({ loopGuard: true, loopRepeatText: 2, cooldownMs: 1000, sessionModes: { off: 'off' } });
  guard.start();
  let cancelled = 0;
  let loopCause;
  for (const id of ['off', 'on']) {
    const agent = guard.agent(id);
    agent.cancel = cause => { cancelled++; loopCause = cause; };
    guard.emit(agent, turnStart(1));
    for (let seq = 2; seq < 4; seq++) guard.emit(agent, {
      type: 'assistant/message', seq, time: Date.now(), data: {
        turn: 1, message: { role: 'assistant', content: [{ type: 'text', text: 'same answer' }] },
      },
    });
    if (id === 'off') assert.equal(cancelled, 0, 'off does not interrupt running turns');
  }
  assert.equal(cancelled, 1, 'the other session still has loop protection');
  const on = guard.agents.get('on');
  guard.emit(on, turnEnd(1, 'aborted', { reason: loopCause }));
  await setMode(guard, 'on', 'off');
  await setMode(guard, 'on', 'recover');
  await advance(5000);
  assert.equal(on.followups.length, 0, 'off cancels deferred loop-guard restarts');

  const boot = host({ scanOnBoot: true, sessionModes: { disabled: 'off', storedOff: 'off' } });
  const disabled = boot.agent('disabled', [turnEnd(1, 'interrupted')]);
  const enabled = boot.agent('enabled', [turnEnd(1, 'interrupted')]);
  let finishRead;
  const observed = [];
  boot.provide('sessionQuery', {
    listSessions: async () => ['storedOff', 'duringRead'].map(id => ({ header: { id }, live: false })),
    observeSession: async id => {
    observed.push(id);
    if (id === 'duringRead') await new Promise(resolve => { finishRead = resolve; });
    return { events: [turnEnd(1, 'interrupted')], header: { id } };
  } });
  boot.start();
  await flush();
  await flush();
  assert.equal(disabled.followups.length, 0);
  assert.equal(enabled.followups.length, 1);
  assert.deepEqual(observed, ['duringRead'], 'stored off sessions are not opened');
  await setMode(boot, 'duringRead', 'off');
  finishRead();
  await flush();
  assert.equal(boot.resumes().length, 0, 'disabling while a stored history is loading prevents materialization');

  const preset = host({ scanOnBoot: true });
  let finishPreset;
  preset.provide('sessionQuery', {
    listSessions: async () => [{ header: { id: 'stored' }, live: false }],
    observeSession: async () => ({ events: [turnEnd(1, 'interrupted')], header: { id: 'stored' } }),
  });
  preset.provide('agentPresets', { resolve: () => new Promise(resolve => { finishPreset = resolve; }) });
  preset.start();
  await flush();
  await flush();
  await setMode(preset, 'stored', 'off');
  finishPreset({ id: 'default' });
  await flush();
  assert.equal(preset.resumes().length, 0, 'mode is rechecked after async preset resolution');

  for (const payload of [
    { sessionId: '', mode: 'off' }, { sessionId: 'A', mode: 'invalid' },
    { sessionId: '__proto__', mode: 'off' }, { sessionId: 'constructor', mode: 'loop' },
    { sessionId: 'x'.repeat(257), mode: 'off' }, { sessionId: 123, mode: 'off' },
  ]) assert.equal((await h.postAction({ action: 'set-session-mode', ...payload })).ok, false);
  h.provide('settings', { writable: false, mutate() { assert.fail('read-only settings must not be written'); } });
  assert.equal((await h.postAction({ action: 'set-session-mode', sessionId: 'A', mode: 'off' })).ok, false);
  h.provide('settings', { writable: true, mutate() { throw new Error('disk write failed'); } });
  assert.equal((await h.postAction({ action: 'set-session-mode', sessionId: 'A', mode: 'off' })).ok, false);
  console.log('Session modes: isolation, defaults, pause priority, cancelled timers, loop guard, startup scans and rejected writes ✅');
} finally {
  for (const h of hosts) h.dispose();
  mock.timers.reset();
}
