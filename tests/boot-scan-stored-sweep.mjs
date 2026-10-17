/** Boot-scan storage sweep: restart-interrupted sessions the registry has not loaded. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeHost, turnEnd } from './host-fixture.mjs';

function scenario(t, config = {}) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
  const host = makeHost({ locale: 'en', ...config });
  t.after(() => host.dispose());
  const tick = async (ms = 0) => {
    t.mock.timers.tick(ms);
    for (let i = 0; i < 16; i += 1) await Promise.resolve();
  };
  return { host, tick };
}

test('stored interrupted session is materialized, then recovered by the boot scan', async (t) => {
  const { host, tick } = scenario(t);
  const events = [turnEnd(1, 'interrupted')];
  let observations = 0;
  let disposed = 0;
  host.provide('sessionQuery', {
    listSessions: async () => [{ header: { id: 'stored' }, live: false, persisted: true }],
    observeSession: async () => {
      observations += 1;
      return {
        events: [...events],
        header: { id: 'stored' },
        projections: { values: {} },
        [Symbol.dispose]: () => { disposed += 1; },
      };
    },
  });
  host.provide('agentDefaultModel', {
    currentSelection: () => ({ provider: 'acme', model: 'big', reasoningEffort: 'high' }),
  });
  host.start();
  await tick();
  assert.equal(observations, 1);
  assert.equal(disposed, 1);
  assert.equal(host.resumes().length, 1);
  const resume = host.resumes()[0];
  assert.equal(resume.resumeSessionId, 'stored');
  assert.deepEqual(resume.agentOptions, { provider: 'acme', model: 'big' });
  assert.equal(resume.setup, undefined);
  assert(host.logs.some((entry) => entry.level === 'info' && entry.message.includes('存储扫描就绪')));
  // resume() in a real host registers the agent; simulate it for the next scan pass.
  const agent = host.agent('stored', events);
  await tick(3000);
  await tick(10);
  assert.equal(agent.followups.length, 1);
  assert.match(agent.followups[0].content[0].text, /restarted/);
});

test('stored sessions are swept at most once and ignored when not recoverable', async (t) => {
  const { host, tick } = scenario(t);
  const records = [
    { header: { id: 'interrupted' }, live: false, persisted: true },
    { header: { id: 'subagent', origin: 'subagent' }, live: false, persisted: true },
    { header: { id: 'open-somewhere' }, live: true, persisted: true },
    { header: { id: 'stopped' }, live: false, persisted: true },
  ];
  let observations = 0;
  host.provide('sessionQuery', {
    listSessions: async () => records.map((record) => ({ ...record })),
    observeSession: async (id) => {
      observations += 1;
      const events = id === 'stopped' ? [turnEnd(1, 'stop')] : [turnEnd(1, 'interrupted')];
      return { events, header: { id }, [Symbol.dispose]: () => {} };
    },
  });
  host.start();
  await tick();
  await tick(3000);
  assert.deepEqual(host.resumes().map((resume) => resume.resumeSessionId), ['interrupted']);
  assert.equal(observations, 2); // interrupted + stopped observed once each; subagent and live skipped
});

test('custom continueTextInterrupted is sent for restarted sessions', async (t) => {
  const { host, tick } = scenario(t, { continueTextInterrupted: 'Restarted during turn {turn}' });
  const events = [turnEnd(2, 'interrupted')];
  host.provide('sessionQuery', {
    listSessions: async () => [{ header: { id: 'stored' }, live: false, persisted: true }],
    observeSession: async () => ({ events: [...events], header: { id: 'stored' }, [Symbol.dispose]: () => {} }),
  });
  host.start();
  await tick();
  host.agent('stored', events);
  await tick(3000);
  await tick(10);
  const agent = host.agents.get('stored');
  assert.equal(agent.followups[0].content[0].text, 'Restarted during turn 2');
});

test('without the sessionQuery service the sweep is a no-op', async (t) => {
  const { host, tick } = scenario(t);
  const agent = host.agent('live', [turnEnd(1, 'interrupted')]);
  host.start();
  await tick();
  await tick(3000);
  await tick(10);
  assert.equal(host.resumes().length, 0);
  assert(!host.logs.some((entry) => entry.message.includes('存储扫描就绪')));
  assert.equal(agent.followups.length, 1); // live registry recovery still works
});
