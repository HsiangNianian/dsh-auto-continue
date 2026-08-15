/**
 * 无头模拟测试: 用假 window/localStorage + 假 ctx(连接/设置作用域/插槽/语言包)
 * 加载打包后的 lib/client.js, 验证自动「继续」插件的核心行为:
 *   1. turn/end error → 宽限期后自动发送配置的文本
 *   2. 宽限期内 turn/start → 取消
 *   3. aborted → 不发送
 *   4. 会话运行中 → 不发送
 *   5. 启动扫描: 历史里最近回合为 interrupted → 自动继续
 *   6. 连续次数上限 → 停止
 *   7. 太久远的中断 → 扫描不处理
 *   8. 设置作用域中的 continueText 覆盖生效
 * 运行: node tests/simulate.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const bundle = readFileSync(join(root, '../lib/client.js'), 'utf8');

// ---------- 假浏览器环境 ----------
const storage = new Map();
const fakeLocalStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => void storage.set(k, String(v)),
  removeItem: (k) => void storage.delete(k),
};
let handoff = null;
globalThis.window = {
  __ModuleLoader__: { load: (h) => void (handoff = h) },
};
globalThis.localStorage = fakeLocalStorage;

// 通知桩: 测试可替换实现并检查调用
const notificationCalls = [];
globalThis.Notification = class {
  static permission = 'granted';
  static requestPermission = async () => 'granted';
  constructor(title, options) {
    notificationCalls.push({ title, body: options?.body ?? '' });
  }
};

// ---------- 假 require: 浏览器包只 require 平台种子与运行时 store ----------
const reactStub = { useState: (init) => [init, () => {}] };
const jsxStub = { jsx: () => null, jsxs: () => null, Fragment: Symbol('fragment') };
const runtimeStub = {
  createSnapshotStore: (init) => {
    let state = init;
    return {
      getSnapshot: () => state,
      subscribe: () => () => {},
      set: (next) => { state = next; },
      update: () => {},
    };
  },
};
const stubRequire = (spec) => {
  if (spec === 'react') return reactStub;
  if (spec === 'react/jsx-runtime') return jsxStub;
  if (spec === '@deepseek-ai/dsh-client-runtime/client') return runtimeStub;
  throw new Error(`unexpected require: ${spec}`);
};

new Function('require', bundle)(stubRequire);
if (!handoff) throw new Error('未捕获 __ModuleLoader__.load');
const exports = handoff.factory(stubRequire);

// ---------- 假 api 与假 ctx ----------
class FakeApi {
  constructor() {
    this.prompts = [];
    this.listCalls = 0;
    this.historyCalls = [];
    this.sessionRows = [];
    this.muxQueue = [];
    this.hostQueue = [];
    this.historyBySession = new Map();
  }

  addSession(id, { running = false, parentSessionId = undefined, events = [] } = {}) {
    this.sessionRows.push({ sessionId: id, running, parentSessionId, updatedAt: Date.now() });
    if (events.length) this.historyBySession.set(id, events);
  }

  async *genQueue(queue, signal) {
    while (true) {
      if (signal.aborted) return;
      const frame = queue.shift();
      if (frame === undefined) {
        await sleep(5);
        continue;
      }
      yield { rpcId: 'r', payload: frame };
    }
  }

  events = {
    mux: (payload, signal) => this.genQueue(this.muxQueue, signal),
    host: (payload, signal) => this.genQueue(this.hostQueue, signal),
  };

  sessions = {
    list: async () => {
      this.listCalls += 1;
      return { result: { ok: true, value: { items: this.sessionRows } } };
    },
    history: async (req) => {
      this.historyCalls.push(req.sessionId);
      return {
        result: {
          ok: true,
          value: { events: this.historyBySession.get(req.sessionId) ?? [], hasMore: false },
        },
      };
    },
    prompt: async (req) => {
      this.prompts.push(req);
      return { result: { ok: true, value: { accepted: true } } };
    },
  };

  pushMux(frame) {
    this.muxQueue.push(frame);
  }

  pushHost(frame) {
    this.hostQueue.push(frame);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 假设置作用域: 引擎从 getSnapshot().value 读配置。 */
function makeScope(value) {
  return {
    getSnapshot: () => ({
      status: 'ready',
      value,
      base: undefined,
      user: value,
      revision: 1,
      writable: true,
      mode: 'host',
    }),
    subscribe: () => () => {},
    set: async () => {},
    unset: async () => {},
  };
}

/** 假客户端根上下文: 提供 connection / settingsScope / locale / slots。 */
function makeCtx(api, scopeValue) {
  return {
    connection: { api },
    settingsScope: { bind: () => makeScope(scopeValue) },
    locale: { register: () => {}, bind: () => (key) => key },
    slots: {
      inject: () => {},
      register: () => () => {},
    },
    effect: () => () => {},
  };
}

const turnEnd = (sessionId, turn, reason) => ({
  type: 'session/event',
  sessionId,
  event: { type: 'turn/end', seq: turn * 10, time: Date.now(), data: { turn, reason } },
});
const turnStart = (sessionId, turn) => ({
  type: 'session/event',
  sessionId,
  event: { type: 'turn/start', seq: turn * 10, time: Date.now(), data: { turn } },
});

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${name}`);
  }
}

/** 每个测试独立: 清空 localStorage, 用快速参数设置作用域, 重新 apply。 */
const FAST = { graceMs: 200, cooldownMs: 300, maxConsecutive: 3, scanOnBoot: true, verbose: false };
function startPlugin(api, overrides = {}) {
  storage.clear();
  exports.apply(makeCtx(api, { ...FAST, ...overrides }));
}

// ---------- 测试 1: turn/end error → 自动发送 ----------
{
  console.log('测试 1: turn/end error → 宽限期后自动发送');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api);
  await sleep(50);
  api.pushMux(turnEnd('s1', 1, { kind: 'error', error: { code: 'X', message: 'boom' } }));
  await sleep(100); // grace 200ms, 还没到
  check('宽限期内未发送', api.prompts.length === 0);
  await sleep(500);
  check('宽限期后已发送', api.prompts.length === 1);
  check('发送文本为「继续」', api.prompts[0]?.content?.[0]?.text === '继续');
  check('mode 为 queue', api.prompts[0]?.mode === 'queue');
  check('目标会话 s1', api.prompts[0]?.sessionId === 's1');
  await sleep(50);
}

// ---------- 测试 2: 宽限期内 turn/start → 取消 ----------
{
  console.log('测试 2: 宽限期内宿主自行开启新回合 → 取消');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api);
  await sleep(50);
  api.pushMux(turnEnd('s1', 1, { kind: 'error', error: { code: 'X', message: 'boom' } }));
  await sleep(100);
  api.pushMux(turnStart('s1', 2));
  await sleep(600);
  check('未发送', api.prompts.length === 0);
  await sleep(50);
}

// ---------- 测试 3: aborted → 不发送 ----------
{
  console.log('测试 3: 用户停止(aborted)→ 不发送');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api);
  await sleep(50);
  api.pushMux(turnEnd('s1', 1, { kind: 'aborted', reason: { kind: 'human' } }));
  await sleep(600);
  check('未发送', api.prompts.length === 0);
  await sleep(50);
}

// ---------- 测试 4: 会话运行中 → 不发送 ----------
{
  console.log('测试 4: 会话运行中(host 帧)→ 不发送');
  const api = new FakeApi();
  api.addSession('s1', { running: true });
  startPlugin(api);
  await sleep(50);
  api.pushHost({ type: 'host/session-status', sessionId: 's1', running: true });
  api.pushMux(turnEnd('s1', 1, { kind: 'error', error: { code: 'X', message: 'boom' } }));
  await sleep(600);
  check('未发送', api.prompts.length === 0);
  await sleep(50);
}

// ---------- 测试 5: 启动扫描 interrupted ----------
{
  console.log('测试 5: 启动扫描发现最近 interrupted 回合 → 自动继续');
  const api = new FakeApi();
  const now = Date.now();
  api.addSession('s1', {
    running: false,
    events: [
      {
        event: {
          type: 'turn/end',
          seq: 2,
          time: now - 60_000,
          data: { turn: 1, reason: { kind: 'interrupted' } },
        },
      },
    ],
  });
  startPlugin(api);
  await sleep(1000); // boot 扫描 + grace
  check('已发送', api.prompts.length === 1);
  check('文本为「继续」', api.prompts[0]?.content?.[0]?.text === '继续');
  await sleep(50);
}

// ---------- 测试 6: 连续次数上限 ----------
{
  console.log('测试 6: 连续自动继续达到上限后停止');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api);
  await sleep(50);
  for (let i = 1; i <= 4; i += 1) {
    api.pushMux(turnEnd('s1', i, { kind: 'error', error: { code: 'X', message: 'boom' } }));
    await sleep(500); // grace 200 + 余量, 触发发送
    api.pushMux(turnStart('s1', i + 1));
    await sleep(450); // 超过 cooldown 300ms
  }
  check('只发送了 3 次(默认上限)', api.prompts.length === 3);
  await sleep(50);
}

// ---------- 测试 7: 旧的 error → 扫描不处理 ----------
{
  console.log('测试 7: 太久远的中断 → 扫描不处理');
  const api = new FakeApi();
  const now = Date.now();
  api.addSession('s1', {
    running: false,
    events: [
      {
        event: {
          type: 'turn/end',
          seq: 2,
          time: now - 60 * 60 * 1000, // 1 小时前
          data: { turn: 1, reason: { kind: 'error', error: { code: 'X', message: 'old' } } },
        },
      },
    ],
  });
  startPlugin(api);
  await sleep(1000);
  check('未发送', api.prompts.length === 0);
  await sleep(50);
}

// ---------- 测试 8: 设置作用域覆盖 continueText ----------
{
  console.log('测试 8: 设置中的 continueText 覆盖生效');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api, { continueText: '请继续' });
  await sleep(50);
  api.pushMux(turnEnd('s1', 1, { kind: 'error', error: { code: 'X', message: 'boom' } }));
  await sleep(600);
  check('已发送', api.prompts.length === 1);
  check('文本为「请继续」', api.prompts[0]?.content?.[0]?.text === '请继续');
  await sleep(50);
}

// ---------- 测试 9: 错误分类 — 永久性错误不自动继续 ----------
{
  console.log('测试 9: 永久性错误(HTTP 401)→ 不发送, 触发通知');
  const api = new FakeApi();
  api.addSession('s1');
  notificationCalls.length = 0;
  startPlugin(api, { notify: true });
  await sleep(50);
  api.pushMux(turnEnd('s1', 1, {
    kind: 'error',
    error: { code: 'INVALID_API_KEY', message: 'invalid api key', status: 401 },
  }));
  await sleep(600);
  check('未发送', api.prompts.length === 0);
  check('已发通知', notificationCalls.length === 1);
  check('通知标题正确', notificationCalls[0]?.title === 'dsh-auto-continue: 未自动继续');
  await sleep(50);
}

// ---------- 测试 10: 错误分类 — 临时性错误仍自动继续 ----------
{
  console.log('测试 10: 临时性错误(network)→ 照常自动继续');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api);
  await sleep(50);
  api.pushMux(turnEnd('s1', 1, {
    kind: 'error',
    error: { code: 'UPSTREAM', message: 'upstream network error' },
  }));
  await sleep(600);
  check('已发送', api.prompts.length === 1);
  await sleep(50);
}

// ---------- 测试 11: 自适应退避 — 连续失败时冷却递增 ----------
{
  console.log('测试 11: 自适应退避(2 次失败后间隔 200→400ms)');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api, {
    graceMs: 100,
    cooldownMs: 200,
    backoffFactor: 2,
    backoffMaxMs: 5000,
    maxConsecutive: 5,
    scanOnBoot: false,
  });
  await sleep(50);
  const t0 = Date.now();
  api.pushMux(turnEnd('s1', 1, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(320); // send1 已在 ~t0+100 发出(consecutive=1), 此刻距 send1 约 220ms > 基础 200ms 但 < 退避 400ms
  check('退避期内未再次调度', api.prompts.length === 1);
  await sleep(400); // 距 send1 已 > 400ms, err2 可调度
  api.pushMux(turnEnd('s1', 2, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(300); // grace 100 + 余量 → send2
  check('退避后已发送第 2 次', api.prompts.length === 2);
  void t0;
  await sleep(50);
}

// ---------- 测试 12: continueText 模板占位符 ----------
{
  console.log('测试 12: 模板占位符 {code} 与 {tool} 填充');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api, { continueText: '继续({tool}: {code})' });
  await sleep(50);
  api.pushMux({
    type: 'session/event',
    sessionId: 's1',
    event: { type: 'tool/call', seq: 5, time: Date.now(), data: { name: 'bash', callId: 'c1', arguments: '{}' } },
  });
  api.pushMux(turnEnd('s1', 1, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(600);
  check('已发送', api.prompts.length === 1);
  check('模板已填充', api.prompts[0]?.content?.[0]?.text === '继续(bash: UPSTREAM)');
  await sleep(50);
}

// ---------- 测试 13: 实时流 interrupted(用户停止被误标场景)→ 不自动继续 ----------
{
  console.log('测试 13: 实时 turn/end interrupted → 不自动继续');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api);
  await sleep(50);
  api.pushMux(turnEnd('s1', 1, { kind: 'interrupted' }));
  await sleep(600);
  check('未发送', api.prompts.length === 0);
  await sleep(50);
}

// ---------- 测试 14: host/agent-error 序列化错误(用户停止的连带效应)→ 不自动继续 ----------
{
  console.log('测试 14: agent-error 序列化失败 → 不自动继续');
  const api = new FakeApi();
  api.addSession('s1');
  notificationCalls.length = 0;
  startPlugin(api, { notify: true });
  await sleep(50);
  api.pushHost({ type: 'host/agent-error', sessionId: 's1', message: 'session event "turn/end" carries non-JSON-serializable data' });
  await sleep(600);
  check('未发送', api.prompts.length === 0);
  check('已发通知', notificationCalls.length === 1);
  await sleep(50);
}

// ---------- 测试 15: host/agent-error 网络类错误 → 照常自动继续 ----------
{
  console.log('测试 15: agent-error 网络错误 → 照常自动继续');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api);
  await sleep(50);
  api.pushHost({ type: 'host/agent-error', sessionId: 's1', message: 'network connection refused' });
  await sleep(600);
  check('已发送', api.prompts.length === 1);
  await sleep(50);
}

console.log(failures === 0 ? '\n全部通过 ✅' : `\n${failures} 项失败 ❌`);
process.exit(failures === 0 ? 0 : 1);
