/** Boot-scan storage sweep: restart-interrupted sessions the registry has not loaded. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeHost, turnEnd, turnStart } from './host-fixture.mjs';

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
  // 真实宿主 resume 后 agent 立即可见; fixture 按 this 声明注册, 不在测试里手工插入。
  host.onResume('stored', events);
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
  await tick(3000);
  await tick(10);
  const agent = host.agents.get('stored');
  assert(agent !== undefined);
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

test('a stored session left mid-turn by a host kill is materialized and recovered', async (t) => {
  const { host, tick } = scenario(t);
  host.provide('sessionQuery', {
    listSessions: async () => [{ header: { id: 'killed' }, live: false, persisted: true }],
    observeSession: async () => ({
      events: [turnStart(1)],
      header: { id: 'killed' },
      [Symbol.dispose]: () => {},
    }),
  });
  // 真实宿主 resume 时为进行中的轮次补一条 interrupted turn/end; 声明补齐后的日志。
  host.onResume('killed', [turnStart(1), turnEnd(1, 'interrupted')]);
  host.start();
  await tick();
  assert.deepEqual(host.resumes().map((resume) => resume.resumeSessionId), ['killed']);
  const agent = host.agents.get('killed');
  assert(agent !== undefined);
  await tick(3000);
  await tick(10);
  assert.equal(agent.followups.length, 1);
  assert.match(agent.followups[0].content[0].text, /restarted/);
});

test('permanent error tails are not materialized, transient ones are', async (t) => {
  const { host, tick } = scenario(t);
  host.provide('sessionQuery', {
    listSessions: async () => [
      { header: { id: 'perm' }, live: false, persisted: true },
      { header: { id: 'flaky' }, live: false, persisted: true },
    ],
    observeSession: async (id) => ({
      events: [id === 'perm'
        ? turnEnd(1, 'error', { error: { message: 'unauthorized: api key rejected' } })
        : turnEnd(1, 'error', { error: { message: 'network down' } })],
      header: { id },
      [Symbol.dispose]: () => {},
    }),
  });
  host.start();
  await tick();
  await tick(3000);
  assert.deepEqual(host.resumes().map((resume) => resume.resumeSessionId), ['flaky']);
});

test('a transient observation failure is retried on the next sweep pass', async (t) => {
  const { host, tick } = scenario(t);
  let calls = 0;
  host.provide('sessionQuery', {
    listSessions: async () => [{ header: { id: 'stored' }, live: false, persisted: true }],
    observeSession: async () => {
      calls += 1;
      if (calls === 1) throw new Error('journal locked');
      return { events: [turnEnd(1, 'interrupted')], header: { id: 'stored' }, [Symbol.dispose]: () => {} };
    },
  });
  host.start();
  await tick();
  assert.equal(host.resumes().length, 0);
  await tick(3000);
  assert.equal(calls, 2);
  assert.deepEqual(host.resumes().map((resume) => resume.resumeSessionId), ['stored']);
});
