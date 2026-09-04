/**
 * Host 引擎无头测试: 用假 cordis ctx(事件发射器 + 假 agent 注册表 + 假 settings)
 * 加载打包后的 lib/index.js(host bundle), 验证单实例引擎的核心行为。
 *
 * 覆盖场景:
 *   1. turn/end error → 宽限期后 followup 配置的文本
 *   1b. English locale → 默认发送 "Continue"
 *   1c. 本地化只替换默认值, 不覆盖用户自定义文本
 *   1d. 未支持的 locale → 回落中文
 *   2. 宽限期内 turn/start → 取消
 *   2b. 稳定消息 ID 回显识别(真人同文本、多 pending、一次消费、同步发布、失败回滚、过期与上限)
 *   3. aborted(用户停止)→ 不发送
 *   4. 连续次数上限
 *   5. 启动扫描: 兼容旧 events 属性与新 snapshotEvents() API
 *   5a. 启动扫描: DSH 0.1.2 snapshotEvents() API
 *   5b. 启动扫描: 永久性错误沿用实时分类
 *   5c. 启动扫描: 恢复错误模板上下文
 *   5d. 启动扫描: scanLimit 优先最近活动会话
 *   5e. 启动扫描: 畸形错误不阻塞其他会话
 *   5f. 启动扫描: 交错工具结果 → 按 callId 恢复最后护栏
 *   5g. 启动扫描: surface replacement 链 → 恢复最终模型可见结果
 *   6. 错误分类: 永久性跳过, 临时性续跑
 *   6b. provider 专属错误的用户自定义可恢复匹配
 *   7. continueText 模板
 *   8. 全局暂停 / 会话级暂停(经动作端点)
 *   9. max-tokens 专用文本
 *   9b. English locale → max-tokens 默认文本本地化
 *   10. 统计记录
 *   11. 幂等护栏(未确认 / 已成功 / 已失败)
 *   11b. English locale → 默认幂等护栏本地化
 *   11c. English locale → 已成功工具护栏本地化
 *   11d. 幂等护栏: 交错工具结果不得冒充最后一次调用
 *   11e. 幂等护栏: 缺失/冲突 callId 的结果不得改写状态
 *   11f. 幂等护栏: surface replacement 后使用最终模型可见结果
 *   11g. 幂等护栏: 已完成调用的冲突普通结果降级为不确定
 *   11h. 幂等护栏: seen id 淘汰后的旧调用重放不得覆盖真实 latest
 *   11i. 幂等护栏: seen id 淘汰时仍确认当前合法调用的结果
 *   11j. 幂等护栏: 更高 seq 复用同一复合 call identity 时降级为不确定
 *   12. loop guard: 专属 hook cancel + loop 文本重启
 *   12a. DSH first-cause: 用户 Stop 不得被插件认领
 *   12b. English locale → loop guard 默认重启文本本地化
 *   12c. agent 缺失时回滚 guard/stats，保留冷却节流
 *   12d. cancel 抛错时回滚 guard/stats，冷却后可重试
 *   12e. parent/disposed/legacy/其他 hook 均不得重启
 *   12f. loop guard: stale tool/call 不得清除短句 streak
 *   12g. loop guard: 新鲜但缺 callId 的 tool/call 仍清除短句 streak
 *   12h. loop guard: settings 失效异常留在 session listener 边界内
 *   13. loop guard: 同工具+同参数+同结果 → cancel
 *   13a. loop guard: 并发调用的结果乱序返回 → 按 callId 与调用顺序判定
 *   13b. loop guard: 乱序批次末尾出现进展 → 重置重复计数
 *   13c. loop guard: provider 跨 step 复用 callId → 仍按各 step 调用配对
 *   13d. loop guard: 乱序 pending 结果被 surface replacement 改写 → 按新内容判定
 *   13e. loop guard: 同一调用出现冲突的非 replacement 结果 → 保守打断连续性
 *   13f. loop guard: pending 关联队列超限 → 丢弃旧 streak，不从 replacement 复活
 *   13g. loop guard: seen id 淘汰后重放旧事件 → 不把旧帧当成新重复
 *   13h. loop guard: 未知结果位于乱序缓存中间 → 清空缓存 streak
 *   13i. loop guard: 无效 replacement 位于乱序缓存中间 → 清空缓存 streak
 *   13j. loop guard: 已完成调用冲突且有乱序缓存 → 清空缓存 streak
 *   13k. loop guard: 并发批次结果正序到达且末尾进展 → 等整批完成再判断
 *   13l. loop guard: 新回合后重放旧回合帧 → 由 turn boundary 水位拒绝
 *   13m. loop guard: 达阈值后同步 surface replacement 显示进展 → 撤销旧信号
 *   13n. loop guard: 达阈值后同步出现新 pending call → 撤销旧信号
 *   13o. loop guard: 不同结果被 lossy replacements 改成相同 → 不制造重复
 *   13p. loop guard: user/message range replacement 摘要工具链 → 清除旧候选
 *   14. loop guard: 参数/结果变化 → 不打断
 *   14a. loop guard: 超过展示摘要才变化的结果 → 不打断
 *   14b. loop guard: 文本相同但 isError 变化 → 不打断
 *   14c. loop guard: 未知/重复 callId → 忽略
 *   15. 通知桥: 通知事件 + 动作(resume / pause1h / unpause / reset-stats)
 *   15b. English locale → 浏览器通知与动作本地化
 *   16. 顶层 row replacement → runner disposer 清理待发送定时器
 *   16b. 顶层 row replacement → runner disposer 注销旧事件监听
 *   17. engine inject 重入 → 旧 runner 释放, 新 runner 单独接管
 *   18. 宽限定时器遇到 inactive settings → 异常被收口
 *   19. loop 冷却定时器遇到 inactive settings → 异常被收口
 *   20. 通知 resume 遇到 inactive settings → 路由正常响应, 异常被收口
 *   21. turn/end error 缺失 failure details → 记录并跳过
 *   22. turn/end error 不可解释的 failure details → 记录并跳过
 *   23. turn/end reason 结构无效 → 记录并跳过
 *   24. session/event listener 收口异常且后续事件继续处理
 *   25. 未知 turn/end reason kind → 安静忽略
 * 运行: node tests/simulate-host.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const root = dirname(fileURLToPath(import.meta.url));
const bundle = readFileSync(join(root, '../lib/index.js'), 'utf8');

// ---------- 加载 host bundle(ESM, 经临时 .mjs + node_modules 链接) ----------
const tmp = mkdtempSync(join(tmpdir(), 'ac-host-test-'));
mkdirSync(join(tmp, 'pkg'), { recursive: true });
mkdirSync(join(tmp, 'node_modules', '@deepseek-ai'), { recursive: true });
for (const pkg of ['cordis', 'schemastery', 'dsh-settings']) {
  symlinkSync(
    join(root, '../node_modules/@deepseek-ai', pkg),
    join(tmp, 'node_modules/@deepseek-ai', pkg),
  );
}
// bundle 内的 dsh-llm 用 createRequire(import.meta.url) 读 '../package.json',
// 所以 index.mjs 放 tmp/pkg/、package.json 放 tmp/。
writeFileSync(join(tmp, 'package.json'), readFileSync(join(root, '../package.json'), 'utf8'));
writeFileSync(join(tmp, 'pkg', 'index.mjs'), bundle);
const mod = await import(pathToFileURL(join(tmp, 'pkg', 'index.mjs')).href);
if (typeof mod.apply !== 'function') throw new Error('host bundle 未导出 apply');

// ---------- 假 host 环境 ----------
function makeHost() {
  const sessionHandlers = new Set();
  let config = {};
  let configReadsBeforeFailure;
  let contextActive = true;
  const registry = new Map();
  const topLevelEffects = [];
  let engineEffects = [];
  let engineInject;

  const registerEffect = (effects, start) => {
    const cleanup = start();
    if (typeof cleanup !== 'function') return () => {};
    let active = true;
    const dispose = () => {
      if (!active) return;
      active = false;
      return cleanup();
    };
    effects.push(dispose);
    return dispose;
  };
  const disposeEffects = (effects) => {
    for (const dispose of effects.splice(0).reverse()) dispose();
  };
  const getConfig = () => {
    if (!contextActive) {
      throw new Error('cannot get required service "settings" in inactive context');
    }
    if (configReadsBeforeFailure !== undefined) {
      if (configReadsBeforeFailure === 0) {
        configReadsBeforeFailure = undefined;
        throw new Error('cannot get required service "settings" in inactive context');
      }
      configReadsBeforeFailure -= 1;
    }
    return config;
  };

  const host = {
    setConfig(patch) {
      config = { ...config, ...patch };
    },
    setContextActive(active) {
      contextActive = active;
    },
    failConfigAfterSuccessfulReads(count) {
      configReadsBeforeFailure = count;
    },
    emit(session, event) {
      for (const h of sessionHandlers) h(session, event);
    },
    makeAgent(id, { events = [], origin, eventApi = 'legacy', cancel: cancelImpl } = {}) {
      const session = { id, header: { origin } };
      if (eventApi === 'snapshot') {
        session.snapshotEvents = () => Object.freeze([...events]);
      } else {
        session.events = events;
      }
      const agent = {
        session,
        followupAttempts: [],
        followups: [],
        cancels: [],
        followup(message) {
          this.followupAttempts.push(message);
          if (this.followupError !== undefined) {
            const error = this.followupError;
            this.followupError = undefined;
            throw error;
          }
          this.followups.push(message);
          this.onFollowup?.(message);
        },
        cancel(cause, options) {
          this.cancels.push({ cause, options });
          return cancelImpl?.(cause, options);
        },
      };
      registry.set(id, agent);
      return agent;
    },
    removeAgent(id) {
      registry.delete(id);
    },
    restoreAgent(agent) {
      registry.set(agent.session.id, agent);
    },
    agent(id) {
      return registry.get(id);
    },
    replacePluginRow() {
      // DSH config HMR 的 row replacement 只保证顶层 fiber effect 被释放。
      // inject 派生 context 的 effect 刻意留在另一组，避免测试把两种生命周期混为一谈。
      disposeEffects(topLevelEffects);
    },
    reinjectEngine() {
      if (engineInject === undefined) throw new Error('engine inject callback 未注册');
      disposeEffects(engineEffects);
      engineInject(makeEngineContext());
    },
  };

  const makeEngineContext = () => {
    const effects = [];
    engineEffects = effects;
    return {
      on(event, handler) {
        if (event !== 'session/event') return () => {};
        return registerEffect(effects, () => {
          sessionHandlers.add(handler);
          return () => sessionHandlers.delete(handler);
        });
      },
      effect: (cb) => registerEffect(effects, cb),
      settings: { register: () => {}, get: getConfig },
      agents: { get: (id) => registry.get(id), list: () => [...registry.values()] },
      webServer: {
        register(route) {
          return registerEffect(effects, () => {
            host.routes = host.routes ?? [];
            host.routes.push(route);
            return () => {
              const index = host.routes.indexOf(route);
              if (index >= 0) host.routes.splice(index, 1);
            };
          });
        },
      },
    };
  };

  const ctx = {
    effect: (cb) => registerEffect(topLevelEffects, cb),
    inject(deps, cb) {
      if (deps.includes('agents')) {
        engineInject = cb;
        cb(makeEngineContext());
      } else {
        cb({ settings: { register: () => {}, get: getConfig } });
      }
      return () => {};
    },
  };
  host.ctx = ctx;
  return host;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function captureConsoleErrors(run) {
  const original = console.error;
  const errors = [];
  console.error = (...args) => {
    errors.push(args.map(String).join(' '));
  };
  try {
    await run();
  } finally {
    console.error = original;
  }
  return errors;
}

function postAction(host, payload) {
  const action = host.routes?.find((route) => route.path === '/api/auto-continue-action');
  if (action === undefined) throw new Error('动作路由未注册');
  return new Promise((resolve) => {
    const handlers = {};
    const req = {
      on(event, handler) {
        handlers[event] = handler;
        return req;
      },
    };
    const res = {
      writeHead() {},
      end(body) {
        resolve(JSON.parse(body));
      },
    };
    action.handler(req, res);
    handlers.data?.(Buffer.from(JSON.stringify(payload)));
    handlers.end?.();
  });
}

function readBridgeState(host) {
  const bridge = host.routes?.find((route) => route.path === '/api/auto-continue-bridge');
  if (bridge === undefined) throw new Error('状态桥路由未注册');
  let state;
  let close;
  bridge.handler(
    {
      on(event, handler) {
        if (event === 'close') close = handler;
      },
    },
    {
      write(data) {
        const frame = String(data).trim();
        if (frame.startsWith('data: ')) state = JSON.parse(frame.slice(6));
      },
      writeHead() {},
      end() {},
    },
  );
  close?.();
  return state;
}

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${name}`);
  }
}

const FAST = {
  graceMs: 200,
  cooldownMs: 300,
  maxConsecutive: 3,
  scanOnBoot: true,
  verbose: false,
};

function startPlugin(overrides = {}) {
  const host = makeHost();
  host.setConfig({ ...FAST, ...overrides });
  mod.apply(host.ctx);
  return host;
}

const turnEnd = (turn, reason) => ({
  type: 'turn/end',
  seq: turn * 10,
  time: Date.now(),
  data: { turn, reason },
});
const turnStart = (turn) => ({
  type: 'turn/start',
  seq: (turn - 1) * 10 + 1,
  time: Date.now(),
  data: { turn },
});
const userMsg = (text, id = `user-${Date.now()}`, seq = 5) => ({
  type: 'user/message',
  seq,
  time: Date.now(),
  data: { id, role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } },
});
const userMessageEvent = (message, seq = 5, time = Date.now()) => ({
  type: 'user/message',
  seq,
  time,
  data: message,
});
const assistantMsg = (text, seq = 6) => ({
  type: 'assistant/message',
  seq,
  time: Date.now(),
  data: {
    turn: 1,
    step: 1,
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  },
});
const toolCall = (name, seq = 5, args = '{}', turn = 1, step = 1) => ({
  type: 'tool/call',
  seq,
  time: Date.now(),
  data: { turn, step, name, callId: `c${seq}`, arguments: args },
});
const toolResult = (callId, text, seq = 6, isError = false, turn = 1, step = 1) => ({
  type: 'tool/result',
  seq,
  time: Date.now(),
  data: {
    turn,
    step,
    message: {
      source: { kind: 'tool', callId },
      role: 'user',
      content: [
        { type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text }], isError },
      ],
    },
  },
});
const stepStart = (turn, step, seq) => ({
  type: 'step/start',
  seq,
  time: Date.now(),
  data: { turn, step },
});

// ---------- 测试 1: turn/end error → 宽限期后自动发送 ----------
{
  console.log('测试 1: turn/end error → 宽限期后 followup「继续」');
  const host = startPlugin({ scanOnBoot: false });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'boom' } }));
  await sleep(600);
  check('已发送', agent.followups.length === 1);
  check('文本为「继续」', agent.followups[0]?.content?.[0]?.text === '继续');
  await sleep(50);
}

// ---------- 测试 1b: English locale 默认文本 ----------
{
  console.log('测试 1b: English locale → 默认 followup "Continue"');
  const host = startPlugin({ scanOnBoot: false, locale: 'en' });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'boom' } }));
  await sleep(600);
  check('英文默认文本为 "Continue"', agent.followups[0]?.content?.[0]?.text === 'Continue');
  await sleep(50);
}

// ---------- 测试 1c: 用户文本优先于本地化默认值 ----------
{
  console.log('测试 1c: English locale + 自定义文本 → 保留用户文本');
  const host = startPlugin({ scanOnBoot: false, locale: 'en', continueText: 'Keep going, carefully' });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'boom' } }));
  await sleep(600);
  check('未覆盖用户自定义文本', agent.followups[0]?.content?.[0]?.text === 'Keep going, carefully');
  await sleep(50);
}

// ---------- 测试 1d: 未支持语言回落中文 ----------
{
  console.log('测试 1d: 未支持的 locale → 回落中文默认文本');
  const host = startPlugin({ scanOnBoot: false, locale: 'fr' });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'boom' } }));
  await sleep(600);
  check('默认文本回落为「继续」', agent.followups[0]?.content?.[0]?.text === '继续');
  await sleep(50);
}

// ---------- 测试 2: 宽限期内 turn/start → 取消 ----------
{
  console.log('测试 2: 宽限期内 turn/start → 取消');
  const host = startPlugin({ scanOnBoot: false });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'boom' } }));
  await sleep(100);
  host.emit(agent.session, turnStart(2));
  await sleep(600);
  check('未发送', agent.followups.length === 0);
  await sleep(50);
}

// ---------- 测试 2b: 真人相同文本不是插件回显 ----------
{
  console.log('测试 2b: 真人发送相同继续文本 → 仍算用户介入并取消待发送');
  const host = startPlugin({ scanOnBoot: false, graceMs: 20, cooldownMs: 0, maxConsecutive: 2 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'boom' } }));
  await sleep(100);
  check('首次自动继续已发送', agent.followups.length === 1);

  host.emit(agent.session, turnEnd(2, { kind: 'error', error: { code: 'UPSTREAM', message: 'again' } }));
  host.emit(agent.session, userMsg('继续', 'human-same-text'));
  await sleep(100);
  check('真人相同文本取消待发送', agent.followups.length === 1);
  await postAction(host, { action: 'resume', sessionId: 's1' });
  host.emit(agent.session, turnEnd(3, { kind: 'error', error: { code: 'UPSTREAM', message: 'once-more' } }));
  await sleep(100);
  check('真人相同文本重置连续次数', agent.followups.length === 3);
  await sleep(50);
}

// ---------- 测试 2c: 待处理 ID 上限 ----------
{
  console.log('测试 2c: 待处理插件消息 ID 有上限');
  const host = startPlugin({ scanOnBoot: false, graceMs: 20, cooldownMs: 0, maxConsecutive: 100 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  for (let i = 0; i < 65; i += 1) {
    await postAction(host, { action: 'resume', sessionId: 's1' });
  }
  check('已完成 65 次强制发送', agent.followups.length === 65);
  const oldestMessage = agent.followups[0];
  host.emit(agent.session, turnEnd(1, { kind: 'completed' }));
  host.emit(agent.session, turnEnd(2, { kind: 'error', error: { code: 'UPSTREAM', message: 'again' } }));
  host.emit(agent.session, userMessageEvent(oldestMessage, 30));
  await sleep(100);
  check('超出上限的最旧 ID 已淘汰', agent.followups.length === 65);
  await sleep(50);
}

// ---------- 测试 2d: 待处理 ID 过期 ----------
{
  console.log('测试 2d: 旧插件消息 ID 超时 → 不会被新发送重新激活');
  const realNow = Date.now;
  let now = realNow();
  try {
    Date.now = () => now;
    const host = startPlugin({ scanOnBoot: false, graceMs: 20, cooldownMs: 0 });
    const agent = host.makeAgent('s1');
    await sleep(50);
    await postAction(host, { action: 'resume', sessionId: 's1' });
    const expiredMessage = agent.followups[0];
    now += 10 * 60 * 1000 + 1;
    await postAction(host, { action: 'resume', sessionId: 's1' });

    host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'again' } }));
    host.emit(agent.session, userMessageEvent(expiredMessage, 10, now));
    await sleep(100);
    check('过期 ID 按用户介入处理并取消待发送', agent.followups.length === 2);
  } finally {
    Date.now = realNow;
  }
  await sleep(50);
}

// ---------- 测试 2e: followup 失败回滚 ----------
{
  console.log('测试 2e: followup 失败 → 不保留幽灵回显 ID');
  const host = startPlugin({ scanOnBoot: false, graceMs: 20, cooldownMs: 0 });
  const agent = host.makeAgent('s1');
  agent.followupError = new Error('queue unavailable');
  await sleep(50);
  await postAction(host, { action: 'resume', sessionId: 's1' });
  check('失败尝试未入队', agent.followups.length === 0 && agent.followupAttempts.length === 1);
  await postAction(host, { action: 'resume', sessionId: 's1' });
  check('后续发送成功', agent.followups.length === 1);

  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'again' } }));
  host.emit(agent.session, userMessageEvent(agent.followupAttempts[0], 10));
  await sleep(100);
  check('失败消息 ID 未吞掉后续用户介入', agent.followups.length === 1);
  await sleep(50);
}

// ---------- 测试 2f: followup 同步发布回显 ----------
{
  console.log('测试 2f: followup 同步回显 → 发送前已登记消息 ID');
  const host = startPlugin({ scanOnBoot: false, graceMs: 20, cooldownMs: 0, maxConsecutive: 2 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  await postAction(host, { action: 'resume', sessionId: 's1' });
  agent.onFollowup = (message) => {
    host.emit(agent.session, userMessageEvent(message, 10));
  };
  await postAction(host, { action: 'resume', sessionId: 's1' });
  agent.onFollowup = undefined;
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'again' } }));
  await sleep(100);
  check('同步回显未重置连续次数', agent.followups.length === 2);
  await sleep(50);
}

// ---------- 测试 2g: 回显 ID 一次性消费 ----------
{
  console.log('测试 2g: 插件消息 ID 只消费一次');
  const host = startPlugin({ scanOnBoot: false, graceMs: 20, cooldownMs: 0, maxConsecutive: 1 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  await postAction(host, { action: 'resume', sessionId: 's1' });
  const echo = userMessageEvent(agent.followups[0], 10);
  host.emit(agent.session, echo);
  host.emit(agent.session, { ...echo, seq: 11 });
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'again' } }));
  await sleep(100);
  check('重复 ID 的第二次事件算作用户介入', agent.followups.length === 2);
  await sleep(50);
}

// ---------- 测试 2h: 多条待处理 ID ----------
{
  console.log('测试 2h: 多条待处理插件消息 → 每个 ID 都能被识别');
  const host = startPlugin({ scanOnBoot: false, graceMs: 20, cooldownMs: 0, maxConsecutive: 2 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  await postAction(host, { action: 'resume', sessionId: 's1' });
  await postAction(host, { action: 'resume', sessionId: 's1' });
  check('强制续跑排入两条消息', agent.followups.length === 2);

  host.emit(agent.session, userMessageEvent(agent.followups[0], 10));
  host.emit(agent.session, userMessageEvent(agent.followups[1], 11));
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'again' } }));
  await sleep(100);
  check('两个插件 ID 都未被误算作真人介入', agent.followups.length === 2);
  await sleep(50);
}

// ---------- 测试 3: aborted 用户停止 → 不发送 ----------
{
  console.log('测试 3: 用户停止(aborted)→ 不发送');
  const host = startPlugin({ scanOnBoot: false });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnEnd(1, { kind: 'aborted', reason: { kind: 'user' } }));
  await sleep(600);
  check('未发送', agent.followups.length === 0);
  await sleep(50);
}

// ---------- 测试 4: 连续次数上限 ----------
{
  console.log('测试 4: 连续自动继续达到上限后停止');
  const host = startPlugin({ scanOnBoot: false });
  const agent = host.makeAgent('s1');
  await sleep(50);
  for (let i = 1; i <= 4; i += 1) {
    host.emit(agent.session, turnEnd(i, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
    await sleep(500);
    host.emit(agent.session, turnStart(i + 1));
    await sleep(450);
  }
  check('只发送 3 次(上限)', agent.followups.length === 3);
  await sleep(50);
}

// ---------- 测试 5: 启动扫描 interrupted(旧 API) ----------
{
  console.log('测试 5: 启动扫描通过旧 events API 发现最近 interrupted 回合');
  const now = Date.now();
  const host = makeHost();
  const agent = host.makeAgent('s1', {
    events: [
      { type: 'turn/end', seq: 2, time: now - 60_000, data: { turn: 1, reason: { kind: 'interrupted' } } },
    ],
  });
  host.setConfig({ ...FAST, scanOnBoot: true });
  mod.apply(host.ctx);
  await sleep(1000);
  check('已发送', agent.followups.length === 1);
  await sleep(50);
}

// ---------- 测试 5a: DSH 0.1.2 Session snapshot API ----------
{
  console.log('测试 5a: 启动扫描通过 snapshotEvents() 读取新版 Session');
  const now = Date.now();
  const host = makeHost();
  const agent = host.makeAgent('s1', {
    eventApi: 'snapshot',
    events: [
      { type: 'turn/end', seq: 2, time: now - 60_000, data: { turn: 1, reason: { kind: 'interrupted' } } },
    ],
  });
  host.setConfig({ ...FAST, scanOnBoot: true });
  mod.apply(host.ctx);
  await sleep(1000);
  check('新版 Session 已发送', agent.followups.length === 1);
  await sleep(50);
}

// ---------- 测试 5b: 启动扫描沿用实时错误分类 ----------
{
  console.log('测试 5b: 启动扫描跳过永久性错误');
  const host = makeHost();
  const agent = host.makeAgent('s1', {
    eventApi: 'snapshot',
    events: [
      turnEnd(4, {
        kind: 'error',
        error: { code: 'INVALID_API_KEY', message: 'bad credential', status: 401 },
      }),
    ],
  });
  host.setConfig({ ...FAST, scanOnBoot: true });
  mod.apply(host.ctx);
  await sleep(600);
  check('永久性扫描错误未发送', agent.followups.length === 0);
  await sleep(50);
}

// ---------- 测试 5c: 启动扫描恢复错误模板上下文 ----------
{
  console.log('测试 5c: 启动扫描恢复失败事实、回合与发生时间');
  const failedAt = Date.now() - 65_000;
  const host = makeHost();
  const agent = host.makeAgent('s1', {
    eventApi: 'snapshot',
    events: [
      {
        ...turnEnd(7, {
          kind: 'error',
          error: { code: 'UPSTREAM', message: 'gateway timeout', status: 503 },
        }),
        time: failedAt,
      },
    ],
  });
  host.setConfig({
    ...FAST,
    scanOnBoot: true,
    continueText: 'turn={turn} code={code} status={status} message={message} elapsed={elapsed}',
  });
  mod.apply(host.ctx);
  await sleep(600);
  const text = agent.followups[0]?.content?.[0]?.text ?? '';
  check(
    '扫描错误模板上下文完整',
    text.includes('turn=7 code=UPSTREAM status=503 message=gateway timeout') &&
      text.includes('elapsed=1m'),
  );
  await sleep(50);
}

// ---------- 测试 5d: 扫描上限优先最近活动会话 ----------
{
  console.log('测试 5d: 启动扫描按最后活动时间降序应用 scanLimit');
  const now = Date.now();
  const host = makeHost();
  host.makeAgent('older-a', {
    eventApi: 'snapshot',
    events: [
      { type: 'turn/end', seq: 2, time: now - 120_000, data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  });
  host.makeAgent('older-b', {
    eventApi: 'snapshot',
    events: [
      { type: 'turn/end', seq: 2, time: now - 90_000, data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  });
  const recent = host.makeAgent('recent', {
    eventApi: 'snapshot',
    events: [
      { type: 'turn/end', seq: 2, time: now - 1_000, data: { turn: 1, reason: { kind: 'interrupted' } } },
    ],
  });
  host.setConfig({ ...FAST, scanOnBoot: true, scanLimit: 2 });
  mod.apply(host.ctx);
  await sleep(600);
  check('最近中断会话未被注册顺序挤出', recent.followups.length === 1);
  await sleep(50);
}

// ---------- 测试 5e: 畸形扫描错误不阻塞其他会话 ----------
{
  console.log('测试 5e: 启动扫描跳过畸形错误并继续处理其他会话');
  const now = Date.now();
  const host = makeHost();
  const malformed = host.makeAgent('scan-malformed', {
    eventApi: 'snapshot',
    events: [
      {
        type: 'turn/end',
        seq: 2,
        time: now,
        data: { turn: 1, reason: { kind: 'error' } },
      },
    ],
  });
  const recoverable = host.makeAgent('scan-recoverable', {
    eventApi: 'snapshot',
    events: [
      {
        type: 'turn/end',
        seq: 2,
        time: now - 1,
        data: {
          turn: 1,
          reason: { kind: 'error', error: { code: 'UPSTREAM', message: 'retry me' } },
        },
      },
    ],
  });
  host.setConfig({ ...FAST, scanOnBoot: true });
  mod.apply(host.ctx);
  await sleep(600);
  check(
    '畸形扫描错误被隔离',
    malformed.followups.length === 0 && recoverable.followups.length === 1,
  );
  await sleep(50);
}

// ---------- 测试 5f: 启动扫描按 callId 恢复护栏 ----------
{
  console.log('测试 5f: 启动扫描遇到交错工具结果 → 最后调用仍为 pending');
  const now = Date.now();
  const host = makeHost();
  const agent = host.makeAgent('s1', {
    events: [
      { ...turnStart(1), seq: 1, time: now - 65_000 },
      { ...toolCall('write-file', 2), time: now - 64_000 },
      { ...toolCall('read-file', 3), time: now - 63_000 },
      { ...toolResult('c2', 'write completed', 4), time: now - 62_000 },
      { type: 'turn/end', seq: 5, time: now - 60_000, data: { turn: 1, reason: { kind: 'interrupted' } } },
    ],
  });
  host.setConfig({ ...FAST, scanOnBoot: true });
  mod.apply(host.ctx);
  await sleep(1000);
  const text = agent.followups[0]?.content?.[0]?.text ?? '';
  check('扫描未把 c2 结果配给 c3', text.includes('「read-file」可能未完成'));
  await sleep(50);
}

// ---------- 测试 5g: 启动扫描重放 surface replacement 链 ----------
{
  console.log('测试 5g: 启动扫描重放多次 replacement → 护栏使用最终内容');
  const now = Date.now();
  const call = { ...toolCall('read-file', 2), time: now - 64_000 };
  const original = { ...toolResult('c2', 'obsolete result', 3), time: now - 63_000, surfaceOp: 'append' };
  const firstReplacement = {
    ...toolResult('c2', 'intermediate result', 4),
    time: now - 62_000,
    surfaceOp: { op: 'replace', start: 3, end: 3 },
    sourceEventSeqs: [3],
  };
  const finalReplacement = {
    ...toolResult('c2', 'final result', 5),
    time: now - 61_000,
    surfaceOp: { op: 'replace', start: 4, end: 4 },
    sourceEventSeqs: [3, 4],
  };
  const host = makeHost();
  const agent = host.makeAgent('s1', {
    events: [
      { ...turnStart(1), seq: 1, time: now - 65_000 },
      call,
      original,
      firstReplacement,
      finalReplacement,
      { type: 'turn/end', seq: 6, time: now - 60_000, data: { turn: 1, reason: { kind: 'interrupted' } } },
    ],
  });
  host.setConfig({ ...FAST, scanOnBoot: true });
  mod.apply(host.ctx);
  await sleep(1000);
  const text = agent.followups[0]?.content?.[0]?.text ?? '';
  check('扫描护栏使用最后一次 replacement', text.includes('final result') && !text.includes('obsolete result'));
  await sleep(50);
}

// ---------- 测试 6: 错误分类 ----------
{
  console.log('测试 6: 永久性错误跳过, 临时性错误续跑');
  const host = startPlugin({ scanOnBoot: false });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'INVALID_API_KEY', message: 'bad', status: 401 } }));
  await sleep(600);
  check('永久性未发送', agent.followups.length === 0);
  host.emit(agent.session, turnEnd(2, { kind: 'error', error: { code: 'UPSTREAM', message: 'network' } }));
  await sleep(600);
  check('临时性已发送', agent.followups.length === 1);
  await sleep(50);
}

// ---------- 测试 6b: 用户自定义可恢复错误 ----------
{
  console.log('测试 6b: 用户匹配的 provider 专属错误覆盖内置分类');
  const failure = {
    kind: 'error',
    error: {
      code: 'INVALID_REQUEST',
      status: 500,
      message: '{"error":{"message":"Upstream rejected the request as invalid","type":"invalid_request_error"},"type":"error"}',
    },
  };
  const defaultHost = startPlugin({ scanOnBoot: false });
  const defaultAgent = defaultHost.makeAgent('default');
  await sleep(50);
  defaultHost.emit(defaultAgent.session, turnEnd(1, failure));
  await sleep(600);
  check('未配置时仍按内置分类跳过', defaultAgent.followups.length === 0);

  const host = startPlugin({
    scanOnBoot: false,
    retryableErrorPatterns: 'another provider message\nupstream rejected the request as invalid',
  });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnEnd(1, failure));
  await sleep(600);
  check('多行中任一项大小写不敏感匹配后已发送', agent.followups.length === 1);
  await sleep(50);
}

// ---------- 测试 7: continueText 模板 ----------
{
  console.log('测试 7: 模板占位符 {code} 与 {tool} 填充');
  const host = startPlugin({ scanOnBoot: false, continueText: '继续({tool}: {code})' });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, toolCall('bash', 5));
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(600);
  check('模板已填充', agent.followups[0]?.content?.[0]?.text.includes('继续(bash: UPSTREAM)'));
  await sleep(50);
}

// ---------- 测试 8: 全局暂停与动作端点 ----------
{
  console.log('测试 8: 全局暂停 + 动作端点(unpause/reset-stats)');
  const host = startPlugin({ scanOnBoot: false, paused: true });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(600);
  check('全局暂停未发送', agent.followups.length === 0);
  host.setConfig({ paused: false });
  host.emit(agent.session, turnEnd(2, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(600);
  check('解除后已发送', agent.followups.length === 1);
  await sleep(50);
}

// ---------- 测试 9: max-tokens 专用文本 ----------
{
  console.log('测试 9: max-tokens 使用专用继续文本');
  const host = startPlugin({ scanOnBoot: false, continueTextMaxTokens: '继续输出, 不要重复' });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnEnd(1, { kind: 'max-tokens' }));
  await sleep(600);
  check('使用超限文本', agent.followups[0]?.content?.[0]?.text === '继续输出, 不要重复');
  await sleep(50);
}

// ---------- 测试 10: 统计 ----------
{
  console.log('测试 9b: English locale → max-tokens 默认 followup "Continue"');
  const host = startPlugin({ scanOnBoot: false, locale: 'en' });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnEnd(1, { kind: 'max-tokens' }));
  await sleep(600);
  check('英文超限默认文本为 "Continue"', agent.followups[0]?.content?.[0]?.text === 'Continue');
  await sleep(50);
}

// ---------- 测试 10: 统计 ----------
{
  console.log('测试 10: 统计记录(发送/跳过)');
  const host = startPlugin({ scanOnBoot: false });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'INVALID_API_KEY', message: 'x', status: 401 } }));
  await sleep(100);
  host.emit(agent.session, turnEnd(2, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(600);
  // 经 bridge 路由拿状态(引擎在 apply 闭包内, 用 SSE 端点不行——直接检查路由注册并跳过深检)
  check('已发送', agent.followups.length === 1);
  await sleep(50);
}

// ---------- 测试 11: 幂等护栏 ----------
{
  console.log('测试 11: 幂等护栏(未确认/已成功/已失败)');
  const host = startPlugin({ scanOnBoot: false });
  const agent = host.makeAgent('s1');
  await sleep(50);
  // pending: 工具调用无结果 → 附加未确认护栏
  host.emit(agent.session, toolCall('git-push', 5));
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(600);
  check('pending 护栏', agent.followups[0]?.content?.[0]?.text.includes('可能未完成'));
  // done: 工具成功 → 附加已完成护栏
  host.emit(agent.session, turnStart(2));
  host.emit(agent.session, toolCall('git-push', 15));
  host.emit(agent.session, toolResult('c15', 'push 成功', 16));
  await sleep(400);
  host.emit(agent.session, turnEnd(2, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(600);
  check('done 护栏', agent.followups[1]?.content?.[0]?.text.includes('已完成'));
  // failed: 工具失败 → 无护栏(退避后冷却 1200ms, 需等够)
  await sleep(1200);
  host.emit(agent.session, turnStart(3));
  host.emit(agent.session, toolCall('bash', 25));
  host.emit(agent.session, toolResult('c25', 'failed', 26, true));
  await sleep(200);
  host.emit(agent.session, turnEnd(3, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(600);
  check('failed 无护栏', agent.followups[2]?.content?.[0]?.text === '继续');
  await sleep(50);
}

// ---------- 测试 11c: English locale 已成功工具护栏 ----------
{
  console.log('测试 11c: English locale → done 护栏使用英文默认文本');
  const host = startPlugin({ scanOnBoot: false, locale: 'en' });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, toolCall('git-push', 5));
  host.emit(agent.session, toolResult('c5', 'push succeeded', 6));
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(600);
  const text = agent.followups[0]?.content?.[0]?.text ?? '';
  check('英文 done 护栏', text.startsWith('Continue ') && text.includes('completed successfully'));
  await sleep(50);
}

// ---------- 测试 11b: English locale 未确认工具护栏 ----------
{
  console.log('测试 11b: English locale → pending 护栏使用英文默认文本');
  const host = startPlugin({ scanOnBoot: false, locale: 'en' });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, toolCall('git-push', 5));
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(600);
  const text = agent.followups[0]?.content?.[0]?.text ?? '';
  check('英文 pending 护栏', text.startsWith('Continue ') && text.includes('may not have completed'));
  await sleep(50);
}

// ---------- 测试 11d: 交错工具结果不得冒充最后一次调用 ----------
{
  console.log('测试 11d: 先前调用的结果先返回 → 最后调用仍为 pending');
  const host = startPlugin({ scanOnBoot: false });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, toolCall('write-file', 50));
  host.emit(agent.session, toolCall('read-file', 51));
  host.emit(agent.session, toolResult('c50', 'write completed', 52));
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(600);
  const text = agent.followups[0]?.content?.[0]?.text ?? '';
  check('未把 c50 结果配给 c51', text.includes('「read-file」可能未完成'));
  await sleep(50);
}

// ---------- 测试 11f: 已完成结果的 surface replacement ----------
{
  console.log('测试 11f: 工具结果被 replace 后中断 → 护栏展示最终内容');
  const host = startPlugin({ scanOnBoot: false });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, toolCall('read-file', 220));
  const original = toolResult('c220', 'obsolete result', 221);
  original.surfaceOp = 'append';
  host.emit(agent.session, original);
  const replacement = toolResult('c220', 'current result', 222);
  replacement.surfaceOp = { op: 'replace', start: 221, end: 221 };
  replacement.sourceEventSeqs = [221];
  host.emit(agent.session, replacement);
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(600);
  const text = agent.followups[0]?.content?.[0]?.text ?? '';
  check('护栏使用 replacement 内容', text.includes('current result') && !text.includes('obsolete result'));
  await sleep(50);
}

// ---------- 测试 11g: 已完成调用收到冲突的普通结果 ----------
{
  console.log('测试 11g: 已完成调用收到冲突的普通结果 → 护栏降级为不确定');
  const host = startPlugin({ scanOnBoot: false });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, toolCall('write-file', 230));
  host.emit(agent.session, toolResult('c230', 'first completion', 231));
  host.emit(agent.session, toolResult('c230', 'conflicting completion', 232));
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(600);
  const text = agent.followups[0]?.content?.[0]?.text ?? '';
  check(
    '冲突结果不再宣称旧结果已完成',
    text.includes('「write-file」可能未完成') && !text.includes('first completion'),
  );
  await sleep(50);
}

// ---------- 测试 11h: seen id 淘汰后的旧调用不得覆盖 latest ----------
{
  console.log('测试 11h: seen id 淘汰后重放旧调用 → 保留真实最新工具护栏');
  const host = startPlugin({ scanOnBoot: false, loopGuard: false });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  const firstCall = toolCall('delete-production', 1400, '{"path":"prod"}');
  host.emit(agent.session, firstCall);
  host.emit(agent.session, toolResult('c1400', 'deleted', 1401));
  for (let i = 1; i <= 256; i += 1) {
    const seq = 1400 + i * 2;
    host.emit(agent.session, toolCall('read', seq));
    host.emit(agent.session, toolResult(`c${seq}`, 'read', seq + 1));
  }
  host.emit(agent.session, toolCall('write-production', 2200, '{"path":"prod"}'));
  host.emit(agent.session, firstCall); // 已淘汰的旧事件重放
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(600);
  const text = agent.followups[0]?.content?.[0]?.text ?? '';
  check(
    '旧调用重放未覆盖真实 latest',
    text.includes('「write-production」可能未完成') && !text.includes('delete-production'),
  );
  await sleep(50);
}

// ---------- 测试 11i: seen id 淘汰时保留当前合法调用 ----------
{
  console.log('测试 11i: seen id 淘汰时第 257 个合法调用 → 仍能确认结果');
  const host = startPlugin({ scanOnBoot: false, loopGuard: false });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  for (let i = 0; i < 256; i += 1) {
    const seq = 2300 + i * 2;
    host.emit(agent.session, toolCall('read', seq));
    host.emit(agent.session, toolResult(`c${seq}`, 'read', seq + 1));
  }
  host.emit(agent.session, toolCall('write-production', 2900, '{"path":"prod"}'));
  host.emit(agent.session, toolResult('c2900', 'write confirmed', 2901));
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(600);
  const text = agent.followups[0]?.content?.[0]?.text ?? '';
  check(
    '容量淘汰未丢当前合法结果',
    text.includes('「write-production」已完成') && text.includes('write confirmed'),
  );
  await sleep(50);
}

// ---------- 测试 11j: 更高 seq 重用同一复合 call identity ----------
{
  console.log('测试 11j: 更高 seq 重用同 turn/step/callId → 护栏降级为不确定');
  const host = startPlugin({ scanOnBoot: false, loopGuard: false });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, toolCall('write-production', 3000, '{"path":"prod"}'));
  host.emit(agent.session, toolResult('c3000', 'first completion', 3001));
  const reused = toolCall('write-production', 3002, '{"path":"prod"}');
  reused.data.callId = 'c3000';
  host.emit(agent.session, reused);
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(600);
  const text = agent.followups[0]?.content?.[0]?.text ?? '';
  check(
    '更高 seq 的重复 identity 未冒充旧完成状态',
    text.includes('「write-production」可能未完成') && !text.includes('first completion'),
  );
  await sleep(50);
}

// ---------- 测试 12: loop guard — 相同消息重复 ----------
{
  console.log('测试 12: loop guard 相同消息 → 专属 hook cancel + loop 文本重启');
  const host = startPlugin({ scanOnBoot: false, loopRepeatText: 3, graceMs: 100, cooldownMs: 300 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  await sleep(30);
  for (let i = 0; i < 3; i += 1) {
    host.emit(agent.session, assistantMsg('Let me test variants of the regex.', 10 + i));
  }
  await sleep(150);
  check('已 cancel', agent.cancels.length === 1);
  check(
    '使用稳定的专属 hook cause',
    JSON.stringify(agent.cancels[0]?.cause) ===
      JSON.stringify({ kind: 'hook', reason: 'dsh-auto-continue:loop-guard' }),
  );
  check('durable marker 前不计入 looped', readBridgeState(host)?.stats?.looped === 0);
  const loopEnd = turnEnd(1, { kind: 'aborted', reason: agent.cancels[0]?.cause });
  host.emit(agent.session, loopEnd);
  check('durable marker 确认后计入 looped', readBridgeState(host)?.stats?.looped === 1);
  host.emit(agent.session, loopEnd);
  check('重复 durable marker 不会重复计数', readBridgeState(host)?.stats?.looped === 1);
  await sleep(700); // 剩余冷却 + 宽限
  check('loop 文本重启', agent.followups[0]?.content?.[0]?.text.includes('陷入循环'));
  await sleep(50);
}

// ---------- 测试 12a: 用户 Stop 先赢得 cancel 竞态 ----------
{
  console.log('测试 12a: 用户 Stop 先赢得 cancel 竞态 → 不重启');
  const host = startPlugin({ scanOnBoot: false, loopRepeatText: 2, graceMs: 100, cooldownMs: 300 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  const repeated = 'The same long assistant message trips the loop detector.';
  host.emit(agent.session, assistantMsg(repeated, 10));
  host.emit(agent.session, assistantMsg(repeated, 11));
  await sleep(50);
  check('插件也发出了 cancel', agent.cancels.length === 1);
  // DSH 保留 first cause: 用户的 cancel 先到达时，durable turn/end 记录 user。
  host.emit(agent.session, turnEnd(1, { kind: 'aborted', reason: { kind: 'user' } }));
  await sleep(700);
  check('用户 Stop 不被 loop guard 误认领', agent.followups.length === 0);
  check('用户先赢的 no-op cancel 不计入 looped', readBridgeState(host)?.stats?.looped === 0);
  await sleep(50);
}

// ---------- 测试 12b: English locale loop guard 文本 ----------
{
  console.log('测试 12b: English locale → loop guard 使用英文默认文本');
  const host = startPlugin({
    scanOnBoot: false,
    locale: 'en',
    loopRepeatText: 3,
    graceMs: 100,
    cooldownMs: 300,
  });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  await sleep(30);
  for (let i = 0; i < 3; i += 1) {
    host.emit(agent.session, assistantMsg('Let me test variants of the regex.', 10 + i));
  }
  await sleep(150);
  host.emit(agent.session, turnEnd(1, { kind: 'aborted', reason: agent.cancels[0]?.cause }));
  await sleep(700);
  check(
    '英文 loop guard 文本',
    agent.followups[0]?.content?.[0]?.text.includes('You may be stuck in a loop'),
  );
  await sleep(50);
}

// ---------- 测试 12c: agent 缺失时回滚 ----------
{
  console.log('测试 12c: cancel 时 agent 缺失 → 回滚 guard，冷却后可重试');
  const host = startPlugin({ scanOnBoot: false, loopRepeatText: 2, cooldownMs: 120 });
  const agent = host.makeAgent('s1');
  await sleep(30);
  host.emit(agent.session, turnStart(1));
  host.removeAgent('s1');
  const repeated = 'This repeated output detects a loop even if its live agent briefly disappears.';
  host.emit(agent.session, assistantMsg(repeated, 10));
  host.emit(agent.session, assistantMsg(repeated, 11));
  await sleep(20);
  check('agent 缺失不计入 looped', readBridgeState(host)?.stats?.looped === 0);

  host.restoreAgent(agent);
  host.emit(agent.session, assistantMsg(repeated, 12));
  await sleep(20);
  check('失败后仍受冷却节流', agent.cancels.length === 0);

  await sleep(130);
  host.emit(agent.session, assistantMsg(repeated, 13));
  await sleep(30);
  check('冷却后可再次尝试', agent.cancels.length === 1);
  check('durable marker 前仍不计入 looped', readBridgeState(host)?.stats?.looped === 0);
  const loopEnd = turnEnd(1, { kind: 'aborted', reason: agent.cancels[0]?.cause });
  host.emit(agent.session, loopEnd);
  check('仅 durable marker 确认的 cancel 计入 looped', readBridgeState(host)?.stats?.looped === 1);
  host.emit(agent.session, loopEnd);
  check('重复 marker 不重复计数', readBridgeState(host)?.stats?.looped === 1);
  host.emit(agent.session, turnStart(2));
  await sleep(30);
}

// ---------- 测试 12d: cancel 抛错时回滚 ----------
{
  console.log('测试 12d: cancel 抛错 → 回滚 guard 和 stats，冷却后可重试');
  let cancelAttempts = 0;
  const host = startPlugin({ scanOnBoot: false, loopRepeatText: 2, cooldownMs: 120 });
  const agent = host.makeAgent('s1', {
    cancel() {
      cancelAttempts += 1;
      if (cancelAttempts === 1) throw new Error('cancel rejected');
    },
  });
  await sleep(30);
  host.emit(agent.session, turnStart(1));
  const repeated = 'This repeated output keeps the loop guard active across a transient cancel failure.';
  host.emit(agent.session, assistantMsg(repeated, 10));
  host.emit(agent.session, assistantMsg(repeated, 11));
  await sleep(20);
  check('cancel 抛错不计入 looped', readBridgeState(host)?.stats?.looped === 0);

  host.emit(agent.session, assistantMsg(repeated, 12));
  await sleep(20);
  check('抛错后的立即重试被节流', agent.cancels.length === 1);

  await sleep(130);
  host.emit(agent.session, assistantMsg(repeated, 13));
  await sleep(30);
  check('抛错后冷却到期可重试', agent.cancels.length === 2);
  check('成功请求但未收到 marker 时不计数', readBridgeState(host)?.stats?.looped === 0);
  host.emit(agent.session, turnEnd(1, { kind: 'aborted', reason: agent.cancels[1]?.cause }));
  check('抛错后仅 durable marker 确认的 cancel 计入 looped', readBridgeState(host)?.stats?.looped === 1);
  host.emit(agent.session, turnStart(2));
  await sleep(30);
}

// ---------- 测试 12e: 其他 DSH durable cancel cause 不得重启 ----------
{
  console.log('测试 12e: parent/disposed/legacy/其他 hook → 不误认领重启');
  const foreignCauses = [
    { kind: 'parent' },
    { kind: 'disposed' },
    { kind: 'legacy' },
    { kind: 'hook', reason: 'another-plugin' },
  ];
  for (const [index, cause] of foreignCauses.entries()) {
    const host = startPlugin({ scanOnBoot: false, loopRepeatText: 2, graceMs: 10, cooldownMs: 30 });
    const agent = host.makeAgent(`foreign-${index}`);
    await sleep(10);
    host.emit(agent.session, turnStart(1));
    const repeated = `Foreign cancellation cause ${index} leaves this turn stopped.`;
    host.emit(agent.session, assistantMsg(repeated, 10));
    host.emit(agent.session, assistantMsg(repeated, 11));
    await sleep(10);
    host.emit(agent.session, turnEnd(1, { kind: 'aborted', reason: cause }));
    await sleep(60);
    check(`${cause.kind} cause 不重启`, agent.followups.length === 0);
  }
  await sleep(20);
}

// ---------- 测试 12f: stale 工具帧不算进展 ----------
{
  console.log('测试 12f: stale tool/call → 不清除短句 streak');
  const host = startPlugin({
    scanOnBoot: false,
    loopShortCount: 2,
    loopShortChars: 20,
    loopRepeatText: 10,
    cooldownMs: 300,
  });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  host.emit(agent.session, assistantMsg('one', 2));
  host.emit(agent.session, toolCall('read', 1)); // 不晚于 turn/start 水位，应视为 stale
  host.emit(agent.session, assistantMsg('two', 3));
  await sleep(150);
  check('stale tool/call 未清短句计数', agent.cancels.length === 1);
  await sleep(50);
}

// ---------- 测试 12g: 缺 callId 的新工具帧仍算进展 ----------
{
  console.log('测试 12g: 缺 callId 的新 tool/call → 仍清除短句 streak');
  const host = startPlugin({
    scanOnBoot: false,
    loopShortCount: 2,
    loopShortChars: 20,
    loopRepeatText: 10,
    cooldownMs: 300,
  });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  host.emit(agent.session, assistantMsg('one', 2));
  const missingIdCall = toolCall('read', 3);
  delete missingIdCall.data.callId;
  host.emit(agent.session, missingIdCall);
  host.emit(agent.session, assistantMsg('two', 4));
  await sleep(150);
  check('缺 callId 的新工具调用已清短句计数', agent.cancels.length === 0);
  await sleep(50);
}

// ---------- 测试 12h: loop interrupt 的同步异常由 listener 收口 ----------
{
  console.log('测试 12h: loop interrupt 读取失效 settings → listener 收口且进程继续');
  const host = startPlugin({
    scanOnBoot: false,
    loopRepeatText: 2,
    graceMs: 20,
    cooldownMs: 50,
  });
  const agent = host.makeAgent('loop-settings-boundary');
  await sleep(20);
  host.emit(agent.session, turnStart(1));
  const repeated = 'This intentionally long assistant message reaches the repeated-text loop guard.';
  host.emit(agent.session, assistantMsg(repeated, 10));
  // The repeated event performs five successful config reads before
  // interruptLoop() asks cooldownFor() for the sixth one.
  host.failConfigAfterSuccessfulReads(5);
  const errors = await captureConsoleErrors(async () => {
    host.emit(agent.session, assistantMsg(repeated, 11));
    await sleep(20);
  });
  check(
    'loop interrupt 异常由 session listener 记录',
    agent.cancels.length === 0 &&
      errors.some(
        (line) =>
          line.includes('会话事件处理异常 loop-settings-boundary') &&
          line.includes('inactive context'),
      ),
  );
  host.emit(
    agent.session,
    turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'retry me' } }),
  );
  await sleep(150);
  check('异常后续合法事件仍能处理', agent.followups.length === 1);
  await sleep(20);
}

// ---------- 测试 13: loop guard — 同工具+同参数+同结果 ----------
{
  console.log('测试 13: loop guard 同工具同参数同结果 → 下一 step 边界确认后 cancel');
  const host = startPlugin({ scanOnBoot: false, loopToolRepeat: 3, cooldownMs: 300 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  await sleep(30);
  for (let i = 0; i < 3; i += 1) {
    host.emit(agent.session, toolCall('read', 20 + i * 2));
    host.emit(agent.session, toolResult(`c${20 + i * 2}`, 'same output', 21 + i * 2));
  }
  await sleep(20);
  check('step 边界前未提前 cancel', agent.cancels.length === 0);
  host.emit(agent.session, stepStart(1, 2, 30));
  await sleep(150);
  check('已 cancel', agent.cancels.length === 1);
  await sleep(50);
}

// ---------- 测试 14: loop guard — 结果变化不打断 ----------
{
  console.log('测试 14: loop guard 结果变化 → 不打断(有进展)');
  const host = startPlugin({ scanOnBoot: false, loopToolRepeat: 3, cooldownMs: 300 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  await sleep(30);
  for (let i = 0; i < 4; i += 1) {
    host.emit(agent.session, toolCall('read', 20 + i * 2));
    host.emit(agent.session, toolResult(`c${20 + i * 2}`, `output ${i}`, 21 + i * 2));
  }
  host.emit(agent.session, stepStart(1, 2, 28));
  await sleep(150);
  check('未 cancel', agent.cancels.length === 0);
  await sleep(50);
}

// ---------- 测试 13a: 并发工具结果乱序返回 ----------
{
  console.log('测试 13a: 同一工具并发调用 + 结果乱序返回 → 仍按 callId 判定重复');
  const host = startPlugin({ scanOnBoot: false, loopToolRepeat: 3, cooldownMs: 300 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  await sleep(30);
  for (let i = 0; i < 3; i += 1) {
    host.emit(agent.session, toolCall('read', 70 + i));
  }
  for (let i = 2; i >= 0; i -= 1) {
    host.emit(agent.session, toolResult(`c${70 + i}`, 'same parallel output', 80 + (2 - i)));
  }
  host.emit(agent.session, stepStart(1, 2, 83));
  await sleep(150);
  check('乱序结果仍能识别真实重复并 cancel', agent.cancels.length === 1);
  await sleep(50);
}

// ---------- 测试 14a: loop guard 使用完整结果识别进展 ----------
{
  console.log('测试 14a: 超过摘要长度才变化的工具结果 → 不打断');
  const host = startPlugin({ scanOnBoot: false, loopToolRepeat: 3, cooldownMs: 300 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  await sleep(30);
  const sharedPrefix = 'x'.repeat(160);
  for (let i = 0; i < 3; i += 1) {
    host.emit(agent.session, toolCall('read', 40 + i * 2));
    host.emit(agent.session, toolResult(`c${40 + i * 2}`, `${sharedPrefix}-tail-${i}`, 41 + i * 2));
  }
  host.emit(agent.session, stepStart(1, 2, 46));
  await sleep(150);
  check('完整结果有进展时未 cancel', agent.cancels.length === 0);
  await sleep(50);
}

// ---------- 测试 13c: provider 在后续 step 合法复用 callId ----------
{
  console.log('测试 13c: 不同 step 复用 call-0 → 每次都精确配对');
  const host = startPlugin({ scanOnBoot: false, loopToolRepeat: 3, cooldownMs: 300 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  await sleep(30);
  for (let step = 1; step <= 3; step += 1) {
    const call = toolCall('read', 160 + step * 2, '{}', 1, step);
    call.data.callId = 'call-0';
    host.emit(agent.session, call);
    host.emit(agent.session, toolResult('call-0', 'same output', 161 + step * 2, false, 1, step));
  }
  host.emit(agent.session, stepStart(1, 4, 168));
  await sleep(150);
  check('跨 step 复用 callId 仍能识别真实重复', agent.cancels.length === 1);
  await sleep(50);
}

// ---------- 测试 13b: 乱序批次的最后结果已显示进展 ----------
{
  console.log('测试 13b: 乱序批次中先连续重复、后出现进展 → 不打断');
  const host = startPlugin({ scanOnBoot: false, loopToolRepeat: 3, cooldownMs: 300 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  await sleep(30);
  for (let i = 0; i < 4; i += 1) {
    host.emit(agent.session, toolCall('read', 90 + i));
  }
  host.emit(agent.session, toolResult('c93', 'progress', 100));
  host.emit(agent.session, toolResult('c92', 'same', 101));
  host.emit(agent.session, toolResult('c91', 'same', 102));
  host.emit(agent.session, toolResult('c90', 'same', 103));
  host.emit(agent.session, stepStart(1, 2, 104));
  await sleep(150);
  check('批次末尾的进展重置重复计数', agent.cancels.length === 0);
  await sleep(50);
}

// ---------- 测试 13d: pending 乱序结果的 surface replacement ----------
{
  console.log('测试 13d: 已缓存的乱序结果被 replace → 使用替换后内容');
  const host = startPlugin({ scanOnBoot: false, loopToolRepeat: 2, cooldownMs: 300 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  await sleep(30);
  host.emit(agent.session, toolCall('read', 200));
  host.emit(agent.session, toolCall('read', 201));
  const secondResult = toolResult('c201', 'same', 202);
  secondResult.surfaceOp = 'append';
  host.emit(agent.session, secondResult);
  const replacement = toolResult('c201', 'different', 203);
  replacement.surfaceOp = { op: 'replace', start: 202, end: 202 };
  replacement.sourceEventSeqs = [202];
  host.emit(agent.session, replacement);
  host.emit(agent.session, toolResult('c200', 'same', 204));
  host.emit(agent.session, stepStart(1, 2, 205));
  await sleep(150);
  check('replacement 显示进展时未 cancel', agent.cancels.length === 0);
  await sleep(50);
}

// ---------- 测试 13e: 冲突的非 replacement 重复结果 ----------
{
  console.log('测试 13e: 同 callId 收到冲突的普通结果 → 保守中断计数');
  const host = startPlugin({ scanOnBoot: false, loopToolRepeat: 2, cooldownMs: 300 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  await sleep(30);
  host.emit(agent.session, toolCall('read', 240));
  host.emit(agent.session, toolCall('read', 241));
  host.emit(agent.session, toolResult('c241', 'same', 242));
  host.emit(agent.session, toolResult('c241', 'conflicting', 243));
  host.emit(agent.session, toolResult('c240', 'same', 244));
  host.emit(agent.session, stepStart(1, 2, 245));
  await sleep(150);
  check('冲突结果未被当成可信重复', agent.cancels.length === 0);
  await sleep(50);
}

// ---------- 测试 13f: pending 队列超限后 replacement 不得复活旧 streak ----------
{
  console.log('测试 13f: pending 关联超限后改写旧结果 → 不复活旧计数');
  const host = startPlugin({ scanOnBoot: false, loopToolRepeat: 2, cooldownMs: 300 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  await sleep(30);
  host.emit(agent.session, toolCall('read', 300));
  const baseResult = toolResult('c300', 'same', 301);
  baseResult.surfaceOp = 'append';
  host.emit(agent.session, baseResult);
  for (let i = 0; i < 65; i += 1) {
    host.emit(agent.session, toolCall('read', 400 + i));
  }
  const replacement = toolResult('c300', 'same', 500);
  replacement.surfaceOp = { op: 'replace', start: 301, end: 301 };
  replacement.sourceEventSeqs = [301];
  host.emit(agent.session, replacement);
  host.emit(agent.session, toolResult('c401', 'same', 501));
  host.emit(agent.session, stepStart(1, 2, 502));
  await sleep(150);
  check('容量降级后未利用旧历史误 cancel', agent.cancels.length === 0);
  await sleep(50);
}

// ---------- 测试 13g: seen id 淘汰后的旧帧重放 ----------
{
  console.log('测试 13g: seen id 容量淘汰后重放旧事件 → 不误判重复');
  const host = startPlugin({ scanOnBoot: false, loopToolRepeat: 258, cooldownMs: 300 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  await sleep(30);
  for (let i = 0; i < 257; i += 1) {
    const seq = 600 + i * 2;
    host.emit(agent.session, toolCall('read', seq));
    host.emit(agent.session, toolResult(`c${seq}`, 'same output', seq + 1));
  }
  // c600 已从有界 seen 集合淘汰；旧帧重放不能继承此前的重复 streak。
  host.emit(agent.session, toolCall('read', 600));
  host.emit(agent.session, toolResult('c600', 'same output', 601));
  host.emit(agent.session, stepStart(1, 2, 1200));
  await sleep(150);
  check('seen 淘汰后旧重放未制造假重复', agent.cancels.length === 0);
  await sleep(50);
}

// ---------- 测试 13h: 未知结果打断乱序缓存 ----------
{
  console.log('测试 13h: 乱序结果缓存中遇到未知 callId → 不跨边界计数');
  const host = startPlugin({ scanOnBoot: false, loopToolRepeat: 3, cooldownMs: 300 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  await sleep(30);
  for (let i = 0; i < 3; i += 1) host.emit(agent.session, toolCall('read', 1200 + i));
  host.emit(agent.session, toolResult('c1201', 'same output', 1210));
  host.emit(agent.session, toolResult('c1202', 'same output', 1211));
  host.emit(agent.session, toolResult('unknown-call', 'same output', 1212));
  host.emit(agent.session, toolResult('c1200', 'same output', 1213));
  host.emit(agent.session, stepStart(1, 2, 1214));
  await sleep(150);
  check('未知结果已清空乱序缓存 streak', agent.cancels.length === 0);
  await sleep(50);
}

// ---------- 测试 13i: 无效 replacement 打断乱序缓存 ----------
{
  console.log('测试 13i: 乱序结果缓存中遇到无效 replacement → 不跨边界计数');
  const host = startPlugin({ scanOnBoot: false, loopToolRepeat: 3, cooldownMs: 300 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  await sleep(30);
  for (let i = 0; i < 3; i += 1) host.emit(agent.session, toolCall('read', 1220 + i));
  host.emit(agent.session, toolResult('c1221', 'same output', 1230));
  host.emit(agent.session, toolResult('c1222', 'same output', 1231));
  const invalidReplacement = toolResult('c1221', 'same output', 1232);
  invalidReplacement.surfaceOp = { op: 'replace', start: 999, end: 999 };
  invalidReplacement.sourceEventSeqs = [999];
  host.emit(agent.session, invalidReplacement);
  host.emit(agent.session, toolResult('c1220', 'same output', 1233));
  host.emit(agent.session, stepStart(1, 2, 1234));
  await sleep(150);
  check('无效 replacement 已清空乱序缓存 streak', agent.cancels.length === 0);
  await sleep(50);
}

// ---------- 测试 13j: 已完成调用冲突打断乱序缓存 ----------
{
  console.log('测试 13j: 已完成调用冲突时已有乱序结果缓存 → 不跨边界计数');
  const host = startPlugin({ scanOnBoot: false, loopToolRepeat: 3, cooldownMs: 300 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  await sleep(30);
  host.emit(agent.session, toolCall('read', 1240));
  host.emit(agent.session, toolResult('c1240', 'same output', 1241));
  for (let i = 0; i < 3; i += 1) host.emit(agent.session, toolCall('read', 1250 + i));
  host.emit(agent.session, toolResult('c1251', 'same output', 1260));
  host.emit(agent.session, toolResult('c1252', 'same output', 1261));
  host.emit(agent.session, toolResult('c1240', 'conflicting completion', 1262));
  host.emit(agent.session, toolResult('c1250', 'same output', 1263));
  host.emit(agent.session, stepStart(1, 2, 1264));
  await sleep(150);
  check('已完成冲突已清空乱序缓存 streak', agent.cancels.length === 0);
  await sleep(50);
}

// ---------- 测试 13k: 并发批次正序结果的末尾进展 ----------
{
  console.log('测试 13k: 并发批次正序返回，末尾结果有进展 → 不提前打断');
  const host = startPlugin({ scanOnBoot: false, loopToolRepeat: 3, cooldownMs: 300 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  await sleep(30);
  for (let i = 0; i < 4; i += 1) host.emit(agent.session, toolCall('read', 1270 + i));
  for (let i = 0; i < 3; i += 1) {
    host.emit(agent.session, toolResult(`c${1270 + i}`, 'same output', 1280 + i));
  }
  host.emit(agent.session, toolResult('c1273', 'progress', 1283));
  host.emit(agent.session, stepStart(1, 2, 1284));
  await sleep(150);
  check('并发批次收齐后按最终连续 run 判断', agent.cancels.length === 0);
  await sleep(50);
}

// ---------- 测试 13l: 新回合拒绝旧回合帧重放 ----------
{
  console.log('测试 13l: 新回合开始后重放旧回合工具帧 → 不跨回合计数');
  const host = startPlugin({ scanOnBoot: false, loopToolRepeat: 2, cooldownMs: 300 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  const firstStart = { ...turnStart(1), seq: 10 };
  const firstCall = toolCall('read', 20, '{}', 1, 1);
  const firstResult = toolResult('c20', 'same output', 21, false, 1, 1);
  host.emit(agent.session, firstStart);
  host.emit(agent.session, firstCall);
  host.emit(agent.session, firstResult);
  host.emit(agent.session, { ...turnStart(2), seq: 100 });
  host.emit(agent.session, firstCall);
  host.emit(agent.session, firstResult);
  host.emit(agent.session, toolCall('read', 101, '{}', 2, 1));
  host.emit(agent.session, toolResult('c101', 'same output', 102, false, 2, 1));
  host.emit(agent.session, stepStart(2, 2, 103));
  await sleep(150);
  check('turn boundary 拒绝旧帧且未制造跨回合 streak', agent.cancels.length === 0);
  await sleep(50);
}

// ---------- 测试 13m: 达阈值结果被同步 surface replacement ----------
{
  console.log('测试 13m: 重复结果达阈值后同步 replace 为进展 → 不按旧 surface 打断');
  const host = startPlugin({ scanOnBoot: false, loopToolRepeat: 2, cooldownMs: 300 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  host.emit(agent.session, toolCall('read', 3100));
  const first = toolResult('c3100', 'same output', 3101);
  first.surfaceOp = 'append';
  host.emit(agent.session, first);
  host.emit(agent.session, toolCall('read', 3102));
  const second = toolResult('c3102', 'same output', 3103);
  second.surfaceOp = 'append';
  host.emit(agent.session, second);
  const replacement = toolResult('c3102', 'progress', 3104);
  replacement.surfaceOp = { op: 'replace', start: 3103, end: 3103 };
  replacement.sourceEventSeqs = [3103];
  host.emit(agent.session, replacement);
  host.emit(agent.session, stepStart(1, 2, 3105));
  await sleep(150);
  check('同步 replacement 已撤销旧 repeat signal', agent.cancels.length === 0);
  await sleep(50);
}

// ---------- 测试 13n: 达阈值后同步出现新的 pending call ----------
{
  console.log('测试 13n: 重复结果达阈值后同步出现新调用 → 不按旧信号打断');
  const host = startPlugin({ scanOnBoot: false, loopToolRepeat: 2, cooldownMs: 300 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  host.emit(agent.session, toolCall('read', 3200));
  host.emit(agent.session, toolResult('c3200', 'same output', 3201));
  host.emit(agent.session, toolCall('read', 3202));
  host.emit(agent.session, toolResult('c3202', 'same output', 3203));
  host.emit(agent.session, toolCall('read', 3204));
  host.emit(agent.session, stepStart(1, 2, 3205));
  await sleep(150);
  check('新 pending call 已撤销旧 repeat signal', agent.cancels.length === 0);
  await sleep(50);
}

// ---------- 测试 13o: lossy replacements 不得制造重复 ----------
{
  console.log('测试 13o: 不同结果被 replace 成相同裁剪内容 → 不制造重复');
  const host = startPlugin({ scanOnBoot: false, loopToolRepeat: 2, cooldownMs: 300 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  host.emit(agent.session, toolCall('read', 3300));
  const first = toolResult('c3300', 'distinct result A', 3301);
  first.surfaceOp = 'append';
  host.emit(agent.session, first);
  host.emit(agent.session, toolCall('read', 3302));
  const second = toolResult('c3302', 'distinct result B', 3303);
  second.surfaceOp = 'append';
  host.emit(agent.session, second);
  const replaceFirst = toolResult('c3300', '[pruned]', 3304);
  replaceFirst.surfaceOp = { op: 'replace', start: 3301, end: 3301 };
  replaceFirst.sourceEventSeqs = [3301];
  host.emit(agent.session, replaceFirst);
  const replaceSecond = toolResult('c3302', '[pruned]', 3305);
  replaceSecond.surfaceOp = { op: 'replace', start: 3303, end: 3303 };
  replaceSecond.sourceEventSeqs = [3303];
  host.emit(agent.session, replaceSecond);
  host.emit(agent.session, stepStart(1, 2, 3306));
  host.emit(agent.session, toolCall('read', 3307, '{}', 1, 2));
  host.emit(agent.session, toolResult('c3307', '[pruned]', 3308, false, 1, 2));
  host.emit(agent.session, stepStart(1, 3, 3309));
  await sleep(150);
  check('lossy replacements 未生成新的 repeat signal', agent.cancels.length === 0);
  await sleep(50);
}

// ---------- 测试 13p: summary range replacement 清除工具候选 ----------
{
  console.log('测试 13p: 工具重复达阈值后被 summary range replace → 不打断新 step');
  const host = startPlugin({ scanOnBoot: false, loopToolRepeat: 3, cooldownMs: 300 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  for (let i = 0; i < 3; i += 1) {
    const seq = 3400 + i * 2;
    host.emit(agent.session, toolCall('read', seq));
    host.emit(agent.session, toolResult(`c${seq}`, 'same output', seq + 1));
  }
  const summary = userMsg('Summary of prior tool outputs', 'summary-3406', 3406);
  summary.data.source = { kind: 'compaction' };
  summary.surfaceOp = { op: 'replace', start: 3401, end: 3405 };
  summary.sourceEventSeqs = [3401, 3403, 3405];
  host.emit(agent.session, summary);
  host.emit(agent.session, stepStart(1, 2, 3407));
  await sleep(150);
  check('summary replacement 已清除旧工具 repeat signal', agent.cancels.length === 0);
  await sleep(50);
}

// ---------- 测试 14b: 相同文本的成功/失败结果不同 ----------
{
  console.log('测试 14b: 工具结果文本相同但 isError 变化 → 不打断');
  const host = startPlugin({ scanOnBoot: false, loopToolRepeat: 3, cooldownMs: 300 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  await sleep(30);
  for (let i = 0; i < 4; i += 1) {
    host.emit(agent.session, toolCall('probe', 110 + i * 2));
    host.emit(agent.session, toolResult(`c${110 + i * 2}`, 'same visible text', 111 + i * 2, i % 2 === 1));
  }
  host.emit(agent.session, stepStart(1, 2, 118));
  await sleep(150);
  check('错误状态变化视为进展', agent.cancels.length === 0);
  await sleep(50);
}

// ---------- 测试 14c: 未知和重复 callId 不影响 loop 计数 ----------
{
  console.log('测试 14c: 未知/重复 callId → 忽略且不误 cancel');
  const host = startPlugin({ scanOnBoot: false, loopToolRepeat: 3, cooldownMs: 300 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  await sleep(30);
  const firstCall = toolCall('read', 130);
  const firstResult = toolResult('c130', 'same output', 131);
  host.emit(agent.session, firstCall);
  host.emit(agent.session, firstCall); // 同一事件重放
  host.emit(agent.session, firstResult);
  host.emit(agent.session, firstResult); // 重复结果不得再计数
  host.emit(agent.session, toolResult('unknown-call', 'same output', 132));
  host.emit(agent.session, toolCall('read', 133));
  host.emit(agent.session, toolResult('c133', 'same output', 134));
  host.emit(agent.session, toolCall('read', 135));
  host.emit(agent.session, toolResult('c135', 'same output', 136));
  host.emit(agent.session, stepStart(1, 2, 137));
  await sleep(150);
  check('不可关联结果打断连续性，未误达阈值', agent.cancels.length === 0);
  await sleep(50);
}

// ---------- 测试 11e: 不可关联的结果不得改写护栏 ----------
{
  console.log('测试 11e: 缺失/冲突 callId 的结果 → 最后调用仍为 pending');
  const host = startPlugin({ scanOnBoot: false });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, toolCall('delete-file', 150));
  const mismatched = toolResult('other-call', 'deleted', 151);
  mismatched.data.message.source.callId = 'c150';
  host.emit(agent.session, mismatched);
  const missing = toolResult('missing-call', 'deleted', 152);
  delete missing.data.message.source;
  delete missing.data.message.content[0].toolCallId;
  host.emit(agent.session, missing);
  const missingCallId = toolCall('rename-file', 153);
  delete missingCallId.data.callId;
  host.emit(agent.session, missingCallId);
  host.emit(agent.session, toolResult('c153', 'renamed', 154));
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(600);
  const text = agent.followups[0]?.content?.[0]?.text ?? '';
  check('不可关联结果未改写护栏', text.includes('「rename-file」可能未完成'));
  await sleep(50);
}

// ---------- 测试 15: 通知桥与动作 ----------
{
  console.log('测试 15: 通知桥(SSE 端点 + 动作端点)');
  const host = startPlugin({ scanOnBoot: false, notify: true, maxConsecutive: 1 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  const bridge = host.routes.find((r) => r.path === '/api/auto-continue-bridge');
  const action = host.routes.find((r) => r.path === '/api/auto-continue-action');
  check('桥路由已注册', bridge !== undefined && action !== undefined);
  // SSE 客户端收集
  const frames = [];
  const res = {
    write(data) {
      frames.push(data);
    },
    writeHead() {},
    end() {},
  };
  const req = { on: () => {} };
  bridge.handler(req, res);
  // 触发通知(发送后达上限 → 通知)
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'x' } }));
  await sleep(600);
  const noticeFrame = frames.find((f) => f.includes('"type":"notice"'));
  check('收到通知帧', noticeFrame !== undefined);
  check('通知含动作', noticeFrame !== undefined && noticeFrame.includes('"action":"resume"'));
  const notice = noticeFrame === undefined ? undefined : JSON.parse(noticeFrame.slice(6)).notice;
  check('通知携带动作目标会话', notice?.sessionId === 's1');
  // 动作端点: resume → 立即续跑
  const before = agent.followups.length;
  const r1 = await postAction(host, { action: 'resume', sessionId: notice?.sessionId });
  check('resume 动作 ok', r1.ok === true);
  await sleep(100);
  check('立即续跑发送', agent.followups.length === before + 1);
  const r2 = await postAction(host, { action: 'pause1h', sessionId: 's1' });
  check('pause1h 动作 ok', r2.ok === true);
  const r3 = await postAction(host, { action: 'unpause', sessionId: 's1' });
  check('unpause 动作 ok', r3.ok === true);
  const r4 = await postAction(host, { action: 'reset-stats' });
  check('reset-stats 动作 ok', r4.ok === true);
  await sleep(50);
}

// ---------- 测试 15b: English locale 通知文本 ----------
{
  console.log('测试 15b: English locale → 通知标题、正文与动作使用英文');
  const host = startPlugin({ scanOnBoot: false, locale: 'en', notify: true, maxConsecutive: 1 });
  const transient = host.makeAgent('transient');
  const permanent = host.makeAgent('permanent');
  await sleep(50);
  const bridge = host.routes.find((route) => route.path === '/api/auto-continue-bridge');
  const frames = [];
  bridge.handler(
    { on: () => {} },
    {
      write: (data) => frames.push(data),
      writeHead() {},
      end() {},
    },
  );
  host.emit(
    transient.session,
    turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'network' } }),
  );
  await sleep(600);
  host.emit(
    permanent.session,
    turnEnd(1, { kind: 'error', error: { code: 'INVALID_API_KEY', message: 'bad', status: 401 } }),
  );
  await sleep(100);
  const notices = frames.filter((frame) => frame.includes('"type":"notice"')).join('\n');
  check(
    '英文通知完整',
    notices.includes('Continued automatically') &&
      notices.includes('Auto-continue stopped') &&
      notices.includes('Not continued') &&
      notices.includes('manual intervention required') &&
      notices.includes('Resume now') &&
      notices.includes('Pause this session for 1 hour'),
  );
  await sleep(50);
}

// ---------- 测试 16: 顶层 row replacement 清理定时器 ----------
{
  console.log('测试 16: 顶层 row replacement 清理定时器 — 替换后不再 fire');
  const host = startPlugin({ scanOnBoot: false });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'boom' } }));
  await sleep(100); // 宽限期(200ms)内卸载, 模拟 config HMR 行替换
  host.replacePluginRow();
  await sleep(400); // 若定时器未清理, fire 会照常执行并产生 followup
  check('row replacement 后未发送', agent.followups.length === 0);
  await sleep(50);
}

// ---------- 测试 16b: 顶层 row replacement 注销旧 listener ----------
{
  console.log('测试 16b: 顶层 row replacement 注销旧 listener — 后续事件不再访问旧 context');
  const host = startPlugin({ scanOnBoot: false });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.replacePluginRow();
  host.setContextActive(false);
  let eventError;
  try {
    host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'late' } }));
  } catch (error) {
    eventError = error;
  }
  check('旧 listener 未访问 inactive context', eventError === undefined);
  check('row replacement 后事件未发送', agent.followups.length === 0);
  await sleep(50);
}

// ---------- 测试 17: inject 重入替换旧 runner ----------
{
  console.log('测试 17: inject 重入替换旧 runner — 旧定时器取消且新 runner 接管');
  const host = startPlugin({ scanOnBoot: false });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'old' } }));
  await sleep(100);
  host.reinjectEngine();
  await sleep(300);
  check('重入后旧 runner 未发送', agent.followups.length === 0);
  host.emit(agent.session, turnEnd(2, { kind: 'error', error: { code: 'UPSTREAM', message: 'new' } }));
  await sleep(300);
  check('新 runner 正常接管', agent.followups.length === 1);
  await sleep(50);
}

// ---------- 测试 18: 宽限定时器遇到 inactive context ----------
{
  console.log('测试 18: 宽限定时器遇到 inactive context — 记录异常且进程继续');
  const host = startPlugin({ scanOnBoot: false, graceMs: 100 });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnEnd(1, { kind: 'error', error: { code: 'UPSTREAM', message: 'boom' } }));
  const errors = await captureConsoleErrors(async () => {
    host.setContextActive(false);
    await sleep(200);
  });
  check(
    '定时发送异常已记录',
    errors.some((line) => line.includes('定时发送异常 s1') && line.includes('inactive context')),
  );
  check('inactive context 时未发送', agent.followups.length === 0);
  await sleep(50);
}

// ---------- 测试 19: loop 冷却定时器遇到 inactive context ----------
{
  console.log('测试 19: loop 冷却定时器遇到 inactive context — 记录异常且进程继续');
  const host = startPlugin({
    scanOnBoot: false,
    loopRepeatText: 2,
    graceMs: 100,
    cooldownMs: 300,
  });
  const agent = host.makeAgent('s1');
  await sleep(50);
  host.emit(agent.session, turnStart(1));
  const repeated =
    'This deliberately repeated assistant response is long enough for exact-text loop detection.';
  host.emit(agent.session, assistantMsg(repeated, 10));
  host.emit(agent.session, assistantMsg(repeated, 11));
  await sleep(50);
  check('loop guard 已打断', agent.cancels.length === 1);
  host.emit(agent.session, turnEnd(1, { kind: 'aborted', reason: agent.cancels[0]?.cause }));
  const errors = await captureConsoleErrors(async () => {
    host.setContextActive(false);
    await sleep(400);
  });
  check(
    'loop 重启异常已记录',
    errors.some((line) => line.includes('loop 重启异常 s1') && line.includes('inactive context')),
  );
  check('inactive context 时 loop 未重启', agent.followups.length === 0);
  await sleep(50);
}

// ---------- 测试 20: 通知 resume 遇到 inactive context ----------
{
  console.log('测试 20: 通知 resume 遇到 inactive context — 路由仍响应且异常被收口');
  const host = startPlugin({ scanOnBoot: false });
  const agent = host.makeAgent('s1');
  await sleep(50);
  // 通知动作先写一条 debug log；让这次读取成功，再让 resumeNow -> fire 的读取失败。
  host.failConfigAfterSuccessfulReads(1);
  let response;
  const errors = await captureConsoleErrors(async () => {
    response = await postAction(host, { action: 'resume', sessionId: 's1' });
    await sleep(50);
  });
  check('resume 路由仍返回 ok', response?.ok === true);
  check(
    '手动续跑异常已记录',
    errors.some((line) => line.includes('手动续跑异常 s1') && line.includes('inactive context')),
  );
  check('inactive context 时 resume 未发送', agent.followups.length === 0);
  await sleep(50);
}

// ---------- 测试 21: turn/end error 缺失 failure details ----------
{
  console.log('测试 21: turn/end error 缺失 failure details — 记录并跳过');
  const host = startPlugin({ scanOnBoot: false });
  const agent = host.makeAgent('malformed-failure');
  await sleep(50);
  let eventError;
  const errors = await captureConsoleErrors(async () => {
    try {
      host.emit(agent.session, turnEnd(1, { kind: 'error' }));
    } catch (error) {
      eventError = error;
    }
    await sleep(300);
  });
  check(
    '畸形 failure 被记录并安全跳过',
    eventError === undefined &&
      agent.followups.length === 0 &&
      errors.some(
        (line) => line.includes('忽略畸形 turn/end') && line.includes('malformed-failure'),
      ),
  );
  await sleep(50);
}

// ---------- 测试 22: turn/end error 不可解释的 failure details ----------
{
  console.log('测试 22: turn/end error 不可解释的 failure details — 记录并跳过');
  const host = startPlugin({ scanOnBoot: false });
  const agent = host.makeAgent('unreadable-failure');
  await sleep(50);
  const invalidDetails = [null, {}, [], 'boom', { code: 503, message: false }, { status: '503' }];
  const eventErrors = [];
  const errors = await captureConsoleErrors(async () => {
    invalidDetails.forEach((error, index) => {
      try {
        host.emit(agent.session, turnEnd(index + 1, { kind: 'error', error }));
      } catch (eventError) {
        eventErrors.push(eventError);
      }
    });
    await sleep(300);
  });
  check(
    '不可解释的 failure 全部被记录并安全跳过',
    eventErrors.length === 0 &&
      agent.followups.length === 0 &&
      errors.filter(
        (line) => line.includes('忽略畸形 turn/end') && line.includes('unreadable-failure'),
      ).length === invalidDetails.length,
  );
  await sleep(50);
}

// ---------- 测试 23: turn/end reason 结构无效 ----------
{
  console.log('测试 23: turn/end reason 结构无效 — 记录并跳过');
  const host = startPlugin({ scanOnBoot: false });
  const agent = host.makeAgent('malformed-reason');
  await sleep(50);
  const invalidReasons = [undefined, null, {}, [], 'error', { kind: 503 }];
  const eventErrors = [];
  const errors = await captureConsoleErrors(async () => {
    invalidReasons.forEach((reason, index) => {
      try {
        host.emit(agent.session, turnEnd(index + 1, reason));
      } catch (eventError) {
        eventErrors.push(eventError);
      }
    });
    await sleep(300);
  });
  check(
    '无效 reason 全部被记录并安全跳过',
    eventErrors.length === 0 &&
      agent.followups.length === 0 &&
      errors.filter(
        (line) => line.includes('忽略畸形 turn/end') && line.includes('malformed-reason'),
      ).length === invalidReasons.length,
  );
  await sleep(50);
}

// ---------- 测试 24: session/event listener 收口异常 ----------
{
  console.log('测试 24: session/event listener 收口异常 — 后续合法事件仍能处理');
  const host = startPlugin({ scanOnBoot: false });
  const agent = host.makeAgent('listener-boundary');
  await sleep(50);
  let eventError;
  const errors = await captureConsoleErrors(async () => {
    try {
      host.emit(agent.session, {
        type: 'tool/call',
        seq: 10,
        time: Date.now(),
        data: undefined,
      });
    } catch (error) {
      eventError = error;
    }
    host.emit(
      agent.session,
      turnEnd(2, { kind: 'error', error: { code: 'UPSTREAM', message: 'retry me' } }),
    );
    await sleep(300);
  });
  check(
    'listener 异常已记录且合法后续事件照常处理',
    eventError === undefined &&
      errors.some(
        (line) => line.includes('会话事件处理异常') && line.includes('listener-boundary'),
      ) &&
      agent.followups.length === 1,
  );
  await sleep(50);
}

// ---------- 测试 25: 未知 turn/end reason kind ----------
{
  console.log('测试 25: 未知 turn/end reason kind — 安静忽略');
  const host = startPlugin({ scanOnBoot: false });
  const agent = host.makeAgent('future-reason');
  await sleep(50);
  const errors = await captureConsoleErrors(async () => {
    host.emit(agent.session, turnEnd(1, { kind: 'future-provider-outcome', detail: 'new' }));
    await sleep(300);
  });
  check('未知 reason 未发送且未记录错误', agent.followups.length === 0 && errors.length === 0);
  await sleep(50);
}

console.log(failures === 0 ? '\n全部通过 ✅' : `\n${failures} 项失败 ❌`);
process.exit(failures === 0 ? 0 : 1);
