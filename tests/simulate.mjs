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
 *   9-15. 错误分类 / 退避 / 模板 / interrupted / agent-error
 *   16. 全局暂停 → 不自动继续
 *   17. 会话级暂停 → 不自动继续
 *   18. max-tokens 使用专用继续文本
 *   19. 统计记录(跳过/发送/失败/恢复/停止)
 *   20. 新占位符 {errorCount} {sessionTitle} {elapsed}
 *   21. 通知操作按钮(立即续跑 / 暂停该会话 1 小时)
 *   22-27. 幂等护栏(结果未确认/已成功/已失败/开关关闭/跨回合重置/扫描重建)
 *   28. classify 关闭时 agent-error 永久错误仍不自动继续
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
  key: (i) => [...storage.keys()][i] ?? null,
  get length() {
    return storage.size;
  },
};
let handoff = null;
globalThis.window = {
  __ModuleLoader__: { load: (h) => void (handoff = h) },
};
globalThis.localStorage = fakeLocalStorage;

// 通知桩: 测试可替换实现并检查调用, 可触发操作按钮
const notificationCalls = [];
const notificationInstances = [];
globalThis.Notification = class {
  static permission = 'granted';
  static requestPermission = async () => 'granted';
  constructor(title, options) {
    notificationCalls.push({ title, body: options?.body ?? '', actions: options?.actions ?? [] });
    this.onclick = null;
    this.onaction = null;
    notificationInstances.push(this);
  }
  fireAction(action) {
    this.onaction?.({ action });
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
    this.cancels = [];
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
    cancel: async (req) => {
      this.cancels.push(req.sessionId);
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
  // 关掉幂等护栏, 专注模板填充本身
  startPlugin(api, { continueText: '继续({tool}: {code})', guardTools: false });
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

// ---------- 测试 16: 全局暂停 → 不自动继续 ----------
{
  console.log('测试 16: 全局暂停(paused)→ 不自动继续');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api, { paused: true });
  await sleep(50);
  api.pushMux(turnEnd('s1', 1, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(600);
  check('未发送', api.prompts.length === 0);
  await sleep(50);
}

// ---------- 测试 17: 会话级暂停 → 不自动继续 ----------
{
  console.log('测试 17: 会话级暂停 → 不自动继续');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api);
  exports.pauseSession('s1', 60_000);
  await sleep(50);
  api.pushMux(turnEnd('s1', 1, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(600);
  check('未发送', api.prompts.length === 0);
  check('暂停列表包含 s1', exports.pausedSessions().some((p) => p.sessionId === 's1'));
  exports.unpauseSession('s1');
  check('解除后列表为空', exports.pausedSessions().length === 0);
  await sleep(50);
}

// ---------- 测试 18: max-tokens 使用专用继续文本 ----------
{
  console.log('测试 18: max-tokens 使用专用继续文本');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api, { continueText: '继续', continueTextMaxTokens: '继续输出, 不要重复' });
  await sleep(50);
  api.pushMux(turnEnd('s1', 1, { kind: 'max-tokens' }));
  await sleep(600);
  check('已发送', api.prompts.length === 1);
  check('使用超限专用文本', api.prompts[0]?.content?.[0]?.text === '继续输出, 不要重复');
  await sleep(50);
}

// ---------- 测试 19: 统计记录(跳过/发送/失败/停止) ----------
{
  console.log('测试 19a: 统计记录(跳过/发送/失败/停止)');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api, { notify: false, maxConsecutive: 2, scanOnBoot: false });
  await sleep(50);
  // 永久性错误 → 跳过
  api.pushMux(turnEnd('s1', 1, { kind: 'error', error: { code: 'INVALID_API_KEY', message: 'bad key', status: 401 } }));
  await sleep(300);
  // 临时错误 → 发送 1(consecutive=1; 发送发生在 ~推入+230ms)
  api.pushMux(turnEnd('s1', 2, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(1000);
  check('已发送 1 次', api.prompts.length === 1);
  // 继续后仍失败 → failed=1; 距上次尝试已 ≥600ms 退避 → 再发送 2(consecutive=2 → 达上限 gaveUp=1)
  api.pushMux(turnEnd('s1', 3, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(500);
  check('已发送 2 次', api.prompts.length === 2);
  // 达上限: 不再发送(该失败会把上次发送的待确认消费掉, 不重复计入 failed)
  api.pushMux(turnEnd('s1', 4, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(500);
  check('达上限后未再发送', api.prompts.length === 2);
  // 引擎停止追踪后, 后续成功回合不再归功于自动继续
  api.pushMux(turnEnd('s1', 5, { kind: 'completed' }));
  await sleep(100);
  const stats = exports.readTodayStats();
  check('sent=2', stats.sent === 2);
  check('skipped=1', stats.skipped === 1);
  check('failed=2(两次发送后各失败一次)', stats.failed === 2);
  check('gaveUp=1', stats.gaveUp === 1);
  check('recovered=0(停止追踪后不计)', stats.recovered === 0);
  check('byCode UPSTREAM=2', stats.byCode['UPSTREAM'] === 2);
  check('byCode INVALID_API_KEY=1', stats.byCode['INVALID_API_KEY'] === 1);
  await sleep(50);
}

// ---------- 测试 19b: 统计 — 发送后成功回合计入恢复, 清零可用 ----------
{
  console.log('测试 19b: 恢复统计与清零');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api, { notify: false, maxConsecutive: 3, scanOnBoot: false });
  await sleep(50);
  api.pushMux(turnEnd('s1', 1, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(600);
  check('已发送 1 次', api.prompts.length === 1);
  api.pushMux(turnEnd('s1', 2, { kind: 'completed' }));
  await sleep(100);
  let stats = exports.readTodayStats();
  check('sent=1', stats.sent === 1);
  check('recovered=1', stats.recovered === 1);
  check('failed=0', stats.failed === 0);
  exports.resetTodayStats();
  stats = exports.readTodayStats();
  check('清零后 sent=0', stats.sent === 0);
  await sleep(50);
}

// ---------- 测试 20: 新占位符 {errorCount} {sessionTitle} {elapsed} ----------
{
  console.log('测试 20: 新占位符 {errorCount} {sessionTitle} {elapsed}');
  const text = exports.fillTemplate('继续({errorCount}次, {sessionTitle}, 已等{elapsed})', {
    facts: { code: 'UPSTREAM', message: 'x' },
    errorCount: 3,
    sessionTitle: '修复构建',
    elapsedMs: 65_000,
  });
  check('占位符已填充', text === '继续(3次, 修复构建, 已等1m5s)');
  check('空上下文安全', exports.fillTemplate('继续 {elapsed} {sessionTitle}', {}) === '继续  ');
  check('毫秒格式', exports.fillTemplate('{elapsed}', { elapsedMs: 500 }) === '500ms');
  await sleep(10);
}

// ---------- 测试 21: 通知操作按钮(立即续跑 / 暂停该会话 1 小时) ----------
{
  console.log('测试 21: 通知操作按钮(立即续跑 / 暂停该会话 1 小时)');
  const api = new FakeApi();
  api.addSession('s1');
  notificationCalls.length = 0;
  notificationInstances.length = 0;
  startPlugin(api, { notify: true, maxConsecutive: 1, scanOnBoot: false });
  await sleep(50);
  api.pushMux(turnEnd('s1', 1, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(550);
  check('已发送 1 次', api.prompts.length === 1);
  const call = notificationCalls.find((c) => c.title.includes('已自动继续'));
  check('通知带 2 个操作按钮', call !== undefined && call.actions.length === 2);
  check('按钮为立即续跑/暂停', call?.actions?.[0]?.action === 'resume' && call?.actions?.[1]?.action === 'pause1h');
  // 「立即续跑」: 无视冷却与连续上限, 再发一次
  const inst = notificationInstances[notificationInstances.length - 1];
  inst.fireAction('resume');
  await sleep(400);
  check('立即续跑后共 2 次', api.prompts.length === 2);
  // 「暂停该会话 1 小时」: 进入暂停列表
  inst.fireAction('pause1h');
  await sleep(50);
  check('会话已暂停', exports.pausedSessions().length === 1);
  await sleep(50);
}

// ---------- 测试 22: 幂等护栏 — 工具结果未确认 → 附加 pending 护栏 ----------
{
  console.log('测试 22: 幂等护栏(结果未确认)→ 附加先确认状态的护栏文本');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api, { scanOnBoot: false });
  await sleep(50);
  api.pushMux({
    type: 'session/event',
    sessionId: 's1',
    event: { type: 'tool/call', seq: 5, time: Date.now(), data: { name: 'git-push', callId: 'c1', arguments: '{}' } },
  });
  api.pushMux(turnEnd('s1', 1, { kind: 'error', error: { code: 'UPSTREAM', message: 'boom' } }));
  await sleep(600);
  check('已发送', api.prompts.length === 1);
  check(
    '附加 pending 护栏',
    api.prompts[0]?.content?.[0]?.text ===
      '继续 (上一步工具「git-push」可能未完成, 先确认状态再继续, 不要重复执行)',
  );
  await sleep(50);
}

// ---------- 测试 23: 幂等护栏 — 工具已成功 → 附加 done 护栏(含结果摘要) ----------
{
  console.log('测试 23: 幂等护栏(工具已成功)→ 附加不要重复执行的护栏文本');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api, { scanOnBoot: false });
  await sleep(50);
  api.pushMux({
    type: 'session/event',
    sessionId: 's1',
    event: { type: 'tool/call', seq: 5, time: Date.now(), data: { name: 'git-push', callId: 'c1', arguments: '{}' } },
  });
  api.pushMux({
    type: 'session/event',
    sessionId: 's1',
    event: {
      type: 'tool/result',
      seq: 6,
      time: Date.now(),
      data: {
        turn: 1,
        step: 1,
        message: {
          role: 'user',
          content: [{
            type: 'tool-result',
            toolCallId: 'c1',
            content: [{ type: 'text', text: 'push 成功, main -> origin/main' }],
          }],
        },
      },
    },
  });
  api.pushMux(turnEnd('s1', 1, { kind: 'error', error: { code: 'UPSTREAM', message: 'boom' } }));
  await sleep(600);
  check('已发送', api.prompts.length === 1);
  check(
    '附加 done 护栏(含结果)',
    api.prompts[0]?.content?.[0]?.text ===
      '继续 (上一步工具「git-push」已完成, 结果: push 成功, main -> origin/main; 不要重复执行, 直接继续)',
  );
  await sleep(50);
}

// ---------- 测试 24: 幂等护栏 — 工具已失败 → 不加护栏(重试是目的) ----------
{
  console.log('测试 24: 幂等护栏(工具已失败)→ 不加护栏');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api, { scanOnBoot: false });
  await sleep(50);
  api.pushMux({
    type: 'session/event',
    sessionId: 's1',
    event: { type: 'tool/call', seq: 5, time: Date.now(), data: { name: 'bash', callId: 'c1', arguments: '{}' } },
  });
  api.pushMux({
    type: 'session/event',
    sessionId: 's1',
    event: {
      type: 'tool/result',
      seq: 6,
      time: Date.now(),
      data: {
        turn: 1,
        step: 1,
        message: {
          role: 'user',
          content: [{
            type: 'tool-result',
            toolCallId: 'c1',
            content: [{ type: 'text', text: 'command failed' }],
            isError: true,
          }],
        },
      },
    },
  });
  api.pushMux(turnEnd('s1', 1, { kind: 'error', error: { code: 'UPSTREAM', message: 'boom' } }));
  await sleep(600);
  check('已发送', api.prompts.length === 1);
  check('无护栏文本', api.prompts[0]?.content?.[0]?.text === '继续');
  await sleep(50);
}

// ---------- 测试 25: 幂等护栏 — 关闭开关 → 不加护栏 ----------
{
  console.log('测试 25: 幂等护栏(guardTools 关)→ 不加护栏');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api, { scanOnBoot: false, guardTools: false });
  await sleep(50);
  api.pushMux({
    type: 'session/event',
    sessionId: 's1',
    event: { type: 'tool/call', seq: 5, time: Date.now(), data: { name: 'bash', callId: 'c1', arguments: '{}' } },
  });
  api.pushMux(turnEnd('s1', 1, { kind: 'error', error: { code: 'UPSTREAM', message: 'boom' } }));
  await sleep(600);
  check('已发送', api.prompts.length === 1);
  check('无护栏文本', api.prompts[0]?.content?.[0]?.text === '继续');
  await sleep(50);
}

// ---------- 测试 26: 幂等护栏 — 新回合开始后重置, 不跨回合误用 ----------
{
  console.log('测试 26: 幂等护栏(新回合重置)→ 上个回合的工具不触发护栏');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api, { scanOnBoot: false });
  await sleep(50);
  // 回合 1: 发起工具调用但回合被用户中止
  api.pushMux({
    type: 'session/event',
    sessionId: 's1',
    event: { type: 'tool/call', seq: 5, time: Date.now(), data: { name: 'git-push', callId: 'c1', arguments: '{}' } },
  });
  api.pushMux(turnEnd('s1', 1, { kind: 'aborted', reason: { kind: 'human' } }));
  // 回合 2: 正常开始, 失败, 无工具调用 → 不应带护栏
  api.pushMux(turnStart('s1', 2));
  api.pushMux(turnEnd('s1', 2, { kind: 'error', error: { code: 'UPSTREAM', message: 'boom' } }));
  await sleep(600);
  check('已发送', api.prompts.length === 1);
  check('无护栏文本', api.prompts[0]?.content?.[0]?.text === '继续');
  await sleep(50);
}

// ---------- 测试 27: 幂等护栏 — 扫描路径从历史重建工具状态 ----------
{
  console.log('测试 27: 扫描路径(历史里工具无结果)→ 附加 pending 护栏');
  const api = new FakeApi();
  const now = Date.now();
  api.addSession('s1', {
    running: false,
    events: [
      {
        event: {
          type: 'tool/call',
          seq: 1,
          time: now - 60_000,
          data: { turn: 1, step: 1, name: 'git-push', callId: 'c1', arguments: '{}' },
        },
      },
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
  startPlugin(api, { scanOnBoot: true });
  await sleep(1000);
  check('已发送', api.prompts.length === 1);
  check(
    '附加 pending 护栏',
    api.prompts[0]?.content?.[0]?.text ===
      '继续 (上一步工具「git-push」可能未完成, 先确认状态再继续, 不要重复执行)',
  );
  await sleep(50);
}

console.log(failures === 0 ? '\n全部通过 ✅' : `\n${failures} 项失败 ❌`);

// ---------- 测试 28: classify 关闭时 agent-error 永久错误仍不自动继续 ----------
{
  console.log('测试 28: classify 关闭时 agent-error 序列化失败 → 仍不自动继续');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api, { classify: false });
  await sleep(50);
  api.pushHost({ type: 'host/agent-error', sessionId: 's1', message: 'session event "turn/end" carries non-JSON-serializable data' });
  await sleep(600);
  check('未发送', api.prompts.length === 0);
  await sleep(50);
}

// ---------- 测试 29: loop guard — 短句空转触发打断并重启 ----------
{
  console.log('测试 29: 短句空转 → 打断 + 重启(loop 文本)');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api, { scanOnBoot: false, loopShortCount: 3, graceMs: 100, cooldownMs: 300, maxConsecutive: 3 });
  await sleep(50);
  api.pushMux(turnStart('s1', 1));
  await sleep(30);
  const short = (seq, text) => ({
    type: 'session/event',
    sessionId: 's1',
    event: {
      type: 'assistant/message', seq, time: Date.now(),
      data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text }] } },
    },
  });
  api.pushMux(short(10, 'Let me read.'));
  api.pushMux(short(11, 'Let me read it.'));
  api.pushMux(short(12, 'Let me read now.'));
  await sleep(150); // cancel 异步落定
  check('已调用 cancel', api.cancels.length === 1);
  check('cancel 目标会话', api.cancels[0] === 's1');
  // 打断后的 aborted 带来源标记 → 用 loop 文本重启
  api.pushMux(turnEnd('s1', 1, { kind: 'aborted', reason: { kind: 'human' } }));
  await sleep(400); // 宽限 100ms + 余量
  check('已重启发送', api.prompts.length === 1);
  check('使用 loop 文本', api.prompts[0]?.content?.[0]?.text.includes('陷入循环'));
  check('looped 统计=1', exports.readTodayStats().looped === 1);
  await sleep(50);
}

// ---------- 测试 30: loop guard — 同工具+同参数+同结果连续调用触发打断 ----------
{
  console.log('测试 30: 同工具+同参数+同结果连续调用 → 打断');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api, { scanOnBoot: false, loopToolRepeat: 3, cooldownMs: 300 });
  await sleep(50);
  api.pushMux(turnStart('s1', 1));
  await sleep(30);
  const toolResult = (seq, callId, text) => ({
    type: 'session/event', sessionId: 's1',
    event: {
      type: 'tool/result', seq, time: Date.now(),
      data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text }] }] } },
    },
  });
  for (let i = 0; i < 3; i += 1) {
    api.pushMux({
      type: 'session/event',
      sessionId: 's1',
      event: { type: 'tool/call', seq: 20 + i * 2, time: Date.now(), data: { turn: 1, step: 1, name: 'read', callId: 'c' + i, arguments: '{}' } },
    });
    api.pushMux(toolResult(21 + i * 2, 'c' + i, 'same output'));
  }
  await sleep(150);
  check('已调用 cancel', api.cancels.length === 1);
  await sleep(50);
}

// ---------- 测试 34: loop guard — 同工具同参数但结果不同 → 不触发 ----------
{
  console.log('测试 34: 同工具同参数但结果变化 → 不触发(有进展)');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api, { scanOnBoot: false, loopToolRepeat: 3, cooldownMs: 300 });
  await sleep(50);
  api.pushMux(turnStart('s1', 1));
  await sleep(30);
  const toolResult = (seq, callId, text) => ({
    type: 'session/event', sessionId: 's1',
    event: {
      type: 'tool/result', seq, time: Date.now(),
      data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text }] }] } },
    },
  });
  for (let i = 0; i < 4; i += 1) {
    api.pushMux({
      type: 'session/event',
      sessionId: 's1',
      event: { type: 'tool/call', seq: 20 + i * 2, time: Date.now(), data: { turn: 1, step: 1, name: 'read', callId: 'c' + i, arguments: '{}' } },
    });
    api.pushMux(toolResult(21 + i * 2, 'c' + i, `output changed ${i}`));
  }
  await sleep(150);
  check('未调用 cancel', api.cancels.length === 0);
  await sleep(50);
}

// ---------- 测试 35: loop guard — 短句超出时间窗 → 不触发 ----------
{
  console.log('测试 35: 短句间隔超过时间窗 → 不触发(正常思考)');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api, { scanOnBoot: false, loopShortCount: 3, loopWindowMs: 1000, cooldownMs: 300 });
  await sleep(50);
  api.pushMux(turnStart('s1', 1));
  await sleep(30);
  const short = (seq, text) => ({
    type: 'session/event', sessionId: 's1',
    event: { type: 'assistant/message', seq, time: Date.now(), data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text }] } } },
  });
  // 每条短句间隔 1500ms > 时间窗 1000ms → 计数始终被重置
  api.pushMux(short(10, 'Let me read.'));
  await sleep(1500);
  api.pushMux(short(11, 'Let me read it.'));
  await sleep(1500);
  api.pushMux(short(12, 'Let me read now.'));
  await sleep(150);
  check('未调用 cancel', api.cancels.length === 0);
  await sleep(50);
}

// ---------- 测试 31: loop guard — 长句/不同工具不触发 ----------
{
  console.log('测试 31: 长句与不同工具 → 不触发');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api, { scanOnBoot: false, loopShortCount: 3, loopToolRepeat: 3, cooldownMs: 300 });
  await sleep(50);
  api.pushMux(turnStart('s1', 1));
  await sleep(30);
  const msg = (seq, text) => ({
    type: 'session/event', sessionId: 's1',
    event: { type: 'assistant/message', seq, time: Date.now(), data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text }] } } },
  });
  // 短句 + 长句交替 → 短句计数被长句重置
  api.pushMux(msg(10, 'Let me read.'));
  api.pushMux(msg(11, '好的, 现在开始仔细分析这份文件的完整结构和每个部分的作用, 以及它们之间的相互关系。'));
  api.pushMux(msg(12, 'Let me read.'));
  api.pushMux(msg(13, 'Let me read it.'));
  // 不同工具 → 工具计数重置
  api.pushMux({ type: 'session/event', sessionId: 's1', event: { type: 'tool/call', seq: 20, time: Date.now(), data: { turn: 1, step: 1, name: 'read', callId: 'c1', arguments: '{}' } } });
  api.pushMux({ type: 'session/event', sessionId: 's1', event: { type: 'tool/call', seq: 21, time: Date.now(), data: { turn: 1, step: 1, name: 'grep', callId: 'c2', arguments: '{}' } } });
  await sleep(150);
  check('未调用 cancel', api.cancels.length === 0);
  await sleep(50);
}

// ---------- 测试 32: loop guard — 关闭开关 → 不触发 ----------
{
  console.log('测试 32: loopGuard 关闭 → 不触发');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api, { scanOnBoot: false, loopGuard: false, loopShortCount: 2, cooldownMs: 300 });
  await sleep(50);
  api.pushMux(turnStart('s1', 1));
  await sleep(30);
  const short = (seq, text) => ({
    type: 'session/event', sessionId: 's1',
    event: { type: 'assistant/message', seq, time: Date.now(), data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text }] } } },
  });
  api.pushMux(short(10, 'Let me read.'));
  api.pushMux(short(11, 'Let me read it.'));
  api.pushMux(short(12, 'Let me read now.'));
  await sleep(150);
  check('未调用 cancel', api.cancels.length === 0);
  await sleep(50);
}

// ---------- 测试 33: loop guard — 打断受冷却, 用户停止不误重启 ----------
{
  console.log('测试 33: 打断冷却与用户停止区分');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api, { scanOnBoot: false, loopShortCount: 2, graceMs: 100, cooldownMs: 300, maxConsecutive: 3 });
  await sleep(50);
  api.pushMux(turnStart('s1', 1));
  await sleep(30);
  const short = (seq, text) => ({
    type: 'session/event', sessionId: 's1',
    event: { type: 'assistant/message', seq, time: Date.now(), data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text }] } } },
  });
  api.pushMux(short(10, 'Let me read.'));
  api.pushMux(short(11, 'Let me read it.'));
  await sleep(120);
  check('已调用 cancel', api.cancels.length === 1);
  // 打断后立刻再来短句(冷却期内)→ 不再打断
  api.pushMux(short(12, 'Let me read now.'));
  api.pushMux(short(13, 'Let me read.'));
  await sleep(120);
  check('冷却期内未重复打断', api.cancels.length === 1);
  // 冷却过后新回合又循环 → 再次打断
  await sleep(400);
  api.pushMux(turnStart('s1', 2));
  await sleep(30);
  api.pushMux(short(20, 'Let me read.'));
  api.pushMux(short(21, 'Let me read it.'));
  await sleep(150);
  check('冷却后再次打断', api.cancels.length === 2);
  await sleep(50);
}


// ---------- 测试 36: loop guard — 相同短句重复触发(最强信号) ----------
{
  console.log('测试 36: 连续相同短句 → 打断');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api, { scanOnBoot: false, loopRepeatText: 3, cooldownMs: 300 });
  await sleep(50);
  api.pushMux(turnStart('s1', 1));
  await sleep(30);
  const short = (seq, text) => ({
    type: 'session/event', sessionId: 's1',
    event: { type: 'assistant/message', seq, time: Date.now(), data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text }] } } },
  });
  // 同一句话重复 3 遍(即使间隔拉长也不影响——相同短句不依赖时间窗)
  api.pushMux(short(10, 'Let me test variants of the regex to isolate the unmatched-paren issue.'));
  await sleep(200);
  api.pushMux(short(11, 'Let me test variants of the regex to isolate the unmatched-paren issue.'));
  await sleep(200);
  api.pushMux(short(12, 'Let me test variants of the regex to isolate the unmatched-paren issue.'));
  await sleep(150);
  check('已调用 cancel', api.cancels.length === 1);
  await sleep(50);
}

// ---------- 测试 37: loop guard — 相似但不完全相同的短句不触发相同信号 ----------
{
  console.log('测试 37: 措辞略有变化的短句 → 相同信号不触发');
  const api = new FakeApi();
  api.addSession('s1');
  startPlugin(api, { scanOnBoot: false, loopRepeatText: 3, loopShortCount: 99, cooldownMs: 300 });
  await sleep(50);
  api.pushMux(turnStart('s1', 1));
  await sleep(30);
  const short = (seq, text) => ({
    type: 'session/event', sessionId: 's1',
    event: { type: 'assistant/message', seq, time: Date.now(), data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text }] } } },
  });
  api.pushMux(short(10, 'Let me read the region now.'));
  api.pushMux(short(11, 'Let me read the final region now.'));
  api.pushMux(short(12, 'Let me read it now.'));
  await sleep(150);
  check('未调用 cancel', api.cancels.length === 0);
  await sleep(50);
}

process.exit(failures === 0 ? 0 : 1);
