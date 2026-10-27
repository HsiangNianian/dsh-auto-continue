import assert from 'node:assert/strict';
import test from 'node:test';
import { makeHost, turnEnd, turnStart } from './host-fixture.mjs';

const promptError = 'prompt variable "{{model}}" has no value for this assembly (section "deployment:persona-prefix")';
const failure = (turn, message = 'network timeout') => turnEnd(turn, 'error', { error: { code: 'UNKNOWN', message } });
const step = turn => ({ type: 'step/start', seq: turn * 10 - 8, time: Date.now(), data: { turn, step: 1 } });
const maintenance = (turn, kind = 'completed') => [
  { ...turnStart(turn), data: { turn, reason: 'message-ops' } },
  step(turn),
  { type: 'system/message', seq: turn * 10 - 7, time: Date.now(), data: { turn, step: 1, message: { role: 'system', content: [{ type: 'text', text: '[消息回滚]' }] } } },
  { type: 'step/end', seq: turn * 10 - 6, time: Date.now(), data: { turn, step: 1 } },
  kind === 'error' ? failure(turn) : turnEnd(turn, kind),
];

function scenario(t, config = {}) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
  const host = makeHost({ scanOnBoot: false, ...config });
  t.after(() => host.dispose());
  const tick = async (ms = 20) => {
    t.mock.timers.tick(ms);
    for (let i = 0; i < 400; i++) {
      t.mock.timers.tick(0);
      await Promise.resolve();
    }
  };
  const emit = (agent, events) => { for (const event of events) host.emit(agent, event); };
  return { host, tick, emit };
}

for (const resumeCompletedTurns of [false, true]) {
  test(`maintenance turns never trigger recovery or looping (loop=${resumeCompletedTurns})`, async t => {
    const { host, tick, emit } = scenario(t, { resumeCompletedTurns });
    host.start();
    for (const kind of ['completed', 'no-visible-output', 'error', 'max-tokens', 'interrupted']) {
      const agent = host.agent(kind);
      emit(agent, maintenance(1, kind));
      await tick();
      assert.equal(agent.followups.length, 0, kind);
      emit(agent, [turnStart(2), step(2), turnEnd(2, 'completed')]);
      await tick();
      assert.equal(agent.followups.length, 1, 'the next real silent turn still recovers');
    }
  });
}

test('rollback cancels a pending send and does not replenish the failure budget or count as recovery', async t => {
  const { host, tick, emit } = scenario(t, { maxConsecutive: 1 });
  host.start();
  const queued = host.agent('queued');
  emit(queued, [turnStart(1), failure(1)]);
  emit(queued, maintenance(2));
  await tick();
  assert.equal(queued.followups.length, 0, 'the pre-rollback send was cancelled');

  const capped = host.agent('capped');
  emit(capped, [turnStart(1), failure(1)]);
  await tick();
  const stats = host.stats();
  emit(capped, maintenance(2));
  await tick();
  assert.deepEqual(host.stats(), stats, 'maintenance is neither success nor failure');
  emit(capped, [turnStart(3), failure(3)]);
  await tick();
  assert.equal(capped.followups.length, 1, 'maintenance did not reset the consecutive cap');
});

test('other turn reasons do not disable real model recovery', async t => {
  const { host, tick, emit } = scenario(t);
  host.start();
  const agent = host.agent('other-plugin');
  emit(agent, [{ ...turnStart(1), data: { turn: 1, reason: 'another-plugin' } }, step(1), turnEnd(1, 'completed')]);
  await tick();
  assert.equal(agent.followups.length, 1);
});

for (const stored of [false, true]) {
  test(`startup skips maintenance tails without reviving older errors (stored=${stored})`, async t => {
    const { host, tick } = scenario(t, { scanOnBoot: true });
    const histories = new Map();
    for (const kind of ['completed', 'no-visible-output', 'error', 'max-tokens', 'interrupted', 'open']) {
      const notice = maintenance(2, kind);
      if (kind === 'open') notice.pop();
      histories.set(kind, [turnStart(1), failure(1), ...notice]);
    }
    histories.set('real', [turnStart(1), failure(1)]);
    histories.set('missing-model', [turnStart(1), failure(1, promptError)]);
    if (stored) {
      host.provide('sessionQuery', {
        listSessions: async () => [...histories.keys()].map(id => ({ header: { id }, live: false })),
        observeSession: async id => ({ events: histories.get(id), header: { id }, [Symbol.dispose]() {} }),
      });
      for (const [id, events] of histories) host.onResume(id, events);
    } else {
      for (const [id, events] of histories) host.agent(id, events);
    }
    host.start();
    await tick();
    await tick(3000);
    await tick();
    if (stored) assert.deepEqual(host.resumes().map(value => value.resumeSessionId), ['real']);
    assert.equal(host.agents.get('real').followups.length, 1);
    for (const [id] of histories) {
      if (id !== 'real') assert.equal(host.agents.get(id)?.followups.length ?? 0, 0, id);
    }
  });
}

test('missing prompt variables are permanent, while unrelated UNKNOWN errors still recover', async t => {
  const { host, tick, emit } = scenario(t);
  host.start();
  const missing = host.agent('missing');
  emit(missing, [turnStart(1), failure(1, promptError)]);
  await tick();
  assert.equal(missing.followups.length, 0);
  assert.equal(host.stats().skipped, 1);
  const transient = host.agent('transient');
  emit(transient, [turnStart(1), failure(1)]);
  await tick();
  assert.equal(transient.followups.length, 1);
});
