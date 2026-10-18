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
    // 排空完整一轮扫描的微任务链: 每个被观察的记录约需 3 个 await, 多记录
    // 轮次远超 16 个微任务位; 固定 200 覆盖 ~60 个记录仍绰绰有余。
    for (let i = 0; i < 200; i += 1) await Promise.resolve();
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
  // 真实宿主 resume 后 agent 立即可见; fixture 按 onResume 声明注册, 不在测试里手工插入。
  host.onResume('stored', events);
  host.start();
  await tick();
  assert.equal(observations, 1);
  assert.equal(disposed, 1);
  assert.equal(host.resumes().length, 1);
  const resume = host.resumes()[0];
  assert.equal(resume.resumeSessionId, 'stored');
  assert.deepEqual(resume.agentOptions, { provider: 'acme', model: 'big' });
  // 无 preset 服务且无已记录 request-header: 物化只带 agentOptions, 不注册 setup。
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
  host.onResume('stored', events);
  host.start();
  await tick();
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

test('a mid-turn journal served as the real service folds it takes the closed-tail path', async (t) => {
  const { host, tick } = scenario(t);
  host.provide('sessionQuery', {
    listSessions: async () => [{ header: { id: 'folded' }, live: false, persisted: true }],
    // 真实 sessionQuery 冷读返回折叠后的日志: 合成 turn/end 排在 turn/start 之后。
    observeSession: async () => ({
      events: [turnStart(1), turnEnd(2, 'interrupted')],
      header: { id: 'folded' },
      [Symbol.dispose]: () => {},
    }),
  });
  host.onResume('folded', [turnStart(1), turnEnd(2, 'interrupted')]);
  host.start();
  await tick();
  assert.deepEqual(host.resumes().map((resume) => resume.resumeSessionId), ['folded']);
  assert(!host.logs.some((entry) => entry.message.includes('视作 interrupted')));
  assert(host.logs.some((entry) => entry.message.includes('turn/end:interrupted')));
  await tick(3000);
  await tick(10);
  const agent = host.agents.get('folded');
  assert(agent !== undefined);
  assert.equal(agent.followups.length, 1);
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

test('stale or superseded stored permanent failures are skipped silently like the live scan', async (t) => {
  const { host, tick } = scenario(t);
  const stale = {
    ...turnEnd(1, 'error', { error: { message: 'unauthorized: api key rejected' } }),
    time: Date.now() - 16 * 60 * 1000,
  };
  host.provide('sessionQuery', {
    listSessions: async () => [
      { header: { id: 'stale' }, live: false, persisted: true },
      { header: { id: 'taken-over' }, live: false, persisted: true },
    ],
    observeSession: async (id) => ({
      events: id === 'stale'
        ? [stale]
        : [
          turnEnd(1, 'error', { error: { message: 'unauthorized: api key rejected' } }),
          { type: 'user/message', seq: 11, time: Date.now(), data: { source: { kind: 'user' } } },
        ],
      header: { id },
      [Symbol.dispose]: () => {},
    }),
  });
  host.start();
  await tick();
  // 与 live 扫描一致: 过期或已被用户消息接管的永久失败不再走 onTurnFailure,
  // 既不计数也不通知。
  assert.equal(host.resumes().length, 0);
  assert(!host.logs.some((entry) => entry.message.includes('永久性失败')));
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

test('repeated observation failures give up after three strikes', async (t) => {
  const { host, tick } = scenario(t);
  let calls = 0;
  host.provide('sessionQuery', {
    listSessions: async () => [{ header: { id: 'stored' }, live: false, persisted: true }],
    observeSession: async () => { calls += 1; throw new Error('journal locked'); },
  });
  host.start();
  await tick();
  await tick(3000);
  await tick(3000);
  await tick(3000);
  await tick(3000);
  assert.equal(calls, 3);
  assert.equal(host.resumes().length, 0);
  const failures = host.logs.filter((entry) => entry.level === 'error' && entry.message.includes('物化失败'));
  assert.equal(failures.length, 3);
});

test('materialization mounts the recorded preset and seeds the logged model selection', async (t) => {
  const { host, tick } = scenario(t);
  host.provide('sessionQuery', {
    listSessions: async () => [{ header: { id: 'stored' }, live: false, persisted: true }],
    observeSession: async () => ({
      events: [
        { type: 'request/header', seq: 1, time: 1, data: { header: { config: { provider: 'anthropic', model: 'sonnet', reasoningEffort: 'high' } } } },
        turnEnd(2, 'interrupted'),
      ],
      header: { id: 'stored' },
      projections: { values: { agentPreset: 'custom-preset' } },
      [Symbol.dispose]: () => {},
    }),
  });
  const mounted = [];
  host.provide('agentPresets', {
    resolve: async (id) => ({ id: `${id}#resolved` }),
    mount: async (ctx, id) => { mounted.push(id); },
  });
  host.provide('agentDefaultModel', {
    currentSelection: () => ({ provider: 'acme', model: 'big' }),
  });
  host.start();
  await tick();
  const resume = host.resumes()[0];
  // {{model}}/{{provider}} 提示变量与首次请求路由都读 agentOptions(agent-loop
  // 注册的变量提供器即 context.agent.options): 种子取自会话日志记录的
  // request-header, 而非宿主默认模型; 种子只带路由, 日志记录的 effort 由
  // 驱动器在路由吻合时自行回装。
  assert.deepEqual(resume.agentOptions, { provider: 'anthropic', model: 'sonnet' });
  assert.equal(typeof resume.setup, 'function');
  await resume.setup({ on: () => {} });
  assert.deepEqual(mounted, ['custom-preset#resolved']);
});

test('a dispose during observation stops the sweep without materializing', async (t) => {
  const { host, tick } = scenario(t);
  let disposed = 0;
  host.provide('sessionQuery', {
    listSessions: async () => [{ header: { id: 'stored' }, live: false, persisted: true }],
    observeSession: async () => {
      host.dispose();
      return { events: [turnEnd(1, 'interrupted')], header: { id: 'stored' }, [Symbol.dispose]: () => { disposed += 1; } };
    },
  });
  host.start();
  await tick();
  assert.equal(host.resumes().length, 0);
  assert.equal(disposed, 1);
  assert(!host.logs.some((entry) => entry.level === 'error' && entry.message.includes('物化失败')));
});

test('a session opened between the listing and the sweep is left to the live scan', async (t) => {
  const { host, tick } = scenario(t);
  host.provide('sessionQuery', {
    listSessions: async () => [{ header: { id: 'raced' }, live: false, persisted: true }],
    observeSession: async () => ({
      events: [turnEnd(1, 'interrupted')],
      header: { id: 'raced' },
      [Symbol.dispose]: () => {},
    }),
  });
  // 客户端在快照之后打开了该会话: 注册表里已有 live agent。
  host.agent('raced', [turnEnd(1, 'interrupted')]);
  host.start();
  await tick();
  assert.equal(host.resumes().length, 0);
  assert(!host.logs.some((entry) => entry.message.includes('物化失败')));
  await tick(3000);
  await tick(10);
  const agent = host.agents.get('raced');
  assert.equal(agent.followups.length, 1); // live 扫描接管恢复
});
