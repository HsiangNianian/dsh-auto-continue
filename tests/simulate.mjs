/**
 * 无头模拟测试: 用假 window/localStorage + 假 api 加载打包后的 lib/client.js,
 * 验证自动「继续」插件的核心行为:
 *   1. turn/end error → 宽限期后自动发送「继续」
 *   2. 宽限期内 turn/start → 取消
 *   3. aborted → 不发送
 *   4. 会话运行中 → 不发送
 *   5. 启动扫描: 历史里最近回合为 interrupted → 自动继续
 *   6. 连续次数上限 → 停止
 *   7. 太久远的中断 → 扫描不处理
 * 运行: node test/simulate.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const bundle = readFileSync(join(root, "../lib/client.js"), "utf8");

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

new Function("require", bundle)(() => {
  throw new Error("bundle 不应有运行时 require");
});
if (!handoff) throw new Error("未捕获 __ModuleLoader__.load");
const exports = handoff.factory(() => {
  throw new Error("no require");
});
if (exports.inject[0] !== "connection") throw new Error("inject 错误: " + exports.inject);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 假 api ----------
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
    this.sessionRows.push({
      sessionId: id,
      running,
      parentSessionId,
      updatedAt: Date.now(),
    });
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
      yield { rpcId: "r", payload: frame };
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

const turnEnd = (sessionId, turn, reason) => ({
  type: "session/event",
  sessionId,
  event: { type: "turn/end", seq: turn * 10, time: Date.now(), data: { turn, reason } },
});
const turnStart = (sessionId, turn) => ({
  type: "session/event",
  sessionId,
  event: { type: "turn/start", seq: turn * 10, time: Date.now(), data: { turn } },
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

/** 每个测试独立: 清空 localStorage 并用快速参数重新 apply。 */
const FAST = { graceMs: 200, cooldownMs: 300, maxConsecutive: 3, scanOnBoot: true, verbose: false };
function startPlugin(api) {
  storage.clear();
  localStorage.setItem("dsh-auto-continue.config", JSON.stringify(FAST));
  exports.apply({ connection: { api } });
}

// ---------- 测试 1: turn/end error → 自动发送 ----------
{
  console.log("测试 1: turn/end error → 宽限期后自动发送「继续」");
  const api = new FakeApi();
  api.addSession("s1");
  startPlugin(api);
  await sleep(50);
  api.pushMux(turnEnd("s1", 1, { kind: "error", error: { code: "X", message: "boom" } }));
  await sleep(100); // grace 200ms, 还没到
  check("宽限期内未发送", api.prompts.length === 0);
  await sleep(500);
  check("宽限期后已发送", api.prompts.length === 1);
  check("发送文本为「继续」", api.prompts[0]?.content?.[0]?.text === "继续");
  check("mode 为 queue", api.prompts[0]?.mode === "queue");
  check("目标会话 s1", api.prompts[0]?.sessionId === "s1");
  await sleep(50);
}

// ---------- 测试 2: 宽限期内 turn/start → 取消 ----------
{
  console.log("测试 2: 宽限期内宿主自行开启新回合 → 取消");
  const api = new FakeApi();
  api.addSession("s1");
  startPlugin(api);
  await sleep(50);
  api.pushMux(turnEnd("s1", 1, { kind: "error", error: { code: "X", message: "boom" } }));
  await sleep(100);
  api.pushMux(turnStart("s1", 2));
  await sleep(600);
  check("未发送", api.prompts.length === 0);
  await sleep(50);
}

// ---------- 测试 3: aborted → 不发送 ----------
{
  console.log("测试 3: 用户停止(aborted)→ 不发送");
  const api = new FakeApi();
  api.addSession("s1");
  startPlugin(api);
  await sleep(50);
  api.pushMux(turnEnd("s1", 1, { kind: "aborted", reason: { kind: "human" } }));
  await sleep(600);
  check("未发送", api.prompts.length === 0);
  await sleep(50);
}

// ---------- 测试 4: 会话运行中 → 不发送 ----------
{
  console.log("测试 4: 会话运行中(host 帧)→ 不发送");
  const api = new FakeApi();
  api.addSession("s1", { running: true });
  startPlugin(api);
  await sleep(50);
  api.pushHost({ type: "host/session-status", sessionId: "s1", running: true });
  api.pushMux(turnEnd("s1", 1, { kind: "error", error: { code: "X", message: "boom" } }));
  await sleep(600);
  check("未发送", api.prompts.length === 0);
  await sleep(50);
}

// ---------- 测试 5: 启动扫描 interrupted ----------
{
  console.log("测试 5: 启动扫描发现最近 interrupted 回合 → 自动继续");
  const api = new FakeApi();
  const now = Date.now();
  api.addSession("s1", {
    running: false,
    events: [
      {
        event: {
          type: "turn/end",
          seq: 2,
          time: now - 60_000,
          data: { turn: 1, reason: { kind: "interrupted" } },
        },
      },
    ],
  });
  startPlugin(api);
  await sleep(1000); // boot 扫描 + grace
  check("已发送", api.prompts.length === 1);
  check("文本为「继续」", api.prompts[0]?.content?.[0]?.text === "继续");
  await sleep(50);
}

// ---------- 测试 6: 连续次数上限 ----------
{
  console.log("测试 6: 连续自动继续达到上限后停止");
  const api = new FakeApi();
  api.addSession("s1");
  startPlugin(api);
  await sleep(50);
  for (let i = 1; i <= 4; i += 1) {
    api.pushMux(turnEnd("s1", i, { kind: "error", error: { code: "X", message: "boom" } }));
    await sleep(500); // grace 200 + 余量, 触发发送
    api.pushMux(turnStart("s1", i + 1));
    await sleep(450); // 超过 cooldown 300ms
  }
  check("只发送了 3 次(默认上限)", api.prompts.length === 3);
  await sleep(50);
}

// ---------- 测试 7: 旧的 error → 扫描不处理 ----------
{
  console.log("测试 7: 太久远的中断 → 扫描不处理");
  const api = new FakeApi();
  const now = Date.now();
  api.addSession("s1", {
    running: false,
    events: [
      {
        event: {
          type: "turn/end",
          seq: 2,
          time: now - 60 * 60 * 1000, // 1 小时前
          data: { turn: 1, reason: { kind: "error", error: { code: "X", message: "old" } } },
        },
      },
    ],
  });
  startPlugin(api);
  await sleep(1000);
  check("未发送", api.prompts.length === 0);
  await sleep(50);
}

console.log(failures === 0 ? "\n全部通过 ✅" : `\n${failures} 项失败 ❌`);
process.exit(failures === 0 ? 0 : 1);
