window.__ModuleLoader__.load({
	id: "dsh-client-auto-continue",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/engine.ts
var DEFAULT_CONFIG = {
  continueText: "继续",
  graceMs: 3e3,
  cooldownMs: 2e4,
  maxConsecutive: 3,
  scanOnBoot: true,
  scanLimit: 8,
  freshMs: 15 * 60 * 1e3,
  reconnectScanDelayMs: 5e3,
  reconnectBackoffMs: 3e3,
  verbose: true
};
function numberOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}
function booleanOr(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}
function resolveConfig(section) {
  const value = section ?? {};
  const text = typeof value.continueText === "string" && value.continueText.trim() !== "" ? value.continueText : DEFAULT_CONFIG.continueText;
  return {
    continueText: text,
    graceMs: numberOr(value.graceMs, DEFAULT_CONFIG.graceMs),
    cooldownMs: numberOr(value.cooldownMs, DEFAULT_CONFIG.cooldownMs),
    maxConsecutive: Math.max(1, numberOr(value.maxConsecutive, DEFAULT_CONFIG.maxConsecutive)),
    scanOnBoot: booleanOr(value.scanOnBoot, DEFAULT_CONFIG.scanOnBoot),
    scanLimit: Math.max(1, numberOr(value.scanLimit, DEFAULT_CONFIG.scanLimit)),
    freshMs: numberOr(value.freshMs, DEFAULT_CONFIG.freshMs),
    reconnectScanDelayMs: numberOr(value.reconnectScanDelayMs, DEFAULT_CONFIG.reconnectScanDelayMs),
    reconnectBackoffMs: numberOr(value.reconnectBackoffMs, DEFAULT_CONFIG.reconnectBackoffMs),
    verbose: booleanOr(value.verbose, DEFAULT_CONFIG.verbose)
  };
}
function isNonHumanReason(kind) {
  return kind === "error" || kind === "interrupted" || kind === "max-tokens";
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function clientTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || void 0;
  } catch {
    return void 0;
  }
}
var lockPrefix = "dsh-auto-continue:";
var lockKey = (sessionId) => `${lockPrefix}lock:${sessionId}`;
var stampKey = (sessionId) => `${lockPrefix}last:${sessionId}`;
function claimSend(sessionId) {
  try {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(lockKey(sessionId), token);
    return localStorage.getItem(lockKey(sessionId)) === token;
  } catch {
    return true;
  }
}
function releaseSend(sessionId) {
  try {
    localStorage.removeItem(lockKey(sessionId));
  } catch {
  }
}
function readLastSend(sessionId) {
  try {
    return Number(localStorage.getItem(stampKey(sessionId)) ?? 0) || 0;
  } catch {
    return 0;
  }
}
function writeLastSend(sessionId, at) {
  try {
    localStorage.setItem(stampKey(sessionId), String(at));
  } catch {
  }
}
var freshState = () => ({
  consecutive: 0,
  lastAutoAt: 0,
  lastAttemptAt: 0,
  lastSentText: "",
  pendingTimer: void 0,
  running: void 0,
  queued: 0,
  subagent: false
});
function isOurEcho(state, event) {
  if (event.type !== "user/message") return false;
  const message = event.data;
  if (message.source.kind !== "user") return false;
  if (state.lastSentText === "") return false;
  if (Date.now() - state.lastAutoAt > 3e4) return false;
  const text = message.content.filter((part) => part.type === "text").map((part) => part.text).join("");
  return text === state.lastSentText;
}
async function pumpStream(open, onFrame, onReconnect, getBackoff, log, signal) {
  let backoff = getBackoff();
  while (!signal.aborted) {
    let connected = false;
    try {
      for await (const envelope of open(signal)) {
        connected = true;
        onFrame(envelope.payload);
      }
      if (signal.aborted) return;
    } catch (error) {
      if (signal.aborted) return;
      log(`stream error: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!connected) {
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 15e3);
      continue;
    }
    backoff = getBackoff();
    onReconnect();
    await sleep(backoff);
  }
}
var AutoContinueRunner = class {
  /**
   * @param api - shared wire client (ctx.connection.api).
   * @param getConfig - read the current resolved configuration (settings scope).
   */
  constructor(api, getConfig) {
    this.api = api;
    this.getConfig = getConfig;
    this.states = /* @__PURE__ */ new Map();
    this.muxAbort = new AbortController();
    this.hostAbort = new AbortController();
    this.disposed = false;
    this.reconnectScans = 0;
    const config = this.getConfig();
    void this.runMux();
    void this.runHost();
    if (config.scanOnBoot) {
      void this.bootScanLoop();
    }
    this.log(
      `已启动(文本="${config.continueText}", 宽限 ${config.graceMs}ms, 冷却 ${config.cooldownMs}ms, 最多连续 ${config.maxConsecutive} 次)`
    );
  }
  log(message) {
    if (this.getConfig().verbose) console.info(`[auto-continue] ${message}`);
  }
  dispose() {
    this.disposed = true;
    this.muxAbort.abort();
    this.hostAbort.abort();
    for (const state of this.states.values()) {
      if (state.pendingTimer !== void 0) clearTimeout(state.pendingTimer);
    }
    this.states.clear();
  }
  state(sessionId) {
    let state = this.states.get(sessionId);
    if (state === void 0) {
      state = freshState();
      this.states.set(sessionId, state);
    }
    return state;
  }
  runMux() {
    return pumpStream(
      (signal) => this.api.events.mux({}, signal),
      (payload) => this.onMuxFrame(payload),
      () => this.scheduleReconnectScan(),
      () => this.getConfig().reconnectBackoffMs,
      (m) => this.log(m),
      this.muxAbort.signal
    );
  }
  runHost() {
    return pumpStream(
      (signal) => this.api.events.host({}, signal),
      (payload) => this.onHostFrame(payload),
      () => this.scheduleReconnectScan(),
      () => this.getConfig().reconnectBackoffMs,
      (m) => this.log(m),
      this.hostAbort.signal
    );
  }
  // ---------- mux 帧 ----------
  onMuxFrame(frame) {
    switch (frame.type) {
      case "session/event":
        this.onSessionEvent(frame.sessionId, frame.event);
        break;
      case "session/queue":
        this.state(frame.sessionId).queued = frame.items.length;
        if (frame.items.length > 0) this.cancelPending(frame.sessionId, "出现排队消息");
        break;
      case "stream/error":
        this.log(`mux stream/error: ${frame.error.code} ${frame.error.message}`);
        break;
      default:
        break;
    }
  }
  onSessionEvent(sessionId, event) {
    const state = this.state(sessionId);
    switch (event.type) {
      case "turn/start":
        state.running = true;
        this.cancelPending(sessionId, "宿主自行开启新回合");
        break;
      case "turn/end": {
        state.running = false;
        this.cancelPending(sessionId, "收到新的 turn/end");
        const reason = event.data.reason;
        if (reason.kind === "completed") {
          state.consecutive = 0;
        } else if (reason.kind === "aborted") {
          state.consecutive = 0;
        } else if (reason.kind === "blocked") {
        } else if (isNonHumanReason(reason.kind)) {
          this.schedule(sessionId, `turn/end:${reason.kind}`);
        }
        break;
      }
      case "user/message":
        if (isOurEcho(state, event)) break;
        if (event.data.source.kind === "user") {
          state.consecutive = 0;
          this.cancelPending(sessionId, "用户手动发送消息");
        }
        break;
      default:
        break;
    }
  }
  // ---------- host 帧 ----------
  onHostFrame(frame) {
    switch (frame.type) {
      case "host/session-status":
        this.state(frame.sessionId).running = frame.running;
        if (frame.running) this.cancelPending(frame.sessionId, "宿主报告会话开始运行");
        break;
      case "host/session-added":
        this.state(frame.sessionId).subagent = frame.parentSessionId !== void 0;
        break;
      case "host/agent-error":
        if (this.state(frame.sessionId).subagent) break;
        this.log(`host/agent-error(${frame.sessionId}): ${frame.message}`);
        this.schedule(frame.sessionId, "host/agent-error");
        break;
      case "host/session-removed":
        this.cancelPending(frame.sessionId, "会话已移除");
        this.states.delete(frame.sessionId);
        break;
      default:
        break;
    }
  }
  // ---------- 调度 ----------
  schedule(sessionId, reason) {
    const state = this.state(sessionId);
    const config = this.getConfig();
    if (state.subagent) return;
    if (state.pendingTimer !== void 0) return;
    if (Date.now() - state.lastAttemptAt < config.cooldownMs) return;
    if (state.consecutive >= config.maxConsecutive) {
      this.log(
        `跳过 ${sessionId}(${reason}): 已连续自动继续 ${state.consecutive} 次, 等待用户介入或成功回合`
      );
      return;
    }
    if (state.queued > 0) return;
    const timer = setTimeout(() => {
      if (state.pendingTimer !== timer) return;
      state.pendingTimer = void 0;
      void this.fire(sessionId, reason);
    }, config.graceMs);
    state.pendingTimer = timer;
    this.log(
      `检测到非人为中断 ${sessionId}(${reason}), ${config.graceMs}ms 后自动发送「${config.continueText}」`
    );
  }
  cancelPending(sessionId, why) {
    const state = this.state(sessionId);
    if (state.pendingTimer === void 0) return;
    clearTimeout(state.pendingTimer);
    state.pendingTimer = void 0;
    this.log(`取消 ${sessionId} 的自动继续(${why})`);
  }
  async fire(sessionId, reason) {
    if (this.disposed) return;
    const state = this.state(sessionId);
    const config = this.getConfig();
    if (state.running === void 0) {
      const running = await this.runningViaList(sessionId);
      if (running === void 0 || running) {
        this.log(`跳过 ${sessionId}: 无法确认空闲(${running === void 0 ? "未知" : "运行中"})`);
        return;
      }
    } else if (state.running) {
      this.log(`跳过 ${sessionId}: 会话仍在运行`);
      return;
    }
    if (state.queued > 0) {
      this.log(`跳过 ${sessionId}: 已有排队消息`);
      return;
    }
    if (Date.now() - readLastSend(sessionId) < config.cooldownMs) {
      this.log(`跳过 ${sessionId}: 其他标签页刚发送过`);
      return;
    }
    if (!claimSend(sessionId)) {
      this.log(`跳过 ${sessionId}: 其他标签页正在发送`);
      return;
    }
    const text = config.continueText;
    const zone = clientTimeZone();
    state.lastAttemptAt = Date.now();
    try {
      const response = await this.api.sessions.prompt({
        sessionId,
        mode: "queue",
        content: [{ type: "text", text }],
        ...zone === void 0 ? {} : { clientTimeZone: zone }
      });
      if (response.result.ok) {
        const now = Date.now();
        state.consecutive += 1;
        state.lastAutoAt = now;
        state.lastSentText = text;
        writeLastSend(sessionId, now);
        this.log(`已自动发送「${text}」到 ${sessionId}(${reason}), 第 ${state.consecutive} 次连续`);
      } else {
        this.log(
          `发送失败 ${sessionId}: ${response.result.error.code} ${response.result.error.message}`
        );
      }
    } catch (error) {
      this.log(`发送异常 ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      releaseSend(sessionId);
    }
  }
  async runningViaList(sessionId) {
    try {
      const response = await this.api.sessions.list({});
      if (!response.result.ok) return void 0;
      const item = response.result.value.items.find(
        (summary) => summary.sessionId === sessionId
      );
      return item === void 0 ? void 0 : item.running;
    } catch {
      return void 0;
    }
  }
  // ---------- 启动/重连扫描 ----------
  scheduleReconnectScan() {
    this.reconnectScans += 1;
    const scan = this.reconnectScans;
    setTimeout(() => {
      if (scan !== this.reconnectScans || this.disposed) return;
      void this.scanLoop(6, this.getConfig().reconnectScanDelayMs);
    }, this.getConfig().reconnectScanDelayMs);
  }
  async bootScanLoop() {
    await this.scanLoop(Infinity, 3e3);
  }
  /** 反复尝试扫描, 直到成功(宿主就绪)或达到次数上限。 */
  async scanLoop(attempts, delayMs) {
    for (let attempt = 0; attempt < attempts && !this.disposed; attempt += 1) {
      try {
        if (await this.scanInterrupted()) return;
      } catch (error) {
        if (this.disposed) return;
        if (attempt % 10 === 0) {
          this.log(
            `扫描失败(${attempt + 1}/${attempts === Infinity ? "∞" : attempts}): ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
      if (attempt + 1 < attempts) await sleep(delayMs);
    }
  }
  /**
   * 扫描最近中断过的会话: 最后回合以非人为原因结束, 且其后没有新回合或用户消息。
   * @returns 是否成功完成一次扫描(宿主就绪)。
   */
  async scanInterrupted() {
    const config = this.getConfig();
    const response = await this.api.sessions.list({});
    if (!response.result.ok) return false;
    const items = response.result.value.items;
    const candidates = items.filter((summary) => !summary.running && summary.parentSessionId === void 0).slice(0, config.scanLimit);
    const now = Date.now();
    for (const summary of candidates) {
      if (this.disposed) return true;
      const state = this.state(summary.sessionId);
      if (state.pendingTimer !== void 0) continue;
      if (state.consecutive >= config.maxConsecutive) continue;
      if (now - state.lastAttemptAt < config.cooldownMs) continue;
      let events;
      try {
        const page = await this.api.sessions.history({
          sessionId: summary.sessionId,
          maxMessages: 30
        });
        if (!page.result.ok) continue;
        events = page.result.value.events;
      } catch {
        continue;
      }
      let lastEnd;
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const event = events[i]?.event;
        if (event !== void 0 && event.type === "turn/end") {
          lastEnd = event;
          break;
        }
      }
      if (lastEnd === void 0) continue;
      const reason = lastEnd.data.reason;
      if (!isNonHumanReason(reason.kind)) continue;
      if (lastEnd.time < now - config.freshMs) continue;
      let superseded = false;
      for (const entry of events) {
        const event = entry.event;
        if (event.seq <= lastEnd.seq) continue;
        if (event.type === "turn/start") superseded = true;
        if (event.type === "user/message" && event.data.source.kind === "user") superseded = true;
        if (superseded) break;
      }
      if (superseded) continue;
      this.log(`扫描发现中断 ${summary.sessionId}(turn/end:${reason.kind}), 安排自动继续`);
      this.schedule(summary.sessionId, `scan:turn/end:${reason.kind}`);
    }
    return true;
  }
};

// src/client/locales.ts
var zh = {
  "card.title": "自动继续",
  "card.description": "请求因网络等原因(非人为)中断后, 自动发送「继续」续跑。",
  "field.continueText": "继续文本",
  "field.continueTextHint": "中断后自动发送的消息内容。",
  "field.graceMs": "宽限期 (ms)",
  "field.graceMsHint": "检测到中断后等待的时长; 期间宿主自行恢复则取消。",
  "field.cooldownMs": "冷却时间 (ms)",
  "field.cooldownMsHint": "同一会话两次自动「继续」的最小间隔, 失败尝试也计入。",
  "field.maxConsecutive": "最大连续次数",
  "field.maxConsecutiveHint": "同一会话连续自动「继续」的上限; 超过后停止, 直到用户手动介入或出现成功回合。",
  "field.scanOnBoot": "启动/重连扫描",
  "field.scanOnBootHint": "页面启动或重连时扫描最近中断的会话并自动续跑(如浏览器关闭期间宿主崩溃)。",
  "field.scanLimit": "扫描会话数",
  "field.scanLimitHint": "最多检查多少个最近更新的会话(不含运行中与子代理会话)。",
  "field.freshMs": "扫描时间窗 (ms)",
  "field.freshMsHint": "扫描只处理该时间窗内的中断。",
  "field.reconnectScanDelayMs": "重连扫描延迟 (ms)",
  "field.reconnectScanDelayMsHint": "重连后等待宿主完成恢复再扫描。",
  "field.reconnectBackoffMs": "重连退避 (ms)",
  "field.reconnectBackoffMsHint": "事件流断开后的重连间隔。",
  "field.verbose": "详细日志",
  "field.verboseHint": "在浏览器控制台输出 [auto-continue] 日志。",
  "chrome.collapse": "收起设置",
  "chrome.expand": "展开设置",
  "chrome.unsaved": "未保存",
  "chrome.readOnly": "当前部署的设置只读。",
  "chrome.saveFailed": "部署未接受这些值, 已保留供你修改。",
  "chrome.discard": "放弃",
  "chrome.saving": "保存中…",
  "chrome.save": "保存",
  "chrome.overridden": "已覆盖",
  "chrome.reset": "恢复默认",
  "chrome.invalidNumber": "请输入数字, 留空则使用默认值。",
  "chrome.inherit": "继承",
  "chrome.on": "开",
  "chrome.off": "关"
};
var en = {
  "card.title": "Auto continue",
  "card.description": "When a request is interrupted by a non-human cause, automatically send 「继续」 to resume.",
  "field.continueText": "Continue text",
  "field.continueTextHint": "Message automatically sent after an interruption.",
  "field.graceMs": "Grace period (ms)",
  "field.graceMsHint": "Wait after an interruption; cancelled if the host recovers on its own.",
  "field.cooldownMs": "Cooldown (ms)",
  "field.cooldownMsHint": "Minimum interval between auto-continues per session; failed attempts count too.",
  "field.maxConsecutive": "Max consecutive",
  "field.maxConsecutiveHint": "Max consecutive auto-continues per session; stops until a user intervenes or a turn completes.",
  "field.scanOnBoot": "Scan on load / reconnect",
  "field.scanOnBootHint": "Scan recently interrupted sessions on page load or reconnect (e.g. the host crashed while the browser was closed).",
  "field.scanLimit": "Scan limit",
  "field.scanLimitHint": "How many most-recently-updated sessions to check (running / subagent sessions excluded).",
  "field.freshMs": "Scan window (ms)",
  "field.freshMsHint": "Only interruptions inside this window are considered.",
  "field.reconnectScanDelayMs": "Reconnect scan delay (ms)",
  "field.reconnectScanDelayMsHint": "Wait for the host to finish recovering before scanning after a reconnect.",
  "field.reconnectBackoffMs": "Reconnect backoff (ms)",
  "field.reconnectBackoffMsHint": "Interval between event-stream reconnect attempts.",
  "field.verbose": "Verbose logs",
  "field.verboseHint": "Log [auto-continue] lines to the browser console.",
  "chrome.collapse": "Hide settings",
  "chrome.expand": "Show settings",
  "chrome.unsaved": "Unsaved",
  "chrome.readOnly": "This deployment stores settings read-only.",
  "chrome.saveFailed": "The deployment did not accept these values; they were left for you to correct.",
  "chrome.discard": "Discard",
  "chrome.saving": "Saving…",
  "chrome.save": "Save",
  "chrome.overridden": "Overridden",
  "chrome.reset": "Reset to default",
  "chrome.invalidNumber": "Enter a number, or leave blank to use the default.",
  "chrome.inherit": "Inherit",
  "chrome.on": "On",
  "chrome.off": "Off"
};

// src/client/settings-card.tsx
var import_react = require("react");
var import_client = require("@deepseek-ai/dsh-client-runtime/client");

// src/client/settings-form.ts
function numberField(field, min = 0) {
  return {
    field,
    format: (value) => typeof value === "number" ? String(value) : "",
    parse: (text) => {
      const trimmed = text.trim();
      if (trimmed === "") return { kind: "clear" };
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min) return void 0;
      return { kind: "set", value: parsed };
    }
  };
}
function textField(field) {
  return {
    field,
    format: (value) => typeof value === "string" ? value : "",
    parse: (text) => {
      const trimmed = text.trim();
      return trimmed === "" ? { kind: "clear" } : { kind: "set", value: trimmed };
    }
  };
}
function booleanField(field) {
  return {
    field,
    format: (value) => typeof value === "boolean" ? String(value) : "",
    parse: (text) => {
      const trimmed = text.trim();
      if (trimmed === "") return { kind: "clear" };
      if (trimmed === "true") return { kind: "set", value: true };
      if (trimmed === "false") return { kind: "set", value: false };
      return void 0;
    }
  };
}
var CardForm = class {
  /**
   * @param scope - the bound settings scope for this card's namespace.
   * @param specs - the section fields this card edits.
   */
  constructor(scope, specs) {
    this.scope = scope;
    this.staged = /* @__PURE__ */ new Map();
    this.listeners = /* @__PURE__ */ new Set();
    this.saving = false;
    this.failed = false;
    this.specs = new Map(specs.map((spec) => [spec.field, spec]));
    this.scope.subscribe(() => this.publish());
  }
  /** Publish a projection of this form, rebuilt whenever the scope or a draft changes. */
  bind(project, createStore) {
    const store = createStore(project());
    this.listeners.add(() => store.set(project()));
    return store;
  }
  /** Read the card-level state: what the Host serves, and what a save would do. */
  shell() {
    const snapshot = this.scope.getSnapshot();
    return {
      available: snapshot.status === "ready",
      writable: snapshot.writable,
      dirty: this.plan().length > 0,
      invalid: this.plan().some((item) => item.run === void 0),
      saving: this.saving,
      failed: this.failed
    };
  }
  /** Read one field's state from the effective section and its staged draft. */
  field(field) {
    const spec = this.specOf(field);
    const staged = this.staged.get(field);
    if (staged === void 0) {
      return {
        text: spec.format(this.sectionValue(field)),
        overridden: this.stored(field),
        invalid: false
      };
    }
    const write = staged.clear ? { kind: "clear" } : spec.parse(staged.text);
    return {
      text: staged.text,
      overridden: write?.kind === "set",
      invalid: write === void 0
    };
  }
  /** The actions the card's slot registration injects. */
  actions() {
    return {
      edit: (field, text) => this.stage(field, { text, clear: false }),
      resetField: (field) => {
        this.stage(field, { text: this.specOf(field).format(this.baseValue(field)), clear: true });
      },
      save: () => void this.save(),
      discard: () => {
        if (this.staged.size === 0 && !this.failed) return;
        this.staged.clear();
        this.failed = false;
        this.publish();
      }
    };
  }
  /**
   * Write every staged edit, then re-seed from what the Host accepted.
   * @returns settlement after every write and the read-back.
   */
  async save() {
    const plan = this.plan();
    const writes = plan.flatMap((item) => item.run === void 0 ? [] : [item.run]);
    if (plan.length === 0 || this.saving || writes.length !== plan.length) return;
    const fields = new Set(plan.map((item) => item.field));
    this.saving = true;
    this.failed = false;
    this.publish();
    let landed = true;
    for (const write of writes) {
      landed = await write() && landed;
    }
    if (landed) {
      for (const field of fields) this.staged.delete(field);
    }
    this.saving = false;
    this.failed = !landed;
    this.publish();
  }
  /**
   * Every staged edit a save would write. An entry whose draft is not a value
   * its field accepts carries no write: the form is still dirty, and the save
   * refuses rather than dropping the edit. A staged edit that matches the
   * effective section is not a write at all.
   */
  plan() {
    const plan = [];
    for (const [field, staged] of this.staged) {
      const spec = this.specOf(field);
      if (staged.clear) {
        if (this.stored(field)) plan.push({ field, run: () => this.clear(field) });
        continue;
      }
      if (staged.text === spec.format(this.sectionValue(field))) continue;
      const write = spec.parse(staged.text);
      if (write === void 0) plan.push({ field, run: void 0 });
      else if (write.kind === "clear") plan.push({ field, run: () => this.clear(field) });
      else plan.push({ field, run: () => this.store(field, write.value) });
    }
    return plan;
  }
  async clear(field) {
    await this.scope.unset(field);
    return !this.stored(field);
  }
  async store(field, value) {
    await this.scope.set(field, value);
    return this.userLayer()?.[field] === value;
  }
  stage(field, edit) {
    this.staged.set(field, edit);
    this.failed = false;
    this.publish();
  }
  specOf(field) {
    const spec = this.specs.get(field);
    if (spec === void 0) throw new Error(`settings card has no field ${field}`);
    return spec;
  }
  sectionValue(field) {
    return this.scope.getSnapshot().value?.[field];
  }
  baseValue(field) {
    return this.scope.getSnapshot().base?.[field];
  }
  userLayer() {
    return this.scope.getSnapshot().user;
  }
  stored(field) {
    const user = this.userLayer();
    return user !== void 0 && Object.prototype.hasOwnProperty.call(user, field);
  }
  publish() {
    for (const listener of this.listeners) listener();
  }
};

// src/client/styles.ts
var css = `
.dshAcCard {
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-3);
  border-radius: 12px;
  list-style: none;
  transition: border-color .16s, background .16s;
}
.dshAcCard:hover { border-color: var(--dsw-alias-label-dimmed); }
.dshAcCardOpen {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-label-dimmed);
}
.dshAcHeader {
  appearance: none;
  width: 100%;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: none;
  border: 0;
  border-radius: 12px;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  display: flex;
}
.dshAcHeader:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.dshAcHeadText { flex-direction: column; flex: 1; gap: 4px; min-width: 0; display: flex; }
.dshAcName { color: var(--dsw-alias-label-primary); font-size: 15px; font-weight: 600; line-height: 1.4; }
.dshAcDescription { color: var(--dsw-alias-label-tertiary); font-size: 13px; line-height: 1.5; }
.dshAcChevron { color: var(--dsw-alias-label-tertiary); flex: none; transition: transform .16s; }
.dshAcChevronOpen { transform: rotate(180deg); }
.dshAcBody { border-top: 1px solid var(--dsw-alias-border-l2); margin: 0 16px; padding-bottom: 8px; }
.dshAcReadOnly { color: var(--dsw-alias-label-tertiary); margin: 12px 0 0; font-size: 12px; line-height: 1.5; }
.dshAcPending {
  white-space: nowrap;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
  border-radius: 999px;
  flex: none;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 500;
  line-height: 17px;
}
.dshAcFooter {
  border-top: 1px solid var(--dsw-alias-border-l2);
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  padding: 12px 0 4px;
  display: flex;
}
.dshAcFailed { min-width: 0; color: var(--dsw-alias-label-error); flex: 1; margin: 0; font-size: 12px; line-height: 1.5; }
.dshAcDiscard, .dshAcSave {
  appearance: none;
  font: inherit;
  cursor: pointer;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 5px 14px;
  font-size: 13px;
  line-height: 1.5;
}
.dshAcDiscard { border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); background: none; }
.dshAcDiscard:hover:not(:disabled) { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-dimmed); }
.dshAcSave { background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-layer-3); }
.dshAcDiscard:disabled, .dshAcSave:disabled { opacity: .4; cursor: default; }
.dshAcDiscard:focus-visible, .dshAcSave:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dshAcField { flex-direction: column; gap: 6px; padding: 12px 0; display: flex; }
.dshAcField + .dshAcField { border-top: 1px solid var(--dsw-alias-border-l2); }
.dshAcHead { align-items: center; gap: 8px; display: flex; }
.dshAcLabel { min-width: 0; color: var(--dsw-alias-label-primary); flex: 1; font-size: 13px; font-weight: 500; line-height: 1.5; }
.dshAcBadges { align-items: center; gap: 8px; display: inline-flex; }
.dshAcBadge {
  white-space: nowrap;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 500;
  line-height: 17px;
}
.dshAcReset {
  font: inherit;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
  font-size: 12px;
  line-height: 1.5;
}
.dshAcReset:hover:not(:disabled) { color: var(--dsw-alias-label-primary); }
.dshAcReset:disabled { cursor: default; }
.dshAcInput {
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-3);
  height: 34px;
  font: inherit;
  color: var(--dsw-alias-label-primary);
  border-radius: 8px;
  padding: 0 12px;
  font-size: 13px;
  line-height: 1.5;
}
.dshAcInput:focus-visible { border-color: var(--dsw-alias-brand-primary); outline: none; }
.dshAcInput:disabled { color: var(--dsw-alias-label-tertiary); cursor: default; }
.dshAcInputInvalid { border-color: var(--dsw-alias-label-error); }
.dshAcSelect {
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-3);
  height: 34px;
  font: inherit;
  color: var(--dsw-alias-label-primary);
  border-radius: 8px;
  padding: 0 8px;
  font-size: 13px;
  line-height: 1.5;
}
.dshAcSelect:focus-visible { border-color: var(--dsw-alias-brand-primary); outline: none; }
.dshAcSelect:disabled { color: var(--dsw-alias-label-tertiary); cursor: default; }
.dshAcInvalid { color: var(--dsw-alias-label-error); margin: 0; font-size: 12px; line-height: 1.5; }
.dshAcHint { color: var(--dsw-alias-label-tertiary); margin: 0; font-size: 12px; line-height: 1.5; }
`;
function injectStyles() {
  if (typeof document === "undefined") return;
  if (document.querySelector('style[data-plugin-css="auto-continue/card"]') !== null) return;
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-client-auto-continue";
  tag.dataset.pluginCss = "auto-continue/card";
  tag.textContent = css;
  document.head.appendChild(tag);
}

// src/client/settings-card.tsx
var import_jsx_runtime = require("react/jsx-runtime");
injectStyles();
var AutoContinueSettingsCardController = class {
  /**
   * @param scope - the bound settings scope for the `auto-continue` namespace.
   */
  constructor(scope) {
    this.form = new CardForm(scope, [
      textField("continueText"),
      numberField("graceMs", 0),
      numberField("cooldownMs", 0),
      numberField("maxConsecutive", 1),
      booleanField("scanOnBoot"),
      numberField("scanLimit", 1),
      numberField("freshMs", 0),
      numberField("reconnectScanDelayMs", 0),
      numberField("reconnectBackoffMs", 0),
      booleanField("verbose")
    ]);
    this.store = this.form.bind(() => this.projection(), import_client.createSnapshotStore);
  }
  projection() {
    return {
      ...this.form.shell(),
      continueText: this.form.field("continueText"),
      graceMs: this.form.field("graceMs"),
      cooldownMs: this.form.field("cooldownMs"),
      maxConsecutive: this.form.field("maxConsecutive"),
      scanOnBoot: this.form.field("scanOnBoot"),
      scanLimit: this.form.field("scanLimit"),
      freshMs: this.form.field("freshMs"),
      reconnectScanDelayMs: this.form.field("reconnectScanDelayMs"),
      reconnectBackoffMs: this.form.field("reconnectBackoffMs"),
      verbose: this.form.field("verbose")
    };
  }
  /**
   * Build the face the card's slot registration injects.
   * @returns the card's snapshot and its form actions.
   */
  inject() {
    return { hooks: { autoContinueSettingsCard: this.store }, ...this.form.actions() };
  }
};
function SettingsCard(props) {
  const [open, setOpen] = (0, import_react.useState)(false);
  const { state } = props;
  if (!state.available) return null;
  const title = props.t(props.titleKey);
  const blocked = !state.dirty || state.invalid || state.saving;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { className: open ? "dshAcCard dshAcCardOpen" : "dshAcCard", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        type: "button",
        className: "dshAcHeader",
        "aria-expanded": open,
        "aria-label": `${props.t(open ? "chrome.collapse" : "chrome.expand")}: ${title}`,
        title: props.t(props.descriptionKey),
        onClick: () => setOpen(!open),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dshAcHeadText", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshAcName", children: title }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshAcDescription", children: props.t(props.descriptionKey) })
          ] }),
          state.dirty ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshAcPending", title: props.t("chrome.unsaved"), children: props.t("chrome.unsaved") }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: open ? "dshAcChevron dshAcChevronOpen" : "dshAcChevron", children: "▾" })
        ]
      }
    ),
    open ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshAcBody", children: [
      !state.writable ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dshAcReadOnly", role: "status", children: props.t("chrome.readOnly") }) : null,
      props.children,
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshAcFooter", children: [
        state.failed ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dshAcFailed", role: "status", children: props.t("chrome.saveFailed") }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "dshAcDiscard",
            disabled: !state.dirty || state.saving,
            onClick: props.onDiscard,
            children: props.t("chrome.discard")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dshAcSave", disabled: blocked, onClick: props.onSave, children: props.t(!state.saving ? "chrome.save" : "chrome.saving") })
      ] })
    ] }) : null
  ] });
}
function ValueField(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshAcField", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshAcHead", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "dshAcLabel", htmlFor: props.id, children: props.label }),
      props.overridden ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dshAcBadges", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshAcBadge", children: props.t("chrome.overridden") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dshAcReset", disabled: props.disabled, onClick: props.onReset, children: props.t("chrome.reset") })
      ] }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "input",
      {
        id: props.id,
        className: props.invalid ? "dshAcInput dshAcInputInvalid" : "dshAcInput",
        type: "text",
        inputMode: props.numeric === true ? "numeric" : void 0,
        "aria-invalid": props.invalid || void 0,
        value: props.text,
        placeholder: props.placeholder ?? "",
        disabled: props.disabled,
        onChange: (event) => props.onEdit(event.target.value)
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: props.invalid ? "dshAcInvalid" : "dshAcHint", children: props.invalid ? props.t("chrome.invalidNumber") : props.hint })
  ] });
}
function BooleanField(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshAcField", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshAcHead", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "dshAcLabel", htmlFor: props.id, children: props.label }),
      props.overridden ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dshAcBadges", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshAcBadge", children: props.t("chrome.overridden") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dshAcReset", disabled: props.disabled, onClick: props.onReset, children: props.t("chrome.reset") })
      ] }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "select",
      {
        id: props.id,
        className: "dshAcSelect",
        value: props.text,
        disabled: props.disabled,
        onChange: (event) => props.onEdit(event.target.value),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: props.t("chrome.inherit") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "true", children: props.t("chrome.on") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "false", children: props.t("chrome.off") })
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dshAcHint", children: props.hint })
  ] });
}
function AutoContinueSettingsCard(props) {
  const { t } = props;
  const state = props.useAutoContinueSettingsCard((snapshot) => snapshot);
  const disabled = !state.writable;
  const shared = { t, disabled };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    SettingsCard,
    {
      t,
      titleKey: "card.title",
      descriptionKey: "card.description",
      state,
      onSave: props.save,
      onDiscard: props.discard,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          ValueField,
          {
            id: "auto-continue-continue-text",
            label: t("field.continueText"),
            hint: t("field.continueTextHint"),
            ...shared,
            ...state.continueText,
            onEdit: (text) => props.edit("continueText", text),
            onReset: () => props.resetField("continueText")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          ValueField,
          {
            id: "auto-continue-grace-ms",
            label: t("field.graceMs"),
            hint: t("field.graceMsHint"),
            numeric: true,
            ...shared,
            ...state.graceMs,
            onEdit: (text) => props.edit("graceMs", text),
            onReset: () => props.resetField("graceMs")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          ValueField,
          {
            id: "auto-continue-cooldown-ms",
            label: t("field.cooldownMs"),
            hint: t("field.cooldownMsHint"),
            numeric: true,
            ...shared,
            ...state.cooldownMs,
            onEdit: (text) => props.edit("cooldownMs", text),
            onReset: () => props.resetField("cooldownMs")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          ValueField,
          {
            id: "auto-continue-max-consecutive",
            label: t("field.maxConsecutive"),
            hint: t("field.maxConsecutiveHint"),
            numeric: true,
            ...shared,
            ...state.maxConsecutive,
            onEdit: (text) => props.edit("maxConsecutive", text),
            onReset: () => props.resetField("maxConsecutive")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          BooleanField,
          {
            id: "auto-continue-scan-on-boot",
            label: t("field.scanOnBoot"),
            hint: t("field.scanOnBootHint"),
            ...shared,
            ...state.scanOnBoot,
            onEdit: (text) => props.edit("scanOnBoot", text),
            onReset: () => props.resetField("scanOnBoot")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          ValueField,
          {
            id: "auto-continue-scan-limit",
            label: t("field.scanLimit"),
            hint: t("field.scanLimitHint"),
            numeric: true,
            ...shared,
            ...state.scanLimit,
            onEdit: (text) => props.edit("scanLimit", text),
            onReset: () => props.resetField("scanLimit")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          ValueField,
          {
            id: "auto-continue-fresh-ms",
            label: t("field.freshMs"),
            hint: t("field.freshMsHint"),
            numeric: true,
            ...shared,
            ...state.freshMs,
            onEdit: (text) => props.edit("freshMs", text),
            onReset: () => props.resetField("freshMs")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          ValueField,
          {
            id: "auto-continue-reconnect-scan-delay",
            label: t("field.reconnectScanDelayMs"),
            hint: t("field.reconnectScanDelayMsHint"),
            numeric: true,
            ...shared,
            ...state.reconnectScanDelayMs,
            onEdit: (text) => props.edit("reconnectScanDelayMs", text),
            onReset: () => props.resetField("reconnectScanDelayMs")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          ValueField,
          {
            id: "auto-continue-reconnect-backoff",
            label: t("field.reconnectBackoffMs"),
            hint: t("field.reconnectBackoffMsHint"),
            numeric: true,
            ...shared,
            ...state.reconnectBackoffMs,
            onEdit: (text) => props.edit("reconnectBackoffMs", text),
            onReset: () => props.resetField("reconnectBackoffMs")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          BooleanField,
          {
            id: "auto-continue-verbose",
            label: t("field.verbose"),
            hint: t("field.verboseHint"),
            ...shared,
            ...state.verbose,
            onEdit: (text) => props.edit("verbose", text),
            onReset: () => props.resetField("verbose")
          }
        )
      ]
    }
  );
}

// src/client/index.ts
var NS = "auto-continue";
var SETTINGS_NS = "auto-continue";
var inject = ["slots", "locale", "connection", "settingsScope"];
var current = null;
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "auto-continue: dictionaries");
  const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NS });
  current?.dispose();
  current = new AutoContinueRunner(ctx.connection.api, () => resolveConfig(scope.getSnapshot().value));
  const controller = new AutoContinueSettingsCardController(scope);
  ctx.slots.inject(
    "settings.plugin.item",
    () => ctx.slots.register(
      {
        name: "settings.plugin.item",
        id: "auto-continue",
        order: 90,
        locale: NS,
        inject: () => controller.inject()
      },
      AutoContinueSettingsCard
    )
  );
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2NsaWVudC9pbmRleC50cyIsICJzcmMvY2xpZW50L2VuZ2luZS50cyIsICJzcmMvY2xpZW50L2xvY2FsZXMudHMiLCAic3JjL2NsaWVudC9zZXR0aW5ncy1jYXJkLnRzeCIsICJzcmMvY2xpZW50L3NldHRpbmdzLWZvcm0udHMiLCAic3JjL2NsaWVudC9zdHlsZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qKlxuICogQXV0by1jb250aW51ZSBwbHVnaW4sIGJyb3dzZXIgaGFsZi5cbiAqXG4gKiAtIFJ1bnMgdGhlIGF1dG8tY29udGludWUgZW5naW5lIG92ZXIgdGhlIGxpdmUgbXV4ICsgaG9zdCBldmVudCBzdHJlYW1zLlxuICogLSBSZWdpc3RlcnMgdGhlIGBhdXRvLWNvbnRpbnVlYCBzZXR0aW5ncyBjYXJkIGludG8gdGhlIHBsdWdpbi1jb25maWd1cmF0aW9uXG4gKiAgIHNlY3Rpb24gKGBzZXR0aW5ncy5wbHVnaW4uaXRlbWApLCBlZGl0aW5nIHRoZSBzYW1lIG5hbWVzcGFjZSB0aGUgZW5naW5lXG4gKiAgIHJlYWRzIOKAlCBldmVyeSBiZWhhdmlvciBrbm9iIGlzIGNvbmZpZ3VyYWJsZSBmcm9tIHRoZSBHVUkuXG4gKi9cbmltcG9ydCB0eXBlIHsgQ2xpZW50Q29udGV4dCB9IGZyb20gJ0BkZWVwc2Vlay1haS9kc2gtY2xpZW50LXJ1bnRpbWUvY2xpZW50JztcbmltcG9ydCB0eXBlIHsgQ29ubmVjdGlvbkhhbmRsZSB9IGZyb20gJ0BkZWVwc2Vlay1haS9kc2gtY2xpZW50LWNvbm5lY3Rpb24vY2xpZW50Jztcbi8vIFR5cGUtb25seTogcHVsbHMgdGhlIGxvY2FsZSBwbHVnaW4ncyBDb250ZXh0IG1lcmdlIChjdHgubG9jYWxlKS5cbmltcG9ydCB0eXBlIHt9IGZyb20gJ0BkZWVwc2Vlay1haS9kc2gtY2xpZW50LWxvY2FsZS9jbGllbnQnO1xuLy8gVHlwZS1vbmx5OiBwdWxscyB0aGUgc2V0dGluZ3Mtc3VyZmFjZSBTbG90TWFwIG1lcmdlIGFuZCBjdHguc2V0dGluZ3NTY29wZS5cbmltcG9ydCB0eXBlIHt9IGZyb20gJ0BkZWVwc2Vlay1haS9kc2gtY2xpZW50LXVpLXNldHRpbmdzL2NsaWVudCc7XG4vLyBUeXBlLW9ubHk6IHB1bGxzIHRoZSBgc2V0dGluZ3MucGx1Z2luLml0ZW1gIFNsb3RNYXAgbWVyZ2UuXG5pbXBvcnQgdHlwZSB7fSBmcm9tICdAZGVlcHNlZWstYWkvZHNoLWNsaWVudC11aS1zZXR0aW5ncy1wbHVnaW5zL2NsaWVudCc7XG5pbXBvcnQgeyBBdXRvQ29udGludWVSdW5uZXIsIHJlc29sdmVDb25maWcsIHR5cGUgQXV0b0NvbnRpbnVlU2V0dGluZ3MgfSBmcm9tICcuL2VuZ2luZS50cyc7XG5pbXBvcnQgeyBlbiwgemgsIHR5cGUgU2V0dGluZ3NDYXJkS2V5IH0gZnJvbSAnLi9sb2NhbGVzLnRzJztcbmltcG9ydCB7XG4gIEF1dG9Db250aW51ZVNldHRpbmdzQ2FyZCxcbiAgQXV0b0NvbnRpbnVlU2V0dGluZ3NDYXJkQ29udHJvbGxlcixcbn0gZnJvbSAnLi9zZXR0aW5ncy1jYXJkLnRzeCc7XG5cbi8qKiDlrqLmiLfnq6/moLnkuIrkuIvmlofnmoQgY29ubmVjdGlvbiDmnI3liqEo55SxIGRzaC1jbGllbnQtY29ubmVjdGlvbiDmjILovb0p44CCICovXG5kZWNsYXJlIG1vZHVsZSAnQGRlZXBzZWVrLWFpL2NvcmRpcycge1xuICBpbnRlcmZhY2UgQ29udGV4dCB7XG4gICAgY29ubmVjdGlvbjogQ29ubmVjdGlvbkhhbmRsZTtcbiAgfVxufVxuXG4vKiogRGljdGlvbmFyeSBuYW1lc3BhY2Ugb3duZWQgYnkgdGhpcyBwbHVnaW4uICovXG5jb25zdCBOUyA9ICdhdXRvLWNvbnRpbnVlJztcblxuLyoqIFNldHRpbmdzIG5hbWVzcGFjZSB0aGUgZW5naW5lIHJlYWRzIGFuZCB0aGUgc2V0dGluZ3MgY2FyZCBlZGl0cy4gKi9cbmNvbnN0IFNFVFRJTkdTX05TID0gJ2F1dG8tY29udGludWUnO1xuXG5kZWNsYXJlIG1vZHVsZSAnQGRlZXBzZWVrLWFpL2RzaC1jbGllbnQtdWktc2xvdHMnIHtcbiAgaW50ZXJmYWNlIExvY2FsZU5hbWVzcGFjZU1hcCB7XG4gICAgLyoqIGF1dG8tY29udGludWUgc2V0dGluZ3MtY2FyZCBjb3B5LiAqL1xuICAgICdhdXRvLWNvbnRpbnVlJzogU2V0dGluZ3NDYXJkS2V5O1xuICB9XG59XG5cbi8qKiBTZXJ2aWNlcyByZXF1aXJlZCBieSB0aGlzIHBsdWdpbi4gKi9cbmV4cG9ydCBjb25zdCBpbmplY3QgPSBbJ3Nsb3RzJywgJ2xvY2FsZScsICdjb25uZWN0aW9uJywgJ3NldHRpbmdzU2NvcGUnXTtcblxuLyoqIOW9k+WJjSBydW5uZXIoSE1SIOmHjei9veaXtuWFiOmUgOavgeaXp+eahOWGjeW7uuaWsOeahCnjgIIgKi9cbmxldCBjdXJyZW50OiBBdXRvQ29udGludWVSdW5uZXIgfCBudWxsID0gbnVsbDtcblxuLyoqXG4gKiBQbHVnaW4gYm9keTogbW91bnQgdGhlIGVuZ2luZSBhbmQgdGhlIHNldHRpbmdzIGNhcmQuXG4gKiBAcGFyYW0gY3R4IC0gY2xpZW50IHJvb3QgY29udGV4dC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5KGN0eDogQ2xpZW50Q29udGV4dCk6IHZvaWQge1xuICBjdHguZWZmZWN0KCgpID0+IGN0eC5sb2NhbGUucmVnaXN0ZXIoTlMsIHsgemgsIGVuIH0pLCAnYXV0by1jb250aW51ZTogZGljdGlvbmFyaWVzJyk7XG5cbiAgLy8gRW5naW5lOiByZWFkcyB0aGUgc2V0dGluZ3Mgc2NvcGUgbGl2ZSwgc28gR1VJIGNoYW5nZXMgYXBwbHkgaW1tZWRpYXRlbHkuXG4gIGNvbnN0IHNjb3BlID0gY3R4LnNldHRpbmdzU2NvcGUuYmluZDxBdXRvQ29udGludWVTZXR0aW5ncz4oeyBuYW1lc3BhY2U6IFNFVFRJTkdTX05TIH0pO1xuICBjdXJyZW50Py5kaXNwb3NlKCk7XG4gIGN1cnJlbnQgPSBuZXcgQXV0b0NvbnRpbnVlUnVubmVyKGN0eC5jb25uZWN0aW9uLmFwaSwgKCkgPT4gcmVzb2x2ZUNvbmZpZyhzY29wZS5nZXRTbmFwc2hvdCgpLnZhbHVlKSk7XG5cbiAgLy8gUGx1Z2luIGNvbmZpZ3VyYXRpb24gY2FyZDogb25lIHN0YWdlZCBmb3JtIG92ZXIgdGhlIGBhdXRvLWNvbnRpbnVlYFxuICAvLyBzZXR0aW5ncyBuYW1lc3BhY2UsIGNvbnRyaWJ1dGVkIHRvIHRoZSBwbHVnaW4tY29uZmlndXJhdGlvbiBzZWN0aW9uLlxuICBjb25zdCBjb250cm9sbGVyID0gbmV3IEF1dG9Db250aW51ZVNldHRpbmdzQ2FyZENvbnRyb2xsZXIoc2NvcGUpO1xuICBjdHguc2xvdHMuaW5qZWN0KCdzZXR0aW5ncy5wbHVnaW4uaXRlbScsICgpID0+XG4gICAgY3R4LnNsb3RzLnJlZ2lzdGVyKFxuICAgICAge1xuICAgICAgICBuYW1lOiAnc2V0dGluZ3MucGx1Z2luLml0ZW0nLFxuICAgICAgICBpZDogJ2F1dG8tY29udGludWUnLFxuICAgICAgICBvcmRlcjogOTAsXG4gICAgICAgIGxvY2FsZTogTlMsXG4gICAgICAgIGluamVjdDogKCkgPT4gY29udHJvbGxlci5pbmplY3QoKSxcbiAgICAgIH0sXG4gICAgICBBdXRvQ29udGludWVTZXR0aW5nc0NhcmQsXG4gICAgKSxcbiAgKTtcbn1cbiIsICIvKipcbiAqIEF1dG8tY29udGludWUgZW5naW5lIOKAlCBicm93c2VyIGhhbGYgY29yZS5cbiAqXG4gKiBXYXRjaGVzIHRoZSB0d28gbGl2ZSBldmVudCBzdHJlYW1zIG9mIHRoZSBkc2ggd2ViIEdVSSAobXV4ICsgaG9zdCk6XG4gKiAgIC0gdHVybnMgZW5kZWQgZm9yIGEgbm9uLWh1bWFuIHJlYXNvbiAoYHR1cm4vZW5kYCByZWFzb24g4oiIIGVycm9yIC8gaW50ZXJydXB0ZWQgLyBtYXgtdG9rZW5zKVxuICogICAtIGhvc3QtcmVwb3J0ZWQgYWdlbnQgZmFpbHVyZXMgd2l0aCBubyB0dXJuIHBvc2l0aW9uIChgaG9zdC9hZ2VudC1lcnJvcmApXG4gKiBBZnRlciBhIGdyYWNlIHBlcmlvZCBpdCBzZW5kcyBhIHF1ZXVlZCBwcm9tcHQgKGRlZmF1bHQg44CM57un57ut44CNKSB0byB0aGF0XG4gKiBzZXNzaW9uIOKAlCBleGFjdGx5IGVxdWl2YWxlbnQgdG8gdGhlIHVzZXIgdHlwaW5nIGl0IG1hbnVhbGx5LlxuICpcbiAqIEFsbCBiZWhhdmlvciBpcyBkcml2ZW4gYnkgdGhlIGBhdXRvLWNvbnRpbnVlYCBzZXR0aW5ncyBuYW1lc3BhY2UgKHNlZSB0aGVcbiAqIHBsdWdpbidzIHNldHRpbmdzIGNhcmQpOyBldmVyeSBrbm9iIGJlbG93IGlzIHVzZXItY29uZmlndXJhYmxlIHRoZXJlLlxuICovXG5cbmltcG9ydCB0eXBlIHtcbiAgSG9zdEZyYW1lLFxuICBJQXBpQ2xpZW50LFxuICBNdXhGcmFtZSxcbiAgU2Vzc2lvbklkLFxuICBTZXNzaW9uU3VtbWFyeSxcbn0gZnJvbSAnQGRlZXBzZWVrLWFpL2RzaC1jbGllbnQtY29ubmVjdGlvbi9jbGllbnQnO1xuaW1wb3J0IHR5cGUgeyBTZXNzaW9uRXZlbnQgfSBmcm9tICdAZGVlcHNlZWstYWkvZHNoLXNlc3Npb24vdHlwZXMnO1xuXG4vKiogVGhlIGBhdXRvLWNvbnRpbnVlYCBzZXR0aW5ncyBzZWN0aW9uIChhbGwgZmllbGRzIG9wdGlvbmFsIG9uIHRoZSB3aXJlOyB0aGUgaG9zdCBzY2hlbWEgY2FycmllcyBkZWZhdWx0cykuICovXG5leHBvcnQgaW50ZXJmYWNlIEF1dG9Db250aW51ZVNldHRpbmdzIHtcbiAgLyoqIFRleHQgYXV0b21hdGljYWxseSBzZW50IGFmdGVyIGFuIGludGVycnVwdGlvbi4gKi9cbiAgY29udGludWVUZXh0Pzogc3RyaW5nO1xuICAvKiogR3JhY2UgcGVyaW9kIGFmdGVyIGFuIGludGVycnVwdGlvbiBiZWZvcmUgYXV0by1zZW5kaW5nIChtcykuICovXG4gIGdyYWNlTXM/OiBudW1iZXI7XG4gIC8qKiBNaW5pbXVtIGludGVydmFsIGJldHdlZW4gdHdvIGF1dG8tY29udGludWVzIHBlciBzZXNzaW9uIChtcykuICovXG4gIGNvb2xkb3duTXM/OiBudW1iZXI7XG4gIC8qKiBNYXggY29uc2VjdXRpdmUgYXV0by1jb250aW51ZXMgcGVyIHNlc3Npb24gYmVmb3JlIHN0b3BwaW5nLiAqL1xuICBtYXhDb25zZWN1dGl2ZT86IG51bWJlcjtcbiAgLyoqIFNjYW4gcmVjZW50bHkgaW50ZXJydXB0ZWQgc2Vzc2lvbnMgb24gcGFnZSBsb2FkIC8gcmVjb25uZWN0LiAqL1xuICBzY2FuT25Cb290PzogYm9vbGVhbjtcbiAgLyoqIE1heCBzZXNzaW9ucyB0aGUgc2NhbiBjaGVja3MgKG1vc3QgcmVjZW50bHkgdXBkYXRlZCkuICovXG4gIHNjYW5MaW1pdD86IG51bWJlcjtcbiAgLyoqIFNjYW4gb25seSBjb25zaWRlcnMgaW50ZXJydXB0aW9ucyBpbnNpZGUgdGhpcyB3aW5kb3cgKG1zKS4gKi9cbiAgZnJlc2hNcz86IG51bWJlcjtcbiAgLyoqIERlbGF5IGJlZm9yZSBzY2FubmluZyBhZnRlciBhIHJlY29ubmVjdCAobXMpLiAqL1xuICByZWNvbm5lY3RTY2FuRGVsYXlNcz86IG51bWJlcjtcbiAgLyoqIFNTRSByZWNvbm5lY3QgYmFja29mZiAobXMpLiAqL1xuICByZWNvbm5lY3RCYWNrb2ZmTXM/OiBudW1iZXI7XG4gIC8qKiBMb2cgYFthdXRvLWNvbnRpbnVlXWAgbGluZXMgdG8gdGhlIGJyb3dzZXIgY29uc29sZS4gKi9cbiAgdmVyYm9zZT86IGJvb2xlYW47XG59XG5cbi8qKiBGdWxseSByZXNvbHZlZCBjb25maWd1cmF0aW9uIChidWlsdC1pbiBkZWZhdWx0cyArIHVzZXIgb3ZlcnJpZGVzKS4gKi9cbmV4cG9ydCB0eXBlIEF1dG9Db250aW51ZUNvbmZpZyA9IFJlcXVpcmVkPEF1dG9Db250aW51ZVNldHRpbmdzPjtcblxuLyoqIEJ1aWx0LWluIGRlZmF1bHRzIOKAlCBtdXN0IG1hdGNoIHRoZSBob3N0IHNjaGVtYSBkZWZhdWx0cyBpbiBzcmMvaW5kZXgudHMuICovXG5leHBvcnQgY29uc3QgREVGQVVMVF9DT05GSUc6IEF1dG9Db250aW51ZUNvbmZpZyA9IHtcbiAgY29udGludWVUZXh0OiAn57un57utJyxcbiAgZ3JhY2VNczogMzAwMCxcbiAgY29vbGRvd25NczogMjAwMDAsXG4gIG1heENvbnNlY3V0aXZlOiAzLFxuICBzY2FuT25Cb290OiB0cnVlLFxuICBzY2FuTGltaXQ6IDgsXG4gIGZyZXNoTXM6IDE1ICogNjAgKiAxMDAwLFxuICByZWNvbm5lY3RTY2FuRGVsYXlNczogNTAwMCxcbiAgcmVjb25uZWN0QmFja29mZk1zOiAzMDAwLFxuICB2ZXJib3NlOiB0cnVlLFxufTtcblxuZnVuY3Rpb24gbnVtYmVyT3IodmFsdWU6IHVua25vd24sIGZhbGxiYWNrOiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUodmFsdWUpICYmIHZhbHVlID49IDAgPyB2YWx1ZSA6IGZhbGxiYWNrO1xufVxuXG5mdW5jdGlvbiBib29sZWFuT3IodmFsdWU6IHVua25vd24sIGZhbGxiYWNrOiBib29sZWFuKTogYm9vbGVhbiB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJyA/IHZhbHVlIDogZmFsbGJhY2s7XG59XG5cbi8qKiBSZXNvbHZlIGEgKHBvc3NpYmx5IHBhcnRpYWwgLyBub3QteWV0LWxvYWRlZCkgc2V0dGluZ3Mgc2VjdGlvbiB0byBhIGZ1bGwgY29uZmlnLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVDb25maWcoc2VjdGlvbjogQXV0b0NvbnRpbnVlU2V0dGluZ3MgfCB1bmRlZmluZWQpOiBBdXRvQ29udGludWVDb25maWcge1xuICBjb25zdCB2YWx1ZSA9IHNlY3Rpb24gPz8ge307XG4gIGNvbnN0IHRleHQgPVxuICAgIHR5cGVvZiB2YWx1ZS5jb250aW51ZVRleHQgPT09ICdzdHJpbmcnICYmIHZhbHVlLmNvbnRpbnVlVGV4dC50cmltKCkgIT09ICcnXG4gICAgICA/IHZhbHVlLmNvbnRpbnVlVGV4dFxuICAgICAgOiBERUZBVUxUX0NPTkZJRy5jb250aW51ZVRleHQ7XG4gIHJldHVybiB7XG4gICAgY29udGludWVUZXh0OiB0ZXh0LFxuICAgIGdyYWNlTXM6IG51bWJlck9yKHZhbHVlLmdyYWNlTXMsIERFRkFVTFRfQ09ORklHLmdyYWNlTXMpLFxuICAgIGNvb2xkb3duTXM6IG51bWJlck9yKHZhbHVlLmNvb2xkb3duTXMsIERFRkFVTFRfQ09ORklHLmNvb2xkb3duTXMpLFxuICAgIG1heENvbnNlY3V0aXZlOiBNYXRoLm1heCgxLCBudW1iZXJPcih2YWx1ZS5tYXhDb25zZWN1dGl2ZSwgREVGQVVMVF9DT05GSUcubWF4Q29uc2VjdXRpdmUpKSxcbiAgICBzY2FuT25Cb290OiBib29sZWFuT3IodmFsdWUuc2Nhbk9uQm9vdCwgREVGQVVMVF9DT05GSUcuc2Nhbk9uQm9vdCksXG4gICAgc2NhbkxpbWl0OiBNYXRoLm1heCgxLCBudW1iZXJPcih2YWx1ZS5zY2FuTGltaXQsIERFRkFVTFRfQ09ORklHLnNjYW5MaW1pdCkpLFxuICAgIGZyZXNoTXM6IG51bWJlck9yKHZhbHVlLmZyZXNoTXMsIERFRkFVTFRfQ09ORklHLmZyZXNoTXMpLFxuICAgIHJlY29ubmVjdFNjYW5EZWxheU1zOiBudW1iZXJPcih2YWx1ZS5yZWNvbm5lY3RTY2FuRGVsYXlNcywgREVGQVVMVF9DT05GSUcucmVjb25uZWN0U2NhbkRlbGF5TXMpLFxuICAgIHJlY29ubmVjdEJhY2tvZmZNczogbnVtYmVyT3IodmFsdWUucmVjb25uZWN0QmFja29mZk1zLCBERUZBVUxUX0NPTkZJRy5yZWNvbm5lY3RCYWNrb2ZmTXMpLFxuICAgIHZlcmJvc2U6IGJvb2xlYW5Pcih2YWx1ZS52ZXJib3NlLCBERUZBVUxUX0NPTkZJRy52ZXJib3NlKSxcbiAgfTtcbn1cblxuLyoqIOinhuS4uuOAjOmdnuS6uuS4uuS4reaWreOAjeeahOWbnuWQiOe7k+adn+WOn+WboOOAgmFib3J0ZWQo55So5oi35YGc5q2iKeS4jiBibG9ja2VkKOetlueVpeaLkue7nSnkuI3lnKjlhbbkuK3jgIIgKi9cbnR5cGUgTm9uSHVtYW5SZWFzb24gPSAnZXJyb3InIHwgJ2ludGVycnVwdGVkJyB8ICdtYXgtdG9rZW5zJztcblxuZnVuY3Rpb24gaXNOb25IdW1hblJlYXNvbihraW5kOiBzdHJpbmcpOiBraW5kIGlzIE5vbkh1bWFuUmVhc29uIHtcbiAgcmV0dXJuIGtpbmQgPT09ICdlcnJvcicgfHwga2luZCA9PT0gJ2ludGVycnVwdGVkJyB8fCBraW5kID09PSAnbWF4LXRva2Vucyc7XG59XG5cbmZ1bmN0aW9uIHNsZWVwKG1zOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIG1zKSk7XG59XG5cbi8qKiDmtY/op4jlmajlvZPliY0gSUFOQSDml7bljLo7IOS4jeWPr+eUqOaXtuecgeeVpSjlrr/kuLvlhYHorrjnnIHnlaUp44CCICovXG5mdW5jdGlvbiBjbGllbnRUaW1lWm9uZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICB0cnkge1xuICAgIHJldHVybiBJbnRsLkRhdGVUaW1lRm9ybWF0KCkucmVzb2x2ZWRPcHRpb25zKCkudGltZVpvbmUgfHwgdW5kZWZpbmVkO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG59XG5cbi8qKiDot6jmoIfnrb7pobXkupLmlqXkuI7lhrfljbTorrDlvZUo5LuF5rWP6KeI5Zmo5pys5ZywLCDkuI3okL3nm5jliLDlrr/kuLsp44CCICovXG5jb25zdCBsb2NrUHJlZml4ID0gJ2RzaC1hdXRvLWNvbnRpbnVlOic7XG5jb25zdCBsb2NrS2V5ID0gKHNlc3Npb25JZDogU2Vzc2lvbklkKSA9PiBgJHtsb2NrUHJlZml4fWxvY2s6JHtzZXNzaW9uSWR9YDtcbmNvbnN0IHN0YW1wS2V5ID0gKHNlc3Npb25JZDogU2Vzc2lvbklkKSA9PiBgJHtsb2NrUHJlZml4fWxhc3Q6JHtzZXNzaW9uSWR9YDtcblxuLyoqIOWwneivleeLrOWNoOacrOasoeWPkemAgTog5Lik5Liq5qCH562+6aG15ZCM5pe26Kem5Y+R5pe25Y+q5pyJ5LiA5Liq5oiQ5Yqf44CCICovXG5mdW5jdGlvbiBjbGFpbVNlbmQoc2Vzc2lvbklkOiBTZXNzaW9uSWQpOiBib29sZWFuIHtcbiAgdHJ5IHtcbiAgICBjb25zdCB0b2tlbiA9IGAke0RhdGUubm93KCl9LSR7TWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMil9YDtcbiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShsb2NrS2V5KHNlc3Npb25JZCksIHRva2VuKTtcbiAgICByZXR1cm4gbG9jYWxTdG9yYWdlLmdldEl0ZW0obG9ja0tleShzZXNzaW9uSWQpKSA9PT0gdG9rZW47XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiB0cnVlOyAvLyDlrZjlgqjkuI3lj6/nlKgo6ZqQ56eB5qih5byP562JKeaXtuaUvuihjFxuICB9XG59XG5cbmZ1bmN0aW9uIHJlbGVhc2VTZW5kKHNlc3Npb25JZDogU2Vzc2lvbklkKTogdm9pZCB7XG4gIHRyeSB7XG4gICAgbG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0obG9ja0tleShzZXNzaW9uSWQpKTtcbiAgfSBjYXRjaCB7XG4gICAgLyogaWdub3JlICovXG4gIH1cbn1cblxuLyoqIOivuy/lhpnjgIzkuIrmrKHoh6rliqjlj5HpgIHjgI3ml7bpl7TmiLMo6Leo5qCH562+6aG15Ya35Y20KeOAgiAqL1xuZnVuY3Rpb24gcmVhZExhc3RTZW5kKHNlc3Npb25JZDogU2Vzc2lvbklkKTogbnVtYmVyIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gTnVtYmVyKGxvY2FsU3RvcmFnZS5nZXRJdGVtKHN0YW1wS2V5KHNlc3Npb25JZCkpID8/IDApIHx8IDA7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiAwO1xuICB9XG59XG5cbmZ1bmN0aW9uIHdyaXRlTGFzdFNlbmQoc2Vzc2lvbklkOiBTZXNzaW9uSWQsIGF0OiBudW1iZXIpOiB2b2lkIHtcbiAgdHJ5IHtcbiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShzdGFtcEtleShzZXNzaW9uSWQpLCBTdHJpbmcoYXQpKTtcbiAgfSBjYXRjaCB7XG4gICAgLyogaWdub3JlICovXG4gIH1cbn1cblxuLyoqIOavj+S8muivnei/kOihjOaXtueKtuaAgeOAgiAqL1xuaW50ZXJmYWNlIFNlc3Npb25TdGF0ZSB7XG4gIC8qKiDov57nu63oh6rliqjjgIznu6fnu63jgI3mrKHmlbA7IOaIkOWKn+WbnuWQiOaIlueUqOaIt+aJi+WKqOS7i+WFpeWQjuW9kumbtuOAgiAqL1xuICBjb25zZWN1dGl2ZTogbnVtYmVyO1xuICAvKiog5LiK5qyh6Ieq5Yqo44CM57un57ut44CN5pe26Ze05oiz44CCICovXG4gIGxhc3RBdXRvQXQ6IG51bWJlcjtcbiAgLyoqIOS4iuasoeiHquWKqOOAjOe7p+e7reOAjeWwneivlSjmiJDlip/miJblpLHotKUp5pe26Ze05oizOyDpmLLmraLlpLHotKXlnLrmma/kuIvnmoTlv6vpgJ/ph43or5Xlvqrnjq/jgIIgKi9cbiAgbGFzdEF0dGVtcHRBdDogbnVtYmVyO1xuICAvKiog5oiR5Lus5LiK5qyh6Ieq5Yqo5Y+R6YCB55qE5paH5pysKOeUqOS6juivhuWIq+iHquW3seeahOWbnuaYvinjgIIgKi9cbiAgbGFzdFNlbnRUZXh0OiBzdHJpbmc7XG4gIC8qKiDlrr3pmZDmnJ/lrprml7blmago6L+b6KGM5Lit55qE5b6F5Y+R6YCBKeOAgiAqL1xuICBwZW5kaW5nVGltZXI6IG51bWJlciB8IHVuZGVmaW5lZDtcbiAgLyoqIOWuv+S4u+adg+WogSBydW5uaW5nIOS9jSjmnaXoh6ogaG9zdC9zZXNzaW9uLXN0YXR1cyDkuI7lm57lkIjkuovku7Yp44CCICovXG4gIHJ1bm5pbmc6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG4gIC8qKiDlvZPliY3mjpLpmJ/mtojmga/mlbAo5p2l6IeqIHNlc3Npb24vcXVldWUg5binKeOAgiAqL1xuICBxdWV1ZWQ6IG51bWJlcjtcbiAgLyoqIOWtkOS7o+eQhuS8muivnShob3N0L3Nlc3Npb24tYWRkZWQg5bimIHBhcmVudFNlc3Npb25JZCnjgIIgKi9cbiAgc3ViYWdlbnQ6IGJvb2xlYW47XG59XG5cbmNvbnN0IGZyZXNoU3RhdGUgPSAoKTogU2Vzc2lvblN0YXRlID0+ICh7XG4gIGNvbnNlY3V0aXZlOiAwLFxuICBsYXN0QXV0b0F0OiAwLFxuICBsYXN0QXR0ZW1wdEF0OiAwLFxuICBsYXN0U2VudFRleHQ6ICcnLFxuICBwZW5kaW5nVGltZXI6IHVuZGVmaW5lZCxcbiAgcnVubmluZzogdW5kZWZpbmVkLFxuICBxdWV1ZWQ6IDAsXG4gIHN1YmFnZW50OiBmYWxzZSxcbn0pO1xuXG4vKiog5Yik5a6a5LiA5p2hIHVzZXIvbWVzc2FnZSDmmK/lkKbmmK/miJHku6zoh6rlt7Hoh6rliqjlj5HpgIHnmoTlm57mmL7jgIIgKi9cbmZ1bmN0aW9uIGlzT3VyRWNobyhzdGF0ZTogU2Vzc2lvblN0YXRlLCBldmVudDogU2Vzc2lvbkV2ZW50KTogYm9vbGVhbiB7XG4gIGlmIChldmVudC50eXBlICE9PSAndXNlci9tZXNzYWdlJykgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBtZXNzYWdlID0gZXZlbnQuZGF0YTtcbiAgaWYgKG1lc3NhZ2Uuc291cmNlLmtpbmQgIT09ICd1c2VyJykgcmV0dXJuIGZhbHNlO1xuICBpZiAoc3RhdGUubGFzdFNlbnRUZXh0ID09PSAnJykgcmV0dXJuIGZhbHNlO1xuICBpZiAoRGF0ZS5ub3coKSAtIHN0YXRlLmxhc3RBdXRvQXQgPiAzMDAwMCkgcmV0dXJuIGZhbHNlO1xuICBjb25zdCB0ZXh0ID0gbWVzc2FnZS5jb250ZW50XG4gICAgLmZpbHRlcigocGFydCk6IHBhcnQgaXMgeyB0eXBlOiAndGV4dCc7IHRleHQ6IHN0cmluZyB9ID0+IHBhcnQudHlwZSA9PT0gJ3RleHQnKVxuICAgIC5tYXAoKHBhcnQpID0+IHBhcnQudGV4dClcbiAgICAuam9pbignJyk7XG4gIHJldHVybiB0ZXh0ID09PSBzdGF0ZS5sYXN0U2VudFRleHQ7XG59XG5cbi8qKiBTU0Ug5bin5aSW5aOzOiBgeyBycGNJZCwgcGF5bG9hZCB9YOOAgiAqL1xudHlwZSBGcmFtZUVudmVsb3BlPFQ+ID0geyBwYXlsb2FkOiBUIH07XG5cbi8qKlxuICog5LqL5Lu25rWB5rO1OiDluKbmjIfmlbDpgIDpgb/nmoQgU1NFIOmHjei/nuW+queOr+OAglxuICogLSDku47mnKrmlLbliLDku7vkvZXluKco5a6/5Li75pyq5bCx57uqKTog6YCA6YG/6YeN6K+VLCDkuI3op6blj5Hmiavmj49cbiAqIC0g5pu+6L+e5LiK5ZCO5pat5byAOiDph43ov54sIOW5tumAmui/hyBvblJlY29ubmVjdCDpgJrnn6XlpJblsYIo5a6/5Li75Y+v6IO95bSp5rqD6YeN5ZCv6L+HKVxuICovXG5hc3luYyBmdW5jdGlvbiBwdW1wU3RyZWFtPFQ+KFxuICBvcGVuOiAoc2lnbmFsOiBBYm9ydFNpZ25hbCkgPT4gQXN5bmNJdGVyYWJsZTxGcmFtZUVudmVsb3BlPFQ+PixcbiAgb25GcmFtZTogKHBheWxvYWQ6IFQpID0+IHZvaWQsXG4gIG9uUmVjb25uZWN0OiAoKSA9PiB2b2lkLFxuICBnZXRCYWNrb2ZmOiAoKSA9PiBudW1iZXIsXG4gIGxvZzogKG1lc3NhZ2U6IHN0cmluZykgPT4gdm9pZCxcbiAgc2lnbmFsOiBBYm9ydFNpZ25hbCxcbik6IFByb21pc2U8dm9pZD4ge1xuICBsZXQgYmFja29mZiA9IGdldEJhY2tvZmYoKTtcbiAgd2hpbGUgKCFzaWduYWwuYWJvcnRlZCkge1xuICAgIGxldCBjb25uZWN0ZWQgPSBmYWxzZTtcbiAgICB0cnkge1xuICAgICAgZm9yIGF3YWl0IChjb25zdCBlbnZlbG9wZSBvZiBvcGVuKHNpZ25hbCkpIHtcbiAgICAgICAgY29ubmVjdGVkID0gdHJ1ZTtcbiAgICAgICAgb25GcmFtZShlbnZlbG9wZS5wYXlsb2FkKTtcbiAgICAgIH1cbiAgICAgIGlmIChzaWduYWwuYWJvcnRlZCkgcmV0dXJuO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBpZiAoc2lnbmFsLmFib3J0ZWQpIHJldHVybjtcbiAgICAgIGxvZyhgc3RyZWFtIGVycm9yOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcbiAgICB9XG4gICAgaWYgKCFjb25uZWN0ZWQpIHtcbiAgICAgIC8vIOS7juacqui/nuS4iijlrr/kuLvmnKrlsLHnu6opOiDmjIfmlbDpgIDpgb/ph43or5VcbiAgICAgIGF3YWl0IHNsZWVwKGJhY2tvZmYpO1xuICAgICAgYmFja29mZiA9IE1hdGgubWluKGJhY2tvZmYgKiAyLCAxNTAwMCk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgLy8g5pu+6L+e5LiK5ZCO5pat5byAIOKGkiDph43ov57lubbop6blj5HlpJblsYLmiavmj49cbiAgICBiYWNrb2ZmID0gZ2V0QmFja29mZigpO1xuICAgIG9uUmVjb25uZWN0KCk7XG4gICAgYXdhaXQgc2xlZXAoYmFja29mZik7XG4gIH1cbn1cblxuLyoqIOaPkuS7tuS4u+S9kzog5LiA5p2hIG11eCDmtYEgKyDkuIDmnaEgaG9zdCDmtYEgKyDlkK/liqgv6YeN6L+e5omr5o+P44CCICovXG5leHBvcnQgY2xhc3MgQXV0b0NvbnRpbnVlUnVubmVyIHtcbiAgcHJpdmF0ZSByZWFkb25seSBzdGF0ZXMgPSBuZXcgTWFwPFNlc3Npb25JZCwgU2Vzc2lvblN0YXRlPigpO1xuICBwcml2YXRlIHJlYWRvbmx5IG11eEFib3J0ID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuICBwcml2YXRlIHJlYWRvbmx5IGhvc3RBYm9ydCA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgcHJpdmF0ZSBkaXNwb3NlZCA9IGZhbHNlO1xuICBwcml2YXRlIHJlY29ubmVjdFNjYW5zID0gMDtcblxuICAvKipcbiAgICogQHBhcmFtIGFwaSAtIHNoYXJlZCB3aXJlIGNsaWVudCAoY3R4LmNvbm5lY3Rpb24uYXBpKS5cbiAgICogQHBhcmFtIGdldENvbmZpZyAtIHJlYWQgdGhlIGN1cnJlbnQgcmVzb2x2ZWQgY29uZmlndXJhdGlvbiAoc2V0dGluZ3Mgc2NvcGUpLlxuICAgKi9cbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSByZWFkb25seSBhcGk6IElBcGlDbGllbnQsXG4gICAgcHJpdmF0ZSByZWFkb25seSBnZXRDb25maWc6ICgpID0+IEF1dG9Db250aW51ZUNvbmZpZyxcbiAgKSB7XG4gICAgY29uc3QgY29uZmlnID0gdGhpcy5nZXRDb25maWcoKTtcbiAgICB2b2lkIHRoaXMucnVuTXV4KCk7XG4gICAgdm9pZCB0aGlzLnJ1bkhvc3QoKTtcbiAgICBpZiAoY29uZmlnLnNjYW5PbkJvb3QpIHtcbiAgICAgIC8vIOWQr+WKqOaXtui/nuaOpeWPr+iDveWwmuacquW7uueriywg5b6q546v6YeN6K+V55u05Yiw5oiQ5Yqf44CCXG4gICAgICB2b2lkIHRoaXMuYm9vdFNjYW5Mb29wKCk7XG4gICAgfVxuICAgIHRoaXMubG9nKFxuICAgICAgYOW3suWQr+WKqCjmlofmnKw9XCIke2NvbmZpZy5jb250aW51ZVRleHR9XCIsIOWuvemZkCAke2NvbmZpZy5ncmFjZU1zfW1zLCBgICtcbiAgICAgICAgYOWGt+WNtCAke2NvbmZpZy5jb29sZG93bk1zfW1zLCDmnIDlpJrov57nu60gJHtjb25maWcubWF4Q29uc2VjdXRpdmV9IOasoSlgLFxuICAgICk7XG4gIH1cblxuICBwcml2YXRlIGxvZyhtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5nZXRDb25maWcoKS52ZXJib3NlKSBjb25zb2xlLmluZm8oYFthdXRvLWNvbnRpbnVlXSAke21lc3NhZ2V9YCk7XG4gIH1cblxuICBkaXNwb3NlKCk6IHZvaWQge1xuICAgIHRoaXMuZGlzcG9zZWQgPSB0cnVlO1xuICAgIHRoaXMubXV4QWJvcnQuYWJvcnQoKTtcbiAgICB0aGlzLmhvc3RBYm9ydC5hYm9ydCgpO1xuICAgIGZvciAoY29uc3Qgc3RhdGUgb2YgdGhpcy5zdGF0ZXMudmFsdWVzKCkpIHtcbiAgICAgIGlmIChzdGF0ZS5wZW5kaW5nVGltZXIgIT09IHVuZGVmaW5lZCkgY2xlYXJUaW1lb3V0KHN0YXRlLnBlbmRpbmdUaW1lcik7XG4gICAgfVxuICAgIHRoaXMuc3RhdGVzLmNsZWFyKCk7XG4gIH1cblxuICBwcml2YXRlIHN0YXRlKHNlc3Npb25JZDogU2Vzc2lvbklkKTogU2Vzc2lvblN0YXRlIHtcbiAgICBsZXQgc3RhdGUgPSB0aGlzLnN0YXRlcy5nZXQoc2Vzc2lvbklkKTtcbiAgICBpZiAoc3RhdGUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc3RhdGUgPSBmcmVzaFN0YXRlKCk7XG4gICAgICB0aGlzLnN0YXRlcy5zZXQoc2Vzc2lvbklkLCBzdGF0ZSk7XG4gICAgfVxuICAgIHJldHVybiBzdGF0ZTtcbiAgfVxuXG4gIHByaXZhdGUgcnVuTXV4KCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiBwdW1wU3RyZWFtPE11eEZyYW1lPihcbiAgICAgIChzaWduYWwpID0+IHRoaXMuYXBpLmV2ZW50cy5tdXgoe30sIHNpZ25hbCksXG4gICAgICAocGF5bG9hZCkgPT4gdGhpcy5vbk11eEZyYW1lKHBheWxvYWQpLFxuICAgICAgKCkgPT4gdGhpcy5zY2hlZHVsZVJlY29ubmVjdFNjYW4oKSxcbiAgICAgICgpID0+IHRoaXMuZ2V0Q29uZmlnKCkucmVjb25uZWN0QmFja29mZk1zLFxuICAgICAgKG0pID0+IHRoaXMubG9nKG0pLFxuICAgICAgdGhpcy5tdXhBYm9ydC5zaWduYWwsXG4gICAgKTtcbiAgfVxuXG4gIHByaXZhdGUgcnVuSG9zdCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gcHVtcFN0cmVhbTxIb3N0RnJhbWU+KFxuICAgICAgKHNpZ25hbCkgPT4gdGhpcy5hcGkuZXZlbnRzLmhvc3Qoe30sIHNpZ25hbCksXG4gICAgICAocGF5bG9hZCkgPT4gdGhpcy5vbkhvc3RGcmFtZShwYXlsb2FkKSxcbiAgICAgICgpID0+IHRoaXMuc2NoZWR1bGVSZWNvbm5lY3RTY2FuKCksXG4gICAgICAoKSA9PiB0aGlzLmdldENvbmZpZygpLnJlY29ubmVjdEJhY2tvZmZNcyxcbiAgICAgIChtKSA9PiB0aGlzLmxvZyhtKSxcbiAgICAgIHRoaXMuaG9zdEFib3J0LnNpZ25hbCxcbiAgICApO1xuICB9XG5cbiAgLy8gLS0tLS0tLS0tLSBtdXgg5binIC0tLS0tLS0tLS1cblxuICBwcml2YXRlIG9uTXV4RnJhbWUoZnJhbWU6IE11eEZyYW1lKTogdm9pZCB7XG4gICAgc3dpdGNoIChmcmFtZS50eXBlKSB7XG4gICAgICBjYXNlICdzZXNzaW9uL2V2ZW50JzpcbiAgICAgICAgdGhpcy5vblNlc3Npb25FdmVudChmcmFtZS5zZXNzaW9uSWQsIGZyYW1lLmV2ZW50KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdzZXNzaW9uL3F1ZXVlJzpcbiAgICAgICAgdGhpcy5zdGF0ZShmcmFtZS5zZXNzaW9uSWQpLnF1ZXVlZCA9IGZyYW1lLml0ZW1zLmxlbmd0aDtcbiAgICAgICAgaWYgKGZyYW1lLml0ZW1zLmxlbmd0aCA+IDApIHRoaXMuY2FuY2VsUGVuZGluZyhmcmFtZS5zZXNzaW9uSWQsICflh7rnjrDmjpLpmJ/mtojmga8nKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdzdHJlYW0vZXJyb3InOlxuICAgICAgICB0aGlzLmxvZyhgbXV4IHN0cmVhbS9lcnJvcjogJHtmcmFtZS5lcnJvci5jb2RlfSAke2ZyYW1lLmVycm9yLm1lc3NhZ2V9YCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgYnJlYWs7IC8vIHNlc3Npb24vc3Vic2NyaWJlZOOAgWFwcHJvdmFsLyrjgIFxdWVzdGlvbi8q44CBc2Vzc2lvbi9qb2Jz44CBc2Vzc2lvbi9wcm9qZWN0aW9uIOS4juacrOaPkuS7tuaXoOWFs1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgb25TZXNzaW9uRXZlbnQoc2Vzc2lvbklkOiBTZXNzaW9uSWQsIGV2ZW50OiBTZXNzaW9uRXZlbnQpOiB2b2lkIHtcbiAgICBjb25zdCBzdGF0ZSA9IHRoaXMuc3RhdGUoc2Vzc2lvbklkKTtcbiAgICBzd2l0Y2ggKGV2ZW50LnR5cGUpIHtcbiAgICAgIGNhc2UgJ3R1cm4vc3RhcnQnOlxuICAgICAgICBzdGF0ZS5ydW5uaW5nID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5jYW5jZWxQZW5kaW5nKHNlc3Npb25JZCwgJ+Wuv+S4u+iHquihjOW8gOWQr+aWsOWbnuWQiCcpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ3R1cm4vZW5kJzoge1xuICAgICAgICBzdGF0ZS5ydW5uaW5nID0gZmFsc2U7XG4gICAgICAgIHRoaXMuY2FuY2VsUGVuZGluZyhzZXNzaW9uSWQsICfmlLbliLDmlrDnmoQgdHVybi9lbmQnKTtcbiAgICAgICAgY29uc3QgcmVhc29uID0gZXZlbnQuZGF0YS5yZWFzb247XG4gICAgICAgIGlmIChyZWFzb24ua2luZCA9PT0gJ2NvbXBsZXRlZCcpIHtcbiAgICAgICAgICAvLyDmiJDlip/lm57lkIg6IOaBouWkjeWBpeW6t+eKtuaAgVxuICAgICAgICAgIHN0YXRlLmNvbnNlY3V0aXZlID0gMDtcbiAgICAgICAgfSBlbHNlIGlmIChyZWFzb24ua2luZCA9PT0gJ2Fib3J0ZWQnKSB7XG4gICAgICAgICAgLy8g55So5oi35Li75Yqo5YGc5q2iOiDkuI3oh6rliqjnu6fnu60sIOinhuS4uueUqOaIt+S7i+WFpVxuICAgICAgICAgIHN0YXRlLmNvbnNlY3V0aXZlID0gMDtcbiAgICAgICAgfSBlbHNlIGlmIChyZWFzb24ua2luZCA9PT0gJ2Jsb2NrZWQnKSB7XG4gICAgICAgICAgLy8g562W55Wl5ouS57udOiDkuI3oh6rliqjnu6fnu61cbiAgICAgICAgfSBlbHNlIGlmIChpc05vbkh1bWFuUmVhc29uKHJlYXNvbi5raW5kKSkge1xuICAgICAgICAgIHRoaXMuc2NoZWR1bGUoc2Vzc2lvbklkLCBgdHVybi9lbmQ6JHtyZWFzb24ua2luZH1gKTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJ3VzZXIvbWVzc2FnZSc6XG4gICAgICAgIGlmIChpc091ckVjaG8oc3RhdGUsIGV2ZW50KSkgYnJlYWs7IC8vIOaIkeS7rOiHquW3seeahOWbnuaYvlxuICAgICAgICBpZiAoZXZlbnQuZGF0YS5zb3VyY2Uua2luZCA9PT0gJ3VzZXInKSB7XG4gICAgICAgICAgLy8g55So5oi35omL5Yqo5LuL5YWlXG4gICAgICAgICAgc3RhdGUuY29uc2VjdXRpdmUgPSAwO1xuICAgICAgICAgIHRoaXMuY2FuY2VsUGVuZGluZyhzZXNzaW9uSWQsICfnlKjmiLfmiYvliqjlj5HpgIHmtojmga8nKTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIC8vIC0tLS0tLS0tLS0gaG9zdCDluKcgLS0tLS0tLS0tLVxuXG4gIHByaXZhdGUgb25Ib3N0RnJhbWUoZnJhbWU6IEhvc3RGcmFtZSk6IHZvaWQge1xuICAgIHN3aXRjaCAoZnJhbWUudHlwZSkge1xuICAgICAgY2FzZSAnaG9zdC9zZXNzaW9uLXN0YXR1cyc6XG4gICAgICAgIHRoaXMuc3RhdGUoZnJhbWUuc2Vzc2lvbklkKS5ydW5uaW5nID0gZnJhbWUucnVubmluZztcbiAgICAgICAgaWYgKGZyYW1lLnJ1bm5pbmcpIHRoaXMuY2FuY2VsUGVuZGluZyhmcmFtZS5zZXNzaW9uSWQsICflrr/kuLvmiqXlkYrkvJror53lvIDlp4vov5DooYwnKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdob3N0L3Nlc3Npb24tYWRkZWQnOlxuICAgICAgICB0aGlzLnN0YXRlKGZyYW1lLnNlc3Npb25JZCkuc3ViYWdlbnQgPSBmcmFtZS5wYXJlbnRTZXNzaW9uSWQgIT09IHVuZGVmaW5lZDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdob3N0L2FnZW50LWVycm9yJzpcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUoZnJhbWUuc2Vzc2lvbklkKS5zdWJhZ2VudCkgYnJlYWs7XG4gICAgICAgIHRoaXMubG9nKGBob3N0L2FnZW50LWVycm9yKCR7ZnJhbWUuc2Vzc2lvbklkfSk6ICR7ZnJhbWUubWVzc2FnZX1gKTtcbiAgICAgICAgdGhpcy5zY2hlZHVsZShmcmFtZS5zZXNzaW9uSWQsICdob3N0L2FnZW50LWVycm9yJyk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnaG9zdC9zZXNzaW9uLXJlbW92ZWQnOlxuICAgICAgICB0aGlzLmNhbmNlbFBlbmRpbmcoZnJhbWUuc2Vzc2lvbklkLCAn5Lya6K+d5bey56e76ZmkJyk7XG4gICAgICAgIHRoaXMuc3RhdGVzLmRlbGV0ZShmcmFtZS5zZXNzaW9uSWQpO1xuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIC8vIC0tLS0tLS0tLS0g6LCD5bqmIC0tLS0tLS0tLS1cblxuICBwcml2YXRlIHNjaGVkdWxlKHNlc3Npb25JZDogU2Vzc2lvbklkLCByZWFzb246IHN0cmluZyk6IHZvaWQge1xuICAgIGNvbnN0IHN0YXRlID0gdGhpcy5zdGF0ZShzZXNzaW9uSWQpO1xuICAgIGNvbnN0IGNvbmZpZyA9IHRoaXMuZ2V0Q29uZmlnKCk7XG4gICAgaWYgKHN0YXRlLnN1YmFnZW50KSByZXR1cm47IC8vIOWtkOS7o+eQhuS8muivneeUseeItuS7o+eQhuWkhOeQhiwg5LiN5oqi6LeRXG4gICAgaWYgKHN0YXRlLnBlbmRpbmdUaW1lciAhPT0gdW5kZWZpbmVkKSByZXR1cm47IC8vIOW3suacieW+heWPkemAgVxuICAgIGlmIChEYXRlLm5vdygpIC0gc3RhdGUubGFzdEF0dGVtcHRBdCA8IGNvbmZpZy5jb29sZG93bk1zKSByZXR1cm47IC8vIOWGt+WNtOacnyjlkKvlpLHotKXlsJ3or5UpXG4gICAgaWYgKHN0YXRlLmNvbnNlY3V0aXZlID49IGNvbmZpZy5tYXhDb25zZWN1dGl2ZSkge1xuICAgICAgdGhpcy5sb2coXG4gICAgICAgIGDot7Pov4cgJHtzZXNzaW9uSWR9KCR7cmVhc29ufSk6IOW3sui/nue7reiHquWKqOe7p+e7rSAke3N0YXRlLmNvbnNlY3V0aXZlfSDmrKEsIOetieW+heeUqOaIt+S7i+WFpeaIluaIkOWKn+WbnuWQiGAsXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoc3RhdGUucXVldWVkID4gMCkgcmV0dXJuOyAvLyDlt7LmnInmjpLpmJ/mtojmga8sIOWuv+S4u+S8muiHquihjOWUpOmGklxuICAgIGNvbnN0IHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBpZiAoc3RhdGUucGVuZGluZ1RpbWVyICE9PSB0aW1lcikgcmV0dXJuO1xuICAgICAgc3RhdGUucGVuZGluZ1RpbWVyID0gdW5kZWZpbmVkO1xuICAgICAgdm9pZCB0aGlzLmZpcmUoc2Vzc2lvbklkLCByZWFzb24pO1xuICAgIH0sIGNvbmZpZy5ncmFjZU1zKTtcbiAgICBzdGF0ZS5wZW5kaW5nVGltZXIgPSB0aW1lcjtcbiAgICB0aGlzLmxvZyhcbiAgICAgIGDmo4DmtYvliLDpnZ7kurrkuLrkuK3mlq0gJHtzZXNzaW9uSWR9KCR7cmVhc29ufSksICR7Y29uZmlnLmdyYWNlTXN9bXMg5ZCO6Ieq5Yqo5Y+R6YCB44CMJHtjb25maWcuY29udGludWVUZXh0feOAjWAsXG4gICAgKTtcbiAgfVxuXG4gIHByaXZhdGUgY2FuY2VsUGVuZGluZyhzZXNzaW9uSWQ6IFNlc3Npb25JZCwgd2h5OiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCBzdGF0ZSA9IHRoaXMuc3RhdGUoc2Vzc2lvbklkKTtcbiAgICBpZiAoc3RhdGUucGVuZGluZ1RpbWVyID09PSB1bmRlZmluZWQpIHJldHVybjtcbiAgICBjbGVhclRpbWVvdXQoc3RhdGUucGVuZGluZ1RpbWVyKTtcbiAgICBzdGF0ZS5wZW5kaW5nVGltZXIgPSB1bmRlZmluZWQ7XG4gICAgdGhpcy5sb2coYOWPlua2iCAke3Nlc3Npb25JZH0g55qE6Ieq5Yqo57un57utKCR7d2h5fSlgKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZmlyZShzZXNzaW9uSWQ6IFNlc3Npb25JZCwgcmVhc29uOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy5kaXNwb3NlZCkgcmV0dXJuO1xuICAgIGNvbnN0IHN0YXRlID0gdGhpcy5zdGF0ZShzZXNzaW9uSWQpO1xuICAgIGNvbnN0IGNvbmZpZyA9IHRoaXMuZ2V0Q29uZmlnKCk7XG4gICAgLy8g5p2D5aiBIHJ1bm5pbmcg5qOA5p+lOiDkvJjlhYjnlKggaG9zdCDluKcsIOacquefpeaXtuWbnumAgOWIsCBzZXNzaW9uLmxpc3RcbiAgICBpZiAoc3RhdGUucnVubmluZyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBjb25zdCBydW5uaW5nID0gYXdhaXQgdGhpcy5ydW5uaW5nVmlhTGlzdChzZXNzaW9uSWQpO1xuICAgICAgaWYgKHJ1bm5pbmcgPT09IHVuZGVmaW5lZCB8fCBydW5uaW5nKSB7XG4gICAgICAgIHRoaXMubG9nKGDot7Pov4cgJHtzZXNzaW9uSWR9OiDml6Dms5Xnoa7orqTnqbrpl7IoJHtydW5uaW5nID09PSB1bmRlZmluZWQgPyAn5pyq55+lJyA6ICfov5DooYzkuK0nfSlgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoc3RhdGUucnVubmluZykge1xuICAgICAgdGhpcy5sb2coYOi3s+i/hyAke3Nlc3Npb25JZH06IOS8muivneS7jeWcqOi/kOihjGApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoc3RhdGUucXVldWVkID4gMCkge1xuICAgICAgdGhpcy5sb2coYOi3s+i/hyAke3Nlc3Npb25JZH06IOW3suacieaOkumYn+a2iOaBr2ApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAvLyDot6jmoIfnrb7pobXlhrfljbRcbiAgICBpZiAoRGF0ZS5ub3coKSAtIHJlYWRMYXN0U2VuZChzZXNzaW9uSWQpIDwgY29uZmlnLmNvb2xkb3duTXMpIHtcbiAgICAgIHRoaXMubG9nKGDot7Pov4cgJHtzZXNzaW9uSWR9OiDlhbbku5bmoIfnrb7pobXliJrlj5HpgIHov4dgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCFjbGFpbVNlbmQoc2Vzc2lvbklkKSkge1xuICAgICAgdGhpcy5sb2coYOi3s+i/hyAke3Nlc3Npb25JZH06IOWFtuS7luagh+etvumhteato+WcqOWPkemAgWApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCB0ZXh0ID0gY29uZmlnLmNvbnRpbnVlVGV4dDtcbiAgICBjb25zdCB6b25lID0gY2xpZW50VGltZVpvbmUoKTtcbiAgICBzdGF0ZS5sYXN0QXR0ZW1wdEF0ID0gRGF0ZS5ub3coKTsgLy8g5YWI6K6w6LSmOiDml6DorrrmiJDotKUsIOacrOasoeWwneivlemDvei/m+WFpeWGt+WNtFxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuYXBpLnNlc3Npb25zLnByb21wdCh7XG4gICAgICAgIHNlc3Npb25JZCxcbiAgICAgICAgbW9kZTogJ3F1ZXVlJyxcbiAgICAgICAgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0IH1dLFxuICAgICAgICAuLi4oem9uZSA9PT0gdW5kZWZpbmVkID8ge30gOiB7IGNsaWVudFRpbWVab25lOiB6b25lIH0pLFxuICAgICAgfSk7XG4gICAgICBpZiAocmVzcG9uc2UucmVzdWx0Lm9rKSB7XG4gICAgICAgIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gICAgICAgIHN0YXRlLmNvbnNlY3V0aXZlICs9IDE7XG4gICAgICAgIHN0YXRlLmxhc3RBdXRvQXQgPSBub3c7XG4gICAgICAgIHN0YXRlLmxhc3RTZW50VGV4dCA9IHRleHQ7XG4gICAgICAgIHdyaXRlTGFzdFNlbmQoc2Vzc2lvbklkLCBub3cpO1xuICAgICAgICB0aGlzLmxvZyhg5bey6Ieq5Yqo5Y+R6YCB44CMJHt0ZXh0feOAjeWIsCAke3Nlc3Npb25JZH0oJHtyZWFzb259KSwg56ysICR7c3RhdGUuY29uc2VjdXRpdmV9IOasoei/nue7rWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5sb2coXG4gICAgICAgICAgYOWPkemAgeWksei0pSAke3Nlc3Npb25JZH06ICR7cmVzcG9uc2UucmVzdWx0LmVycm9yLmNvZGV9ICR7cmVzcG9uc2UucmVzdWx0LmVycm9yLm1lc3NhZ2V9YCxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgdGhpcy5sb2coYOWPkemAgeW8guW4uCAke3Nlc3Npb25JZH06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApO1xuICAgIH0gZmluYWxseSB7XG4gICAgICByZWxlYXNlU2VuZChzZXNzaW9uSWQpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcnVubmluZ1ZpYUxpc3Qoc2Vzc2lvbklkOiBTZXNzaW9uSWQpOiBQcm9taXNlPGJvb2xlYW4gfCB1bmRlZmluZWQ+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmFwaS5zZXNzaW9ucy5saXN0KHt9KTtcbiAgICAgIGlmICghcmVzcG9uc2UucmVzdWx0Lm9rKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgY29uc3QgaXRlbSA9IHJlc3BvbnNlLnJlc3VsdC52YWx1ZS5pdGVtcy5maW5kKFxuICAgICAgICAoc3VtbWFyeTogU2Vzc2lvblN1bW1hcnkpID0+IHN1bW1hcnkuc2Vzc2lvbklkID09PSBzZXNzaW9uSWQsXG4gICAgICApO1xuICAgICAgcmV0dXJuIGl0ZW0gPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IGl0ZW0ucnVubmluZztcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICB9XG5cbiAgLy8gLS0tLS0tLS0tLSDlkK/liqgv6YeN6L+e5omr5o+PIC0tLS0tLS0tLS1cblxuICBwcml2YXRlIHNjaGVkdWxlUmVjb25uZWN0U2NhbigpOiB2b2lkIHtcbiAgICB0aGlzLnJlY29ubmVjdFNjYW5zICs9IDE7XG4gICAgY29uc3Qgc2NhbiA9IHRoaXMucmVjb25uZWN0U2NhbnM7XG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBpZiAoc2NhbiAhPT0gdGhpcy5yZWNvbm5lY3RTY2FucyB8fCB0aGlzLmRpc3Bvc2VkKSByZXR1cm47XG4gICAgICB2b2lkIHRoaXMuc2Nhbkxvb3AoNiwgdGhpcy5nZXRDb25maWcoKS5yZWNvbm5lY3RTY2FuRGVsYXlNcyk7XG4gICAgfSwgdGhpcy5nZXRDb25maWcoKS5yZWNvbm5lY3RTY2FuRGVsYXlNcyk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGJvb3RTY2FuTG9vcCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBhd2FpdCB0aGlzLnNjYW5Mb29wKEluZmluaXR5LCAzMDAwKTtcbiAgfVxuXG4gIC8qKiDlj43lpI3lsJ3or5Xmiavmj48sIOebtOWIsOaIkOWKnyjlrr/kuLvlsLHnu6op5oiW6L6+5Yiw5qyh5pWw5LiK6ZmQ44CCICovXG4gIHByaXZhdGUgYXN5bmMgc2Nhbkxvb3AoYXR0ZW1wdHM6IG51bWJlciwgZGVsYXlNczogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgZm9yIChsZXQgYXR0ZW1wdCA9IDA7IGF0dGVtcHQgPCBhdHRlbXB0cyAmJiAhdGhpcy5kaXNwb3NlZDsgYXR0ZW1wdCArPSAxKSB7XG4gICAgICB0cnkge1xuICAgICAgICBpZiAoYXdhaXQgdGhpcy5zY2FuSW50ZXJydXB0ZWQoKSkgcmV0dXJuO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgaWYgKHRoaXMuZGlzcG9zZWQpIHJldHVybjtcbiAgICAgICAgLy8g5a6/5Li75pyq5bCx57uq5pe25q+PIDNzIOmHjeivlTsg5Y+q6IqC5rWB6K6w5b2V5pel5b+XLCDpgb/lhY3liLflsY/jgIJcbiAgICAgICAgaWYgKGF0dGVtcHQgJSAxMCA9PT0gMCkge1xuICAgICAgICAgIHRoaXMubG9nKFxuICAgICAgICAgICAgYOaJq+aPj+Wksei0pSgke2F0dGVtcHQgKyAxfS8ke2F0dGVtcHRzID09PSBJbmZpbml0eSA/ICfiiJ4nIDogYXR0ZW1wdHN9KTogJHtcbiAgICAgICAgICAgICAgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpXG4gICAgICAgICAgICB9YCxcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoYXR0ZW1wdCArIDEgPCBhdHRlbXB0cykgYXdhaXQgc2xlZXAoZGVsYXlNcyk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIOaJq+aPj+acgOi/keS4reaWrei/h+eahOS8muivnTog5pyA5ZCO5Zue5ZCI5Lul6Z2e5Lq65Li65Y6f5Zug57uT5p2fLCDkuJTlhbblkI7msqHmnInmlrDlm57lkIjmiJbnlKjmiLfmtojmga/jgIJcbiAgICogQHJldHVybnMg5piv5ZCm5oiQ5Yqf5a6M5oiQ5LiA5qyh5omr5o+PKOWuv+S4u+Wwsee7qinjgIJcbiAgICovXG4gIHByaXZhdGUgYXN5bmMgc2NhbkludGVycnVwdGVkKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IGNvbmZpZyA9IHRoaXMuZ2V0Q29uZmlnKCk7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmFwaS5zZXNzaW9ucy5saXN0KHt9KTtcbiAgICBpZiAoIXJlc3BvbnNlLnJlc3VsdC5vaykgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IGl0ZW1zID0gcmVzcG9uc2UucmVzdWx0LnZhbHVlLml0ZW1zO1xuICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBpdGVtc1xuICAgICAgLmZpbHRlcigoc3VtbWFyeSkgPT4gIXN1bW1hcnkucnVubmluZyAmJiBzdW1tYXJ5LnBhcmVudFNlc3Npb25JZCA9PT0gdW5kZWZpbmVkKVxuICAgICAgLnNsaWNlKDAsIGNvbmZpZy5zY2FuTGltaXQpO1xuICAgIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gICAgZm9yIChjb25zdCBzdW1tYXJ5IG9mIGNhbmRpZGF0ZXMpIHtcbiAgICAgIGlmICh0aGlzLmRpc3Bvc2VkKSByZXR1cm4gdHJ1ZTtcbiAgICAgIGNvbnN0IHN0YXRlID0gdGhpcy5zdGF0ZShzdW1tYXJ5LnNlc3Npb25JZCk7XG4gICAgICBpZiAoc3RhdGUucGVuZGluZ1RpbWVyICE9PSB1bmRlZmluZWQpIGNvbnRpbnVlO1xuICAgICAgaWYgKHN0YXRlLmNvbnNlY3V0aXZlID49IGNvbmZpZy5tYXhDb25zZWN1dGl2ZSkgY29udGludWU7XG4gICAgICBpZiAobm93IC0gc3RhdGUubGFzdEF0dGVtcHRBdCA8IGNvbmZpZy5jb29sZG93bk1zKSBjb250aW51ZTtcbiAgICAgIGxldCBldmVudHM7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBwYWdlID0gYXdhaXQgdGhpcy5hcGkuc2Vzc2lvbnMuaGlzdG9yeSh7XG4gICAgICAgICAgc2Vzc2lvbklkOiBzdW1tYXJ5LnNlc3Npb25JZCxcbiAgICAgICAgICBtYXhNZXNzYWdlczogMzAsXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoIXBhZ2UucmVzdWx0Lm9rKSBjb250aW51ZTtcbiAgICAgICAgZXZlbnRzID0gcGFnZS5yZXN1bHQudmFsdWUuZXZlbnRzO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIGNvbnRpbnVlOyAvLyDkvJror53lj6/og73liJrooqvnp7vpmaRcbiAgICAgIH1cbiAgICAgIC8vIOS7juWwvumDqOaJvuacgOWQjuS4gOS4qiB0dXJuL2VuZCjlnKjliIbmlK/lhoXlrozmiJDmlLbnqoQpXG4gICAgICBsZXQgbGFzdEVuZDogU2Vzc2lvbkV2ZW50PCd0dXJuL2VuZCc+IHwgdW5kZWZpbmVkO1xuICAgICAgZm9yIChsZXQgaSA9IGV2ZW50cy5sZW5ndGggLSAxOyBpID49IDA7IGkgLT0gMSkge1xuICAgICAgICBjb25zdCBldmVudCA9IGV2ZW50c1tpXT8uZXZlbnQ7XG4gICAgICAgIGlmIChldmVudCAhPT0gdW5kZWZpbmVkICYmIGV2ZW50LnR5cGUgPT09ICd0dXJuL2VuZCcpIHtcbiAgICAgICAgICBsYXN0RW5kID0gZXZlbnQ7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChsYXN0RW5kID09PSB1bmRlZmluZWQpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgcmVhc29uID0gbGFzdEVuZC5kYXRhLnJlYXNvbjtcbiAgICAgIGlmICghaXNOb25IdW1hblJlYXNvbihyZWFzb24ua2luZCkpIGNvbnRpbnVlO1xuICAgICAgaWYgKGxhc3RFbmQudGltZSA8IG5vdyAtIGNvbmZpZy5mcmVzaE1zKSBjb250aW51ZTsgLy8g5aSq5LmF6L+cLCDkuI3nv7vml6fotKZcbiAgICAgIC8vIOivpSB0dXJuL2VuZCDkuYvlkI7kuI3og73mnInmlrDlm57lkIjmiJbnlKjmiLfmtojmga8o6K+05piO5bey6KKr5aSE55CGKVxuICAgICAgbGV0IHN1cGVyc2VkZWQgPSBmYWxzZTtcbiAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgZXZlbnRzKSB7XG4gICAgICAgIGNvbnN0IGV2ZW50ID0gZW50cnkuZXZlbnQ7XG4gICAgICAgIGlmIChldmVudC5zZXEgPD0gbGFzdEVuZC5zZXEpIGNvbnRpbnVlO1xuICAgICAgICBpZiAoZXZlbnQudHlwZSA9PT0gJ3R1cm4vc3RhcnQnKSBzdXBlcnNlZGVkID0gdHJ1ZTtcbiAgICAgICAgaWYgKGV2ZW50LnR5cGUgPT09ICd1c2VyL21lc3NhZ2UnICYmIGV2ZW50LmRhdGEuc291cmNlLmtpbmQgPT09ICd1c2VyJykgc3VwZXJzZWRlZCA9IHRydWU7XG4gICAgICAgIGlmIChzdXBlcnNlZGVkKSBicmVhaztcbiAgICAgIH1cbiAgICAgIGlmIChzdXBlcnNlZGVkKSBjb250aW51ZTtcbiAgICAgIHRoaXMubG9nKGDmiavmj4/lj5HnjrDkuK3mlq0gJHtzdW1tYXJ5LnNlc3Npb25JZH0odHVybi9lbmQ6JHtyZWFzb24ua2luZH0pLCDlronmjpLoh6rliqjnu6fnu61gKTtcbiAgICAgIHRoaXMuc2NoZWR1bGUoc3VtbWFyeS5zZXNzaW9uSWQsIGBzY2FuOnR1cm4vZW5kOiR7cmVhc29uLmtpbmR9YCk7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9XG59XG4iLCAiLyoqXG4gKiBgYXV0by1jb250aW51ZWAgbmFtZXNwYWNlIGRpY3Rpb25hcmllczogY29weSBmb3IgdGhlIHBsdWdpbiBzZXR0aW5ncyBjYXJkXG4gKiByZWdpc3RlcmVkIGludG8gdGhlIGBzZXR0aW5ncy5wbHVnaW4uaXRlbWAgc2VhdCBvZiB0aGUgcGx1Z2luLWNvbmZpZ3VyYXRpb25cbiAqIHNlY3Rpb24uIEluY2x1ZGVzIHRoZSBjYXJkLWNocm9tZSBrZXlzIHRoZSBjYXJkIGNvbXBvbmVudCByZWFkcy5cbiAqL1xuXG4vKiog566A5L2T5Lit5paH6K+N5YW4KOmUrumbhueahOS6i+Wunuadpea6kCnjgIIgKi9cbmV4cG9ydCBjb25zdCB6aCA9IHtcbiAgJ2NhcmQudGl0bGUnOiAn6Ieq5Yqo57un57utJyxcbiAgJ2NhcmQuZGVzY3JpcHRpb24nOiAn6K+35rGC5Zug572R57uc562J5Y6f5ZugKOmdnuS6uuS4uinkuK3mlq3lkI4sIOiHquWKqOWPkemAgeOAjOe7p+e7reOAjee7rei3keOAgicsXG4gICdmaWVsZC5jb250aW51ZVRleHQnOiAn57un57ut5paH5pysJyxcbiAgJ2ZpZWxkLmNvbnRpbnVlVGV4dEhpbnQnOiAn5Lit5pat5ZCO6Ieq5Yqo5Y+R6YCB55qE5raI5oGv5YaF5a6544CCJyxcbiAgJ2ZpZWxkLmdyYWNlTXMnOiAn5a696ZmQ5pyfIChtcyknLFxuICAnZmllbGQuZ3JhY2VNc0hpbnQnOiAn5qOA5rWL5Yiw5Lit5pat5ZCO562J5b6F55qE5pe26ZW/OyDmnJ/pl7Tlrr/kuLvoh6rooYzmgaLlpI3liJnlj5bmtojjgIInLFxuICAnZmllbGQuY29vbGRvd25Ncyc6ICflhrfljbTml7bpl7QgKG1zKScsXG4gICdmaWVsZC5jb29sZG93bk1zSGludCc6ICflkIzkuIDkvJror53kuKTmrKHoh6rliqjjgIznu6fnu63jgI3nmoTmnIDlsI/pl7TpmpQsIOWksei0peWwneivleS5n+iuoeWFpeOAgicsXG4gICdmaWVsZC5tYXhDb25zZWN1dGl2ZSc6ICfmnIDlpKfov57nu63mrKHmlbAnLFxuICAnZmllbGQubWF4Q29uc2VjdXRpdmVIaW50JzogJ+WQjOS4gOS8muivnei/nue7reiHquWKqOOAjOe7p+e7reOAjeeahOS4iumZkDsg6LaF6L+H5ZCO5YGc5q2iLCDnm7TliLDnlKjmiLfmiYvliqjku4vlhaXmiJblh7rnjrDmiJDlip/lm57lkIjjgIInLFxuICAnZmllbGQuc2Nhbk9uQm9vdCc6ICflkK/liqgv6YeN6L+e5omr5o+PJyxcbiAgJ2ZpZWxkLnNjYW5PbkJvb3RIaW50JzogJ+mhtemdouWQr+WKqOaIlumHjei/nuaXtuaJq+aPj+acgOi/keS4reaWreeahOS8muivneW5tuiHquWKqOe7rei3kSjlpoLmtY/op4jlmajlhbPpl63mnJ/pl7Tlrr/kuLvltKnmuoMp44CCJyxcbiAgJ2ZpZWxkLnNjYW5MaW1pdCc6ICfmiavmj4/kvJror53mlbAnLFxuICAnZmllbGQuc2NhbkxpbWl0SGludCc6ICfmnIDlpJrmo4Dmn6XlpJrlsJHkuKrmnIDov5Hmm7TmlrDnmoTkvJror50o5LiN5ZCr6L+Q6KGM5Lit5LiO5a2Q5Luj55CG5Lya6K+dKeOAgicsXG4gICdmaWVsZC5mcmVzaE1zJzogJ+aJq+aPj+aXtumXtOeqlyAobXMpJyxcbiAgJ2ZpZWxkLmZyZXNoTXNIaW50JzogJ+aJq+aPj+WPquWkhOeQhuivpeaXtumXtOeql+WGheeahOS4reaWreOAgicsXG4gICdmaWVsZC5yZWNvbm5lY3RTY2FuRGVsYXlNcyc6ICfph43ov57miavmj4/lu7bov58gKG1zKScsXG4gICdmaWVsZC5yZWNvbm5lY3RTY2FuRGVsYXlNc0hpbnQnOiAn6YeN6L+e5ZCO562J5b6F5a6/5Li75a6M5oiQ5oGi5aSN5YaN5omr5o+P44CCJyxcbiAgJ2ZpZWxkLnJlY29ubmVjdEJhY2tvZmZNcyc6ICfph43ov57pgIDpgb8gKG1zKScsXG4gICdmaWVsZC5yZWNvbm5lY3RCYWNrb2ZmTXNIaW50JzogJ+S6i+S7tua1geaWreW8gOWQjueahOmHjei/numXtOmalOOAgicsXG4gICdmaWVsZC52ZXJib3NlJzogJ+ivpue7huaXpeW/lycsXG4gICdmaWVsZC52ZXJib3NlSGludCc6ICflnKjmtY/op4jlmajmjqfliLblj7DovpPlh7ogW2F1dG8tY29udGludWVdIOaXpeW/l+OAgicsXG4gICdjaHJvbWUuY29sbGFwc2UnOiAn5pS26LW36K6+572uJyxcbiAgJ2Nocm9tZS5leHBhbmQnOiAn5bGV5byA6K6+572uJyxcbiAgJ2Nocm9tZS51bnNhdmVkJzogJ+acquS/neWtmCcsXG4gICdjaHJvbWUucmVhZE9ubHknOiAn5b2T5YmN6YOo572y55qE6K6+572u5Y+q6K+744CCJyxcbiAgJ2Nocm9tZS5zYXZlRmFpbGVkJzogJ+mDqOe9suacquaOpeWPl+i/meS6m+WAvCwg5bey5L+d55WZ5L6b5L2g5L+u5pS544CCJyxcbiAgJ2Nocm9tZS5kaXNjYXJkJzogJ+aUvuW8gycsXG4gICdjaHJvbWUuc2F2aW5nJzogJ+S/neWtmOS4reKApicsXG4gICdjaHJvbWUuc2F2ZSc6ICfkv53lrZgnLFxuICAnY2hyb21lLm92ZXJyaWRkZW4nOiAn5bey6KaG55uWJyxcbiAgJ2Nocm9tZS5yZXNldCc6ICfmgaLlpI3pu5jorqQnLFxuICAnY2hyb21lLmludmFsaWROdW1iZXInOiAn6K+36L6T5YWl5pWw5a2XLCDnlZnnqbrliJnkvb/nlKjpu5jorqTlgLzjgIInLFxuICAnY2hyb21lLmluaGVyaXQnOiAn57un5om/JyxcbiAgJ2Nocm9tZS5vbic6ICflvIAnLFxuICAnY2hyb21lLm9mZic6ICflhbMnLFxufSBzYXRpc2ZpZXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcblxuLyoqIOacrOaPkuS7tueahOmUruiBlOWQiOOAgiAqL1xuZXhwb3J0IHR5cGUgU2V0dGluZ3NDYXJkS2V5ID0ga2V5b2YgdHlwZW9mIHpoO1xuXG4vKiogRW5nbGlzaCBkaWN0aW9uYXJ5LCBjaGVja2VkIGNvbXBsZXRlIGFnYWluc3QgdGhlIHpoIGtleSBzZXQuICovXG5leHBvcnQgY29uc3QgZW46IFJlY29yZDxTZXR0aW5nc0NhcmRLZXksIHN0cmluZz4gPSB7XG4gICdjYXJkLnRpdGxlJzogJ0F1dG8gY29udGludWUnLFxuICAnY2FyZC5kZXNjcmlwdGlvbic6ICdXaGVuIGEgcmVxdWVzdCBpcyBpbnRlcnJ1cHRlZCBieSBhIG5vbi1odW1hbiBjYXVzZSwgYXV0b21hdGljYWxseSBzZW5kIOOAjOe7p+e7reOAjSB0byByZXN1bWUuJyxcbiAgJ2ZpZWxkLmNvbnRpbnVlVGV4dCc6ICdDb250aW51ZSB0ZXh0JyxcbiAgJ2ZpZWxkLmNvbnRpbnVlVGV4dEhpbnQnOiAnTWVzc2FnZSBhdXRvbWF0aWNhbGx5IHNlbnQgYWZ0ZXIgYW4gaW50ZXJydXB0aW9uLicsXG4gICdmaWVsZC5ncmFjZU1zJzogJ0dyYWNlIHBlcmlvZCAobXMpJyxcbiAgJ2ZpZWxkLmdyYWNlTXNIaW50JzogJ1dhaXQgYWZ0ZXIgYW4gaW50ZXJydXB0aW9uOyBjYW5jZWxsZWQgaWYgdGhlIGhvc3QgcmVjb3ZlcnMgb24gaXRzIG93bi4nLFxuICAnZmllbGQuY29vbGRvd25Ncyc6ICdDb29sZG93biAobXMpJyxcbiAgJ2ZpZWxkLmNvb2xkb3duTXNIaW50JzogJ01pbmltdW0gaW50ZXJ2YWwgYmV0d2VlbiBhdXRvLWNvbnRpbnVlcyBwZXIgc2Vzc2lvbjsgZmFpbGVkIGF0dGVtcHRzIGNvdW50IHRvby4nLFxuICAnZmllbGQubWF4Q29uc2VjdXRpdmUnOiAnTWF4IGNvbnNlY3V0aXZlJyxcbiAgJ2ZpZWxkLm1heENvbnNlY3V0aXZlSGludCc6ICdNYXggY29uc2VjdXRpdmUgYXV0by1jb250aW51ZXMgcGVyIHNlc3Npb247IHN0b3BzIHVudGlsIGEgdXNlciBpbnRlcnZlbmVzIG9yIGEgdHVybiBjb21wbGV0ZXMuJyxcbiAgJ2ZpZWxkLnNjYW5PbkJvb3QnOiAnU2NhbiBvbiBsb2FkIC8gcmVjb25uZWN0JyxcbiAgJ2ZpZWxkLnNjYW5PbkJvb3RIaW50JzogJ1NjYW4gcmVjZW50bHkgaW50ZXJydXB0ZWQgc2Vzc2lvbnMgb24gcGFnZSBsb2FkIG9yIHJlY29ubmVjdCAoZS5nLiB0aGUgaG9zdCBjcmFzaGVkIHdoaWxlIHRoZSBicm93c2VyIHdhcyBjbG9zZWQpLicsXG4gICdmaWVsZC5zY2FuTGltaXQnOiAnU2NhbiBsaW1pdCcsXG4gICdmaWVsZC5zY2FuTGltaXRIaW50JzogJ0hvdyBtYW55IG1vc3QtcmVjZW50bHktdXBkYXRlZCBzZXNzaW9ucyB0byBjaGVjayAocnVubmluZyAvIHN1YmFnZW50IHNlc3Npb25zIGV4Y2x1ZGVkKS4nLFxuICAnZmllbGQuZnJlc2hNcyc6ICdTY2FuIHdpbmRvdyAobXMpJyxcbiAgJ2ZpZWxkLmZyZXNoTXNIaW50JzogJ09ubHkgaW50ZXJydXB0aW9ucyBpbnNpZGUgdGhpcyB3aW5kb3cgYXJlIGNvbnNpZGVyZWQuJyxcbiAgJ2ZpZWxkLnJlY29ubmVjdFNjYW5EZWxheU1zJzogJ1JlY29ubmVjdCBzY2FuIGRlbGF5IChtcyknLFxuICAnZmllbGQucmVjb25uZWN0U2NhbkRlbGF5TXNIaW50JzogJ1dhaXQgZm9yIHRoZSBob3N0IHRvIGZpbmlzaCByZWNvdmVyaW5nIGJlZm9yZSBzY2FubmluZyBhZnRlciBhIHJlY29ubmVjdC4nLFxuICAnZmllbGQucmVjb25uZWN0QmFja29mZk1zJzogJ1JlY29ubmVjdCBiYWNrb2ZmIChtcyknLFxuICAnZmllbGQucmVjb25uZWN0QmFja29mZk1zSGludCc6ICdJbnRlcnZhbCBiZXR3ZWVuIGV2ZW50LXN0cmVhbSByZWNvbm5lY3QgYXR0ZW1wdHMuJyxcbiAgJ2ZpZWxkLnZlcmJvc2UnOiAnVmVyYm9zZSBsb2dzJyxcbiAgJ2ZpZWxkLnZlcmJvc2VIaW50JzogJ0xvZyBbYXV0by1jb250aW51ZV0gbGluZXMgdG8gdGhlIGJyb3dzZXIgY29uc29sZS4nLFxuICAnY2hyb21lLmNvbGxhcHNlJzogJ0hpZGUgc2V0dGluZ3MnLFxuICAnY2hyb21lLmV4cGFuZCc6ICdTaG93IHNldHRpbmdzJyxcbiAgJ2Nocm9tZS51bnNhdmVkJzogJ1Vuc2F2ZWQnLFxuICAnY2hyb21lLnJlYWRPbmx5JzogJ1RoaXMgZGVwbG95bWVudCBzdG9yZXMgc2V0dGluZ3MgcmVhZC1vbmx5LicsXG4gICdjaHJvbWUuc2F2ZUZhaWxlZCc6ICdUaGUgZGVwbG95bWVudCBkaWQgbm90IGFjY2VwdCB0aGVzZSB2YWx1ZXM7IHRoZXkgd2VyZSBsZWZ0IGZvciB5b3UgdG8gY29ycmVjdC4nLFxuICAnY2hyb21lLmRpc2NhcmQnOiAnRGlzY2FyZCcsXG4gICdjaHJvbWUuc2F2aW5nJzogJ1NhdmluZ+KApicsXG4gICdjaHJvbWUuc2F2ZSc6ICdTYXZlJyxcbiAgJ2Nocm9tZS5vdmVycmlkZGVuJzogJ092ZXJyaWRkZW4nLFxuICAnY2hyb21lLnJlc2V0JzogJ1Jlc2V0IHRvIGRlZmF1bHQnLFxuICAnY2hyb21lLmludmFsaWROdW1iZXInOiAnRW50ZXIgYSBudW1iZXIsIG9yIGxlYXZlIGJsYW5rIHRvIHVzZSB0aGUgZGVmYXVsdC4nLFxuICAnY2hyb21lLmluaGVyaXQnOiAnSW5oZXJpdCcsXG4gICdjaHJvbWUub24nOiAnT24nLFxuICAnY2hyb21lLm9mZic6ICdPZmYnLFxufTtcbiIsICIvKipcbiAqIFRoZSBhdXRvLWNvbnRpbnVlIHNldHRpbmdzIGNhcmQ6IGVkaXRzIHRoZSBgYXV0by1jb250aW51ZWAgbmFtZXNwYWNlIGZpZWxkc1xuICogZnJvbSB0aGUgcGx1Z2luLWNvbmZpZ3VyYXRpb24gc2VjdGlvbiAodGhlIGBzZXR0aW5ncy5wbHVnaW4uaXRlbWAgc2VhdCkuXG4gKlxuICogU2VsZi1jb250YWluZWQgY2FyZCBjaHJvbWUgKGRpc2Nsb3N1cmUgaGVhZGVyLCBzdGFnZWQgZmllbGRzLCBzYXZlL2Rpc2NhcmRcbiAqIGZvb3RlcikgZm9sbG93aW5nIHRoZSBwbHVnaW4tY2FyZCBzdG9yZSBwYXR0ZXJuIG9mIHRoZSBEU0ggcGx1Z2luXG4gKiBjb25maWd1cmF0aW9uIHNlY3Rpb247IHN0eWxlcyBsaXZlIGluIGBzdHlsZXMudHNgIGFuZCB1c2UgdGhlIERTSCBkZXNpZ25cbiAqIHRva2VucyBzbyB0aGUgY2FyZCBmb2xsb3dzIHRoZSBhY3RpdmUgdGhlbWUuXG4gKi9cbmltcG9ydCB7IHVzZVN0YXRlLCB0eXBlIFJlYWN0Tm9kZSB9IGZyb20gJ3JlYWN0JztcbmltcG9ydCB7IGNyZWF0ZVNuYXBzaG90U3RvcmUsIHR5cGUgU2V0dGluZ3NTY29wZSwgdHlwZSBTbmFwc2hvdFN0b3JlIH0gZnJvbSAnQGRlZXBzZWVrLWFpL2RzaC1jbGllbnQtcnVudGltZS9jbGllbnQnO1xuaW1wb3J0IHR5cGUgeyBJbmplY3RGYWNlLCBQcm9wc0xvY2FsZSwgUHJvcHNSdW50aW1lIH0gZnJvbSAnQGRlZXBzZWVrLWFpL2RzaC1jbGllbnQtdWktc2xvdHMnO1xuaW1wb3J0IHR5cGUgeyBBdXRvQ29udGludWVTZXR0aW5ncyB9IGZyb20gJy4vZW5naW5lLnRzJztcbmltcG9ydCB0eXBlIHsgU2V0dGluZ3NDYXJkS2V5IH0gZnJvbSAnLi9sb2NhbGVzLnRzJztcbmltcG9ydCB7XG4gIGJvb2xlYW5GaWVsZCxcbiAgQ2FyZEZvcm0sXG4gIG51bWJlckZpZWxkLFxuICB0ZXh0RmllbGQsXG4gIHR5cGUgQ2FyZEFjdGlvbnMsXG4gIHR5cGUgQ2FyZEZpZWxkU3RhdGUsXG4gIHR5cGUgQ2FyZFNoZWxsLFxufSBmcm9tICcuL3NldHRpbmdzLWZvcm0udHMnO1xuaW1wb3J0IHsgaW5qZWN0U3R5bGVzIH0gZnJvbSAnLi9zdHlsZXMudHMnO1xuXG4vLyBTdHlsZXMgbXVzdCBsYW5kIGR1cmluZyBmYWN0b3J5IG1hdGVyaWFsaXphdGlvbiBzbyB0aGUgbW9kdWxlIHN5c3RlbSdzXG4vLyBzdHlsZSBib29ra2VlcGluZyAoSE1SKSBvd25zIHRoZW0uXG5pbmplY3RTdHlsZXMoKTtcblxuLyoqIFdoYXQgdGhlIGF1dG8tY29udGludWUgY2FyZCByZW5kZXJzLiAqL1xuZXhwb3J0IGludGVyZmFjZSBBdXRvQ29udGludWVTZXR0aW5nc0NhcmRTdGF0ZSBleHRlbmRzIENhcmRTaGVsbCB7XG4gIGNvbnRpbnVlVGV4dDogQ2FyZEZpZWxkU3RhdGU7XG4gIGdyYWNlTXM6IENhcmRGaWVsZFN0YXRlO1xuICBjb29sZG93bk1zOiBDYXJkRmllbGRTdGF0ZTtcbiAgbWF4Q29uc2VjdXRpdmU6IENhcmRGaWVsZFN0YXRlO1xuICBzY2FuT25Cb290OiBDYXJkRmllbGRTdGF0ZTtcbiAgc2NhbkxpbWl0OiBDYXJkRmllbGRTdGF0ZTtcbiAgZnJlc2hNczogQ2FyZEZpZWxkU3RhdGU7XG4gIHJlY29ubmVjdFNjYW5EZWxheU1zOiBDYXJkRmllbGRTdGF0ZTtcbiAgcmVjb25uZWN0QmFja29mZk1zOiBDYXJkRmllbGRTdGF0ZTtcbiAgdmVyYm9zZTogQ2FyZEZpZWxkU3RhdGU7XG59XG5cbi8qKiBUaGUgcmVnaXN0cmF0aW9uLXNpZGUgZmFjZSB0aGUgY2FyZCdzIHNsb3QgZW50cnkgaW5qZWN0cy4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQXV0b0NvbnRpbnVlU2V0dGluZ3NDYXJkRmFjZSBleHRlbmRzIENhcmRBY3Rpb25zIHtcbiAgaG9va3M6IHtcbiAgICAvKiogQ2FyZCBzbmFwc2hvdCBib3VuZCBieSB0aGUgcmVuZGVyZXIgYXMgdXNlQXV0b0NvbnRpbnVlU2V0dGluZ3NDYXJkLiAqL1xuICAgIGF1dG9Db250aW51ZVNldHRpbmdzQ2FyZDogU25hcHNob3RTdG9yZTxBdXRvQ29udGludWVTZXR0aW5nc0NhcmRTdGF0ZT47XG4gIH07XG59XG5cbi8qKiBCcmlkZ2VzIHRoZSBgYXV0by1jb250aW51ZWAgc2NvcGUgb250byB0aGUgY2FyZCdzIHN0YWdlZCBmb3JtLiAqL1xuZXhwb3J0IGNsYXNzIEF1dG9Db250aW51ZVNldHRpbmdzQ2FyZENvbnRyb2xsZXIge1xuICBwcml2YXRlIHJlYWRvbmx5IGZvcm06IENhcmRGb3JtPEF1dG9Db250aW51ZVNldHRpbmdzPjtcbiAgcHJpdmF0ZSByZWFkb25seSBzdG9yZTogU25hcHNob3RTdG9yZTxBdXRvQ29udGludWVTZXR0aW5nc0NhcmRTdGF0ZT47XG5cbiAgLyoqXG4gICAqIEBwYXJhbSBzY29wZSAtIHRoZSBib3VuZCBzZXR0aW5ncyBzY29wZSBmb3IgdGhlIGBhdXRvLWNvbnRpbnVlYCBuYW1lc3BhY2UuXG4gICAqL1xuICBjb25zdHJ1Y3RvcihzY29wZTogU2V0dGluZ3NTY29wZTxBdXRvQ29udGludWVTZXR0aW5ncz4pIHtcbiAgICB0aGlzLmZvcm0gPSBuZXcgQ2FyZEZvcm0oc2NvcGUsIFtcbiAgICAgIHRleHRGaWVsZCgnY29udGludWVUZXh0JyksXG4gICAgICBudW1iZXJGaWVsZCgnZ3JhY2VNcycsIDApLFxuICAgICAgbnVtYmVyRmllbGQoJ2Nvb2xkb3duTXMnLCAwKSxcbiAgICAgIG51bWJlckZpZWxkKCdtYXhDb25zZWN1dGl2ZScsIDEpLFxuICAgICAgYm9vbGVhbkZpZWxkKCdzY2FuT25Cb290JyksXG4gICAgICBudW1iZXJGaWVsZCgnc2NhbkxpbWl0JywgMSksXG4gICAgICBudW1iZXJGaWVsZCgnZnJlc2hNcycsIDApLFxuICAgICAgbnVtYmVyRmllbGQoJ3JlY29ubmVjdFNjYW5EZWxheU1zJywgMCksXG4gICAgICBudW1iZXJGaWVsZCgncmVjb25uZWN0QmFja29mZk1zJywgMCksXG4gICAgICBib29sZWFuRmllbGQoJ3ZlcmJvc2UnKSxcbiAgICBdKTtcbiAgICB0aGlzLnN0b3JlID0gdGhpcy5mb3JtLmJpbmQoKCkgPT4gdGhpcy5wcm9qZWN0aW9uKCksIGNyZWF0ZVNuYXBzaG90U3RvcmUpO1xuICB9XG5cbiAgcHJpdmF0ZSBwcm9qZWN0aW9uKCk6IEF1dG9Db250aW51ZVNldHRpbmdzQ2FyZFN0YXRlIHtcbiAgICByZXR1cm4ge1xuICAgICAgLi4udGhpcy5mb3JtLnNoZWxsKCksXG4gICAgICBjb250aW51ZVRleHQ6IHRoaXMuZm9ybS5maWVsZCgnY29udGludWVUZXh0JyksXG4gICAgICBncmFjZU1zOiB0aGlzLmZvcm0uZmllbGQoJ2dyYWNlTXMnKSxcbiAgICAgIGNvb2xkb3duTXM6IHRoaXMuZm9ybS5maWVsZCgnY29vbGRvd25NcycpLFxuICAgICAgbWF4Q29uc2VjdXRpdmU6IHRoaXMuZm9ybS5maWVsZCgnbWF4Q29uc2VjdXRpdmUnKSxcbiAgICAgIHNjYW5PbkJvb3Q6IHRoaXMuZm9ybS5maWVsZCgnc2Nhbk9uQm9vdCcpLFxuICAgICAgc2NhbkxpbWl0OiB0aGlzLmZvcm0uZmllbGQoJ3NjYW5MaW1pdCcpLFxuICAgICAgZnJlc2hNczogdGhpcy5mb3JtLmZpZWxkKCdmcmVzaE1zJyksXG4gICAgICByZWNvbm5lY3RTY2FuRGVsYXlNczogdGhpcy5mb3JtLmZpZWxkKCdyZWNvbm5lY3RTY2FuRGVsYXlNcycpLFxuICAgICAgcmVjb25uZWN0QmFja29mZk1zOiB0aGlzLmZvcm0uZmllbGQoJ3JlY29ubmVjdEJhY2tvZmZNcycpLFxuICAgICAgdmVyYm9zZTogdGhpcy5mb3JtLmZpZWxkKCd2ZXJib3NlJyksXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBCdWlsZCB0aGUgZmFjZSB0aGUgY2FyZCdzIHNsb3QgcmVnaXN0cmF0aW9uIGluamVjdHMuXG4gICAqIEByZXR1cm5zIHRoZSBjYXJkJ3Mgc25hcHNob3QgYW5kIGl0cyBmb3JtIGFjdGlvbnMuXG4gICAqL1xuICBpbmplY3QoKTogQXV0b0NvbnRpbnVlU2V0dGluZ3NDYXJkRmFjZSB7XG4gICAgcmV0dXJuIHsgaG9va3M6IHsgYXV0b0NvbnRpbnVlU2V0dGluZ3NDYXJkOiB0aGlzLnN0b3JlIH0sIC4uLnRoaXMuZm9ybS5hY3Rpb25zKCkgfTtcbiAgfVxufVxuXG4vKiogUHJvcHMgdGhlIHJlbmRlcmVyIGJpbmRzIGZvciB0aGUgYXV0by1jb250aW51ZSBjYXJkLiAqL1xuZXhwb3J0IHR5cGUgQXV0b0NvbnRpbnVlU2V0dGluZ3NDYXJkUHJvcHMgPVxuICBQcm9wc1J1bnRpbWU8J3NldHRpbmdzLnBsdWdpbi5pdGVtJz4gJiBQcm9wc0xvY2FsZTwnYXV0by1jb250aW51ZSc+ICYgSW5qZWN0RmFjZTxBdXRvQ29udGludWVTZXR0aW5nc0NhcmRGYWNlPjtcblxuLyoqIENhcmQgY2hyb21lOiBhIGRpc2Nsb3N1cmUgaGVhZGVyIG5hbWluZyB0aGUgcGx1Z2luIGFuZCB3aGF0IGl0cyBzZXR0aW5ncyBnb3Zlcm4sIHRoZSBjb250cm9scywgYW5kIHRoZSBzYXZlIHRoYXQgd3JpdGVzIHRoZW0uICovXG5mdW5jdGlvbiBTZXR0aW5nc0NhcmQocHJvcHM6IHtcbiAgdDogKGtleTogU2V0dGluZ3NDYXJkS2V5KSA9PiBzdHJpbmc7XG4gIHRpdGxlS2V5OiBTZXR0aW5nc0NhcmRLZXk7XG4gIGRlc2NyaXB0aW9uS2V5OiBTZXR0aW5nc0NhcmRLZXk7XG4gIHN0YXRlOiBDYXJkU2hlbGw7XG4gIG9uU2F2ZTogKCkgPT4gdm9pZDtcbiAgb25EaXNjYXJkOiAoKSA9PiB2b2lkO1xuICBjaGlsZHJlbjogUmVhY3ROb2RlO1xufSkge1xuICBjb25zdCBbb3Blbiwgc2V0T3Blbl0gPSB1c2VTdGF0ZShmYWxzZSk7XG4gIGNvbnN0IHsgc3RhdGUgfSA9IHByb3BzO1xuICBpZiAoIXN0YXRlLmF2YWlsYWJsZSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHRpdGxlID0gcHJvcHMudChwcm9wcy50aXRsZUtleSk7XG4gIGNvbnN0IGJsb2NrZWQgPSAhc3RhdGUuZGlydHkgfHwgc3RhdGUuaW52YWxpZCB8fCBzdGF0ZS5zYXZpbmc7XG4gIHJldHVybiAoXG4gICAgPGxpIGNsYXNzTmFtZT17b3BlbiA/ICdkc2hBY0NhcmQgZHNoQWNDYXJkT3BlbicgOiAnZHNoQWNDYXJkJ30+XG4gICAgICA8YnV0dG9uXG4gICAgICAgIHR5cGU9XCJidXR0b25cIlxuICAgICAgICBjbGFzc05hbWU9XCJkc2hBY0hlYWRlclwiXG4gICAgICAgIGFyaWEtZXhwYW5kZWQ9e29wZW59XG4gICAgICAgIGFyaWEtbGFiZWw9e2Ake3Byb3BzLnQob3BlbiA/ICdjaHJvbWUuY29sbGFwc2UnIDogJ2Nocm9tZS5leHBhbmQnKX06ICR7dGl0bGV9YH1cbiAgICAgICAgdGl0bGU9e3Byb3BzLnQocHJvcHMuZGVzY3JpcHRpb25LZXkpfVxuICAgICAgICBvbkNsaWNrPXsoKSA9PiBzZXRPcGVuKCFvcGVuKX1cbiAgICAgID5cbiAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwiZHNoQWNIZWFkVGV4dFwiPlxuICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImRzaEFjTmFtZVwiPnt0aXRsZX08L3NwYW4+XG4gICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwiZHNoQWNEZXNjcmlwdGlvblwiPntwcm9wcy50KHByb3BzLmRlc2NyaXB0aW9uS2V5KX08L3NwYW4+XG4gICAgICAgIDwvc3Bhbj5cbiAgICAgICAge3N0YXRlLmRpcnR5ID8gKFxuICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImRzaEFjUGVuZGluZ1wiIHRpdGxlPXtwcm9wcy50KCdjaHJvbWUudW5zYXZlZCcpfT5cbiAgICAgICAgICAgIHtwcm9wcy50KCdjaHJvbWUudW5zYXZlZCcpfVxuICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgKSA6IG51bGx9XG4gICAgICAgIDxzcGFuIGNsYXNzTmFtZT17b3BlbiA/ICdkc2hBY0NoZXZyb24gZHNoQWNDaGV2cm9uT3BlbicgOiAnZHNoQWNDaGV2cm9uJ30+4pa+PC9zcGFuPlxuICAgICAgPC9idXR0b24+XG4gICAgICB7b3BlbiA/IChcbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJkc2hBY0JvZHlcIj5cbiAgICAgICAgICB7IXN0YXRlLndyaXRhYmxlID8gKFxuICAgICAgICAgICAgPHAgY2xhc3NOYW1lPVwiZHNoQWNSZWFkT25seVwiIHJvbGU9XCJzdGF0dXNcIj57cHJvcHMudCgnY2hyb21lLnJlYWRPbmx5Jyl9PC9wPlxuICAgICAgICAgICkgOiBudWxsfVxuICAgICAgICAgIHtwcm9wcy5jaGlsZHJlbn1cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImRzaEFjRm9vdGVyXCI+XG4gICAgICAgICAgICB7c3RhdGUuZmFpbGVkID8gKFxuICAgICAgICAgICAgICA8cCBjbGFzc05hbWU9XCJkc2hBY0ZhaWxlZFwiIHJvbGU9XCJzdGF0dXNcIj57cHJvcHMudCgnY2hyb21lLnNhdmVGYWlsZWQnKX08L3A+XG4gICAgICAgICAgICApIDogbnVsbH1cbiAgICAgICAgICAgIDxidXR0b25cbiAgICAgICAgICAgICAgdHlwZT1cImJ1dHRvblwiXG4gICAgICAgICAgICAgIGNsYXNzTmFtZT1cImRzaEFjRGlzY2FyZFwiXG4gICAgICAgICAgICAgIGRpc2FibGVkPXshc3RhdGUuZGlydHkgfHwgc3RhdGUuc2F2aW5nfVxuICAgICAgICAgICAgICBvbkNsaWNrPXtwcm9wcy5vbkRpc2NhcmR9XG4gICAgICAgICAgICA+XG4gICAgICAgICAgICAgIHtwcm9wcy50KCdjaHJvbWUuZGlzY2FyZCcpfVxuICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzc05hbWU9XCJkc2hBY1NhdmVcIiBkaXNhYmxlZD17YmxvY2tlZH0gb25DbGljaz17cHJvcHMub25TYXZlfT5cbiAgICAgICAgICAgICAge3Byb3BzLnQoIXN0YXRlLnNhdmluZyA/ICdjaHJvbWUuc2F2ZScgOiAnY2hyb21lLnNhdmluZycpfVxuICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgICAgKSA6IG51bGx9XG4gICAgPC9saT5cbiAgKTtcbn1cblxuLyoqIFByb3BzIGV2ZXJ5IGZpZWxkIGNvbnRyb2wgbmVlZHMgcmVnYXJkbGVzcyBvZiBpdHMgdmFsdWUgdHlwZS4gKi9cbmludGVyZmFjZSBGaWVsZFByb3BzIHtcbiAgaWQ6IHN0cmluZztcbiAgbGFiZWw6IHN0cmluZztcbiAgaGludDogc3RyaW5nO1xuICB0ZXh0OiBzdHJpbmc7XG4gIG92ZXJyaWRkZW46IGJvb2xlYW47XG4gIGludmFsaWQ6IGJvb2xlYW47XG4gIGRpc2FibGVkOiBib29sZWFuO1xuICB0OiAoa2V5OiBTZXR0aW5nc0NhcmRLZXkpID0+IHN0cmluZztcbiAgb25FZGl0OiAodGV4dDogc3RyaW5nKSA9PiB2b2lkO1xuICBvblJlc2V0OiAoKSA9PiB2b2lkO1xufVxuXG4vKiogQSBzdGFnZWQgdmFsdWUgZmllbGQ7IGBudW1lcmljYCBvbmx5IGhpbnRzIHRoZSBrZXlwYWQsIHdoaWNoIGRyYWZ0cyBhIGZpZWxkIGFjY2VwdHMgaXMgZGVjaWRlZCBieSBpdHMgc3BlYy4gKi9cbmZ1bmN0aW9uIFZhbHVlRmllbGQocHJvcHM6IEZpZWxkUHJvcHMgJiB7IG51bWVyaWM/OiBib29sZWFuOyBwbGFjZWhvbGRlcj86IHN0cmluZyB9KSB7XG4gIHJldHVybiAoXG4gICAgPGRpdiBjbGFzc05hbWU9XCJkc2hBY0ZpZWxkXCI+XG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cImRzaEFjSGVhZFwiPlxuICAgICAgICA8bGFiZWwgY2xhc3NOYW1lPVwiZHNoQWNMYWJlbFwiIGh0bWxGb3I9e3Byb3BzLmlkfT57cHJvcHMubGFiZWx9PC9sYWJlbD5cbiAgICAgICAge3Byb3BzLm92ZXJyaWRkZW4gPyAoXG4gICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwiZHNoQWNCYWRnZXNcIj5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImRzaEFjQmFkZ2VcIj57cHJvcHMudCgnY2hyb21lLm92ZXJyaWRkZW4nKX08L3NwYW4+XG4gICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzc05hbWU9XCJkc2hBY1Jlc2V0XCIgZGlzYWJsZWQ9e3Byb3BzLmRpc2FibGVkfSBvbkNsaWNrPXtwcm9wcy5vblJlc2V0fT5cbiAgICAgICAgICAgICAge3Byb3BzLnQoJ2Nocm9tZS5yZXNldCcpfVxuICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgPC9zcGFuPlxuICAgICAgICApIDogbnVsbH1cbiAgICAgIDwvZGl2PlxuICAgICAgPGlucHV0XG4gICAgICAgIGlkPXtwcm9wcy5pZH1cbiAgICAgICAgY2xhc3NOYW1lPXtwcm9wcy5pbnZhbGlkID8gJ2RzaEFjSW5wdXQgZHNoQWNJbnB1dEludmFsaWQnIDogJ2RzaEFjSW5wdXQnfVxuICAgICAgICB0eXBlPVwidGV4dFwiXG4gICAgICAgIGlucHV0TW9kZT17cHJvcHMubnVtZXJpYyA9PT0gdHJ1ZSA/ICdudW1lcmljJyA6IHVuZGVmaW5lZH1cbiAgICAgICAgYXJpYS1pbnZhbGlkPXtwcm9wcy5pbnZhbGlkIHx8IHVuZGVmaW5lZH1cbiAgICAgICAgdmFsdWU9e3Byb3BzLnRleHR9XG4gICAgICAgIHBsYWNlaG9sZGVyPXtwcm9wcy5wbGFjZWhvbGRlciA/PyAnJ31cbiAgICAgICAgZGlzYWJsZWQ9e3Byb3BzLmRpc2FibGVkfVxuICAgICAgICBvbkNoYW5nZT17KGV2ZW50KSA9PiBwcm9wcy5vbkVkaXQoZXZlbnQudGFyZ2V0LnZhbHVlKX1cbiAgICAgIC8+XG4gICAgICA8cCBjbGFzc05hbWU9e3Byb3BzLmludmFsaWQgPyAnZHNoQWNJbnZhbGlkJyA6ICdkc2hBY0hpbnQnfT5cbiAgICAgICAge3Byb3BzLmludmFsaWQgPyBwcm9wcy50KCdjaHJvbWUuaW52YWxpZE51bWJlcicpIDogcHJvcHMuaGludH1cbiAgICAgIDwvcD5cbiAgICA8L2Rpdj5cbiAgKTtcbn1cblxuLyoqIEEgc3RhZ2VkIGJvb2xlYW4gZmllbGQ6IGluaGVyaXQgLyBvbiAvIG9mZi4gKi9cbmZ1bmN0aW9uIEJvb2xlYW5GaWVsZChwcm9wczogRmllbGRQcm9wcykge1xuICByZXR1cm4gKFxuICAgIDxkaXYgY2xhc3NOYW1lPVwiZHNoQWNGaWVsZFwiPlxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJkc2hBY0hlYWRcIj5cbiAgICAgICAgPGxhYmVsIGNsYXNzTmFtZT1cImRzaEFjTGFiZWxcIiBodG1sRm9yPXtwcm9wcy5pZH0+e3Byb3BzLmxhYmVsfTwvbGFiZWw+XG4gICAgICAgIHtwcm9wcy5vdmVycmlkZGVuID8gKFxuICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImRzaEFjQmFkZ2VzXCI+XG4gICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJkc2hBY0JhZGdlXCI+e3Byb3BzLnQoJ2Nocm9tZS5vdmVycmlkZGVuJyl9PC9zcGFuPlxuICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3NOYW1lPVwiZHNoQWNSZXNldFwiIGRpc2FibGVkPXtwcm9wcy5kaXNhYmxlZH0gb25DbGljaz17cHJvcHMub25SZXNldH0+XG4gICAgICAgICAgICAgIHtwcm9wcy50KCdjaHJvbWUucmVzZXQnKX1cbiAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgKSA6IG51bGx9XG4gICAgICA8L2Rpdj5cbiAgICAgIDxzZWxlY3RcbiAgICAgICAgaWQ9e3Byb3BzLmlkfVxuICAgICAgICBjbGFzc05hbWU9XCJkc2hBY1NlbGVjdFwiXG4gICAgICAgIHZhbHVlPXtwcm9wcy50ZXh0fVxuICAgICAgICBkaXNhYmxlZD17cHJvcHMuZGlzYWJsZWR9XG4gICAgICAgIG9uQ2hhbmdlPXsoZXZlbnQpID0+IHByb3BzLm9uRWRpdChldmVudC50YXJnZXQudmFsdWUpfVxuICAgICAgPlxuICAgICAgICA8b3B0aW9uIHZhbHVlPVwiXCI+e3Byb3BzLnQoJ2Nocm9tZS5pbmhlcml0Jyl9PC9vcHRpb24+XG4gICAgICAgIDxvcHRpb24gdmFsdWU9XCJ0cnVlXCI+e3Byb3BzLnQoJ2Nocm9tZS5vbicpfTwvb3B0aW9uPlxuICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZmFsc2VcIj57cHJvcHMudCgnY2hyb21lLm9mZicpfTwvb3B0aW9uPlxuICAgICAgPC9zZWxlY3Q+XG4gICAgICA8cCBjbGFzc05hbWU9XCJkc2hBY0hpbnRcIj57cHJvcHMuaGludH08L3A+XG4gICAgPC9kaXY+XG4gICk7XG59XG5cbi8qKlxuICogUmVuZGVyIHRoZSBhdXRvLWNvbnRpbnVlIGNhcmQuXG4gKiBAcGFyYW0gcHJvcHMgLSBsb2NhbGUgY29weSwgdGhlIGNhcmQgc25hcHNob3QsIGFuZCBpdHMgZm9ybSBhY3Rpb25zLlxuICogQHJldHVybnMgdGhlIGNhcmQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBBdXRvQ29udGludWVTZXR0aW5nc0NhcmQocHJvcHM6IEF1dG9Db250aW51ZVNldHRpbmdzQ2FyZFByb3BzKSB7XG4gIGNvbnN0IHsgdCB9ID0gcHJvcHM7XG4gIGNvbnN0IHN0YXRlID0gcHJvcHMudXNlQXV0b0NvbnRpbnVlU2V0dGluZ3NDYXJkKChzbmFwc2hvdCkgPT4gc25hcHNob3QpO1xuICBjb25zdCBkaXNhYmxlZCA9ICFzdGF0ZS53cml0YWJsZTtcbiAgY29uc3Qgc2hhcmVkID0geyB0LCBkaXNhYmxlZCB9O1xuICByZXR1cm4gKFxuICAgIDxTZXR0aW5nc0NhcmRcbiAgICAgIHQ9e3R9XG4gICAgICB0aXRsZUtleT1cImNhcmQudGl0bGVcIlxuICAgICAgZGVzY3JpcHRpb25LZXk9XCJjYXJkLmRlc2NyaXB0aW9uXCJcbiAgICAgIHN0YXRlPXtzdGF0ZX1cbiAgICAgIG9uU2F2ZT17cHJvcHMuc2F2ZX1cbiAgICAgIG9uRGlzY2FyZD17cHJvcHMuZGlzY2FyZH1cbiAgICA+XG4gICAgICA8VmFsdWVGaWVsZFxuICAgICAgICBpZD1cImF1dG8tY29udGludWUtY29udGludWUtdGV4dFwiXG4gICAgICAgIGxhYmVsPXt0KCdmaWVsZC5jb250aW51ZVRleHQnKX1cbiAgICAgICAgaGludD17dCgnZmllbGQuY29udGludWVUZXh0SGludCcpfVxuICAgICAgICB7Li4uc2hhcmVkfVxuICAgICAgICB7Li4uc3RhdGUuY29udGludWVUZXh0fVxuICAgICAgICBvbkVkaXQ9eyh0ZXh0KSA9PiBwcm9wcy5lZGl0KCdjb250aW51ZVRleHQnLCB0ZXh0KX1cbiAgICAgICAgb25SZXNldD17KCkgPT4gcHJvcHMucmVzZXRGaWVsZCgnY29udGludWVUZXh0Jyl9XG4gICAgICAvPlxuICAgICAgPFZhbHVlRmllbGRcbiAgICAgICAgaWQ9XCJhdXRvLWNvbnRpbnVlLWdyYWNlLW1zXCJcbiAgICAgICAgbGFiZWw9e3QoJ2ZpZWxkLmdyYWNlTXMnKX1cbiAgICAgICAgaGludD17dCgnZmllbGQuZ3JhY2VNc0hpbnQnKX1cbiAgICAgICAgbnVtZXJpY1xuICAgICAgICB7Li4uc2hhcmVkfVxuICAgICAgICB7Li4uc3RhdGUuZ3JhY2VNc31cbiAgICAgICAgb25FZGl0PXsodGV4dCkgPT4gcHJvcHMuZWRpdCgnZ3JhY2VNcycsIHRleHQpfVxuICAgICAgICBvblJlc2V0PXsoKSA9PiBwcm9wcy5yZXNldEZpZWxkKCdncmFjZU1zJyl9XG4gICAgICAvPlxuICAgICAgPFZhbHVlRmllbGRcbiAgICAgICAgaWQ9XCJhdXRvLWNvbnRpbnVlLWNvb2xkb3duLW1zXCJcbiAgICAgICAgbGFiZWw9e3QoJ2ZpZWxkLmNvb2xkb3duTXMnKX1cbiAgICAgICAgaGludD17dCgnZmllbGQuY29vbGRvd25Nc0hpbnQnKX1cbiAgICAgICAgbnVtZXJpY1xuICAgICAgICB7Li4uc2hhcmVkfVxuICAgICAgICB7Li4uc3RhdGUuY29vbGRvd25Nc31cbiAgICAgICAgb25FZGl0PXsodGV4dCkgPT4gcHJvcHMuZWRpdCgnY29vbGRvd25NcycsIHRleHQpfVxuICAgICAgICBvblJlc2V0PXsoKSA9PiBwcm9wcy5yZXNldEZpZWxkKCdjb29sZG93bk1zJyl9XG4gICAgICAvPlxuICAgICAgPFZhbHVlRmllbGRcbiAgICAgICAgaWQ9XCJhdXRvLWNvbnRpbnVlLW1heC1jb25zZWN1dGl2ZVwiXG4gICAgICAgIGxhYmVsPXt0KCdmaWVsZC5tYXhDb25zZWN1dGl2ZScpfVxuICAgICAgICBoaW50PXt0KCdmaWVsZC5tYXhDb25zZWN1dGl2ZUhpbnQnKX1cbiAgICAgICAgbnVtZXJpY1xuICAgICAgICB7Li4uc2hhcmVkfVxuICAgICAgICB7Li4uc3RhdGUubWF4Q29uc2VjdXRpdmV9XG4gICAgICAgIG9uRWRpdD17KHRleHQpID0+IHByb3BzLmVkaXQoJ21heENvbnNlY3V0aXZlJywgdGV4dCl9XG4gICAgICAgIG9uUmVzZXQ9eygpID0+IHByb3BzLnJlc2V0RmllbGQoJ21heENvbnNlY3V0aXZlJyl9XG4gICAgICAvPlxuICAgICAgPEJvb2xlYW5GaWVsZFxuICAgICAgICBpZD1cImF1dG8tY29udGludWUtc2Nhbi1vbi1ib290XCJcbiAgICAgICAgbGFiZWw9e3QoJ2ZpZWxkLnNjYW5PbkJvb3QnKX1cbiAgICAgICAgaGludD17dCgnZmllbGQuc2Nhbk9uQm9vdEhpbnQnKX1cbiAgICAgICAgey4uLnNoYXJlZH1cbiAgICAgICAgey4uLnN0YXRlLnNjYW5PbkJvb3R9XG4gICAgICAgIG9uRWRpdD17KHRleHQpID0+IHByb3BzLmVkaXQoJ3NjYW5PbkJvb3QnLCB0ZXh0KX1cbiAgICAgICAgb25SZXNldD17KCkgPT4gcHJvcHMucmVzZXRGaWVsZCgnc2Nhbk9uQm9vdCcpfVxuICAgICAgLz5cbiAgICAgIDxWYWx1ZUZpZWxkXG4gICAgICAgIGlkPVwiYXV0by1jb250aW51ZS1zY2FuLWxpbWl0XCJcbiAgICAgICAgbGFiZWw9e3QoJ2ZpZWxkLnNjYW5MaW1pdCcpfVxuICAgICAgICBoaW50PXt0KCdmaWVsZC5zY2FuTGltaXRIaW50Jyl9XG4gICAgICAgIG51bWVyaWNcbiAgICAgICAgey4uLnNoYXJlZH1cbiAgICAgICAgey4uLnN0YXRlLnNjYW5MaW1pdH1cbiAgICAgICAgb25FZGl0PXsodGV4dCkgPT4gcHJvcHMuZWRpdCgnc2NhbkxpbWl0JywgdGV4dCl9XG4gICAgICAgIG9uUmVzZXQ9eygpID0+IHByb3BzLnJlc2V0RmllbGQoJ3NjYW5MaW1pdCcpfVxuICAgICAgLz5cbiAgICAgIDxWYWx1ZUZpZWxkXG4gICAgICAgIGlkPVwiYXV0by1jb250aW51ZS1mcmVzaC1tc1wiXG4gICAgICAgIGxhYmVsPXt0KCdmaWVsZC5mcmVzaE1zJyl9XG4gICAgICAgIGhpbnQ9e3QoJ2ZpZWxkLmZyZXNoTXNIaW50Jyl9XG4gICAgICAgIG51bWVyaWNcbiAgICAgICAgey4uLnNoYXJlZH1cbiAgICAgICAgey4uLnN0YXRlLmZyZXNoTXN9XG4gICAgICAgIG9uRWRpdD17KHRleHQpID0+IHByb3BzLmVkaXQoJ2ZyZXNoTXMnLCB0ZXh0KX1cbiAgICAgICAgb25SZXNldD17KCkgPT4gcHJvcHMucmVzZXRGaWVsZCgnZnJlc2hNcycpfVxuICAgICAgLz5cbiAgICAgIDxWYWx1ZUZpZWxkXG4gICAgICAgIGlkPVwiYXV0by1jb250aW51ZS1yZWNvbm5lY3Qtc2Nhbi1kZWxheVwiXG4gICAgICAgIGxhYmVsPXt0KCdmaWVsZC5yZWNvbm5lY3RTY2FuRGVsYXlNcycpfVxuICAgICAgICBoaW50PXt0KCdmaWVsZC5yZWNvbm5lY3RTY2FuRGVsYXlNc0hpbnQnKX1cbiAgICAgICAgbnVtZXJpY1xuICAgICAgICB7Li4uc2hhcmVkfVxuICAgICAgICB7Li4uc3RhdGUucmVjb25uZWN0U2NhbkRlbGF5TXN9XG4gICAgICAgIG9uRWRpdD17KHRleHQpID0+IHByb3BzLmVkaXQoJ3JlY29ubmVjdFNjYW5EZWxheU1zJywgdGV4dCl9XG4gICAgICAgIG9uUmVzZXQ9eygpID0+IHByb3BzLnJlc2V0RmllbGQoJ3JlY29ubmVjdFNjYW5EZWxheU1zJyl9XG4gICAgICAvPlxuICAgICAgPFZhbHVlRmllbGRcbiAgICAgICAgaWQ9XCJhdXRvLWNvbnRpbnVlLXJlY29ubmVjdC1iYWNrb2ZmXCJcbiAgICAgICAgbGFiZWw9e3QoJ2ZpZWxkLnJlY29ubmVjdEJhY2tvZmZNcycpfVxuICAgICAgICBoaW50PXt0KCdmaWVsZC5yZWNvbm5lY3RCYWNrb2ZmTXNIaW50Jyl9XG4gICAgICAgIG51bWVyaWNcbiAgICAgICAgey4uLnNoYXJlZH1cbiAgICAgICAgey4uLnN0YXRlLnJlY29ubmVjdEJhY2tvZmZNc31cbiAgICAgICAgb25FZGl0PXsodGV4dCkgPT4gcHJvcHMuZWRpdCgncmVjb25uZWN0QmFja29mZk1zJywgdGV4dCl9XG4gICAgICAgIG9uUmVzZXQ9eygpID0+IHByb3BzLnJlc2V0RmllbGQoJ3JlY29ubmVjdEJhY2tvZmZNcycpfVxuICAgICAgLz5cbiAgICAgIDxCb29sZWFuRmllbGRcbiAgICAgICAgaWQ9XCJhdXRvLWNvbnRpbnVlLXZlcmJvc2VcIlxuICAgICAgICBsYWJlbD17dCgnZmllbGQudmVyYm9zZScpfVxuICAgICAgICBoaW50PXt0KCdmaWVsZC52ZXJib3NlSGludCcpfVxuICAgICAgICB7Li4uc2hhcmVkfVxuICAgICAgICB7Li4uc3RhdGUudmVyYm9zZX1cbiAgICAgICAgb25FZGl0PXsodGV4dCkgPT4gcHJvcHMuZWRpdCgndmVyYm9zZScsIHRleHQpfVxuICAgICAgICBvblJlc2V0PXsoKSA9PiBwcm9wcy5yZXNldEZpZWxkKCd2ZXJib3NlJyl9XG4gICAgICAvPlxuICAgIDwvU2V0dGluZ3NDYXJkPlxuICApO1xufVxuIiwgIi8qKlxuICogU3RhZ2VkIGZvcm0gbW9kZWwgYmVoaW5kIHRoZSBwbHVnaW4gc2V0dGluZ3MgY2FyZCDigJQgYSBzZWxmLWNvbnRhaW5lZFxuICogaW1wbGVtZW50YXRpb24gb2YgdGhlIHBsdWdpbi1jYXJkIHN0b3JlIHBhdHRlcm4gdXNlZCBieSB0aGUgRFNIIHBsdWdpblxuICogY29uZmlndXJhdGlvbiBzZWN0aW9uLlxuICpcbiAqIEEgY2FyZCBzdGFnZXMgd2hhdCB0aGUgdXNlciB0eXBlcyBhbmQgd3JpdGVzIGl0IG9ubHkgd2hlbiB0aGV5IHNhdmUuIEVhY2hcbiAqIHNldHRpbmdzIHdyaXRlIGlzIGEgZHVyYWJsZSwgcmV2aXNpb24tZmVuY2VkIGRvY3VtZW50IG11dGF0aW9uLCBzbyBzdGFnaW5nXG4gKiBrZWVwcyB3aGF0IGlzIG9uIHNjcmVlbiBleGFjdGx5IHdoYXQgYSBzYXZlIHdvdWxkIHN0b3JlLiBBIGZpZWxkIHNob3dzIGl0c1xuICogZWZmZWN0aXZlIHZhbHVlIOKAlCB0aGUgdXNlciBsYXllciBvdmVyIHRoZSBjb21wb3NpdGlvbiBsYXllciBvdmVyIHRoZSBzY2hlbWFcbiAqIGRlZmF1bHQg4oCUIGFuZCB3aGV0aGVyIHRoZSB1c2VyIGxheWVyIGNhcnJpZXMgaXQgKHByZXNlbmNlLCBub3QgdmFsdWVcbiAqIGVxdWFsaXR5LCBtYXJrcyBhbiBvdmVycmlkZSkuXG4gKi9cbmltcG9ydCB0eXBlIHsgU2V0dGluZ3NTY29wZSwgU25hcHNob3RTdG9yZSB9IGZyb20gJ0BkZWVwc2Vlay1haS9kc2gtY2xpZW50LXJ1bnRpbWUvY2xpZW50JztcblxuLyoqIFRoZSB3cml0ZSBvbmUgZmllbGQncyBzdGFnZWQgdGV4dCBwZXJmb3JtcyB3aGVuIHRoZSBjYXJkIGlzIHNhdmVkLiAqL1xuZXhwb3J0IHR5cGUgRmllbGRXcml0ZSA9IHsga2luZDogJ3NldCc7IHZhbHVlOiB1bmtub3duIH0gfCB7IGtpbmQ6ICdjbGVhcicgfTtcblxuLyoqIEhvdyBvbmUgZmllbGQgY29udmVydHMgYmV0d2VlbiBpdHMgc3RvcmVkIHZhbHVlIGFuZCBpdHMgZHJhZnQgdGV4dC4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQ2FyZEZpZWxkU3BlYyB7XG4gIC8qKiBGaWVsZCBuYW1lIGluc2lkZSB0aGUgbmFtZXNwYWNlIHNlY3Rpb24uICovXG4gIGZpZWxkOiBzdHJpbmc7XG4gIC8qKiBSZW5kZXIgYSBzdG9yZWQgdmFsdWUgYXMgZHJhZnQgdGV4dDsgdGhlIGVtcHR5IHN0cmluZyB3aGVuIHRoZSBzZWN0aW9uIGNhcnJpZXMgbm9uZS4gKi9cbiAgZm9ybWF0OiAodmFsdWU6IHVua25vd24pID0+IHN0cmluZztcbiAgLyoqXG4gICAqIFRoZSB3cml0ZSB0aGlzIGRyYWZ0IHRleHQgc3RhZ2VzLCBvciB1bmRlZmluZWQgd2hlbiB0aGUgdGV4dCBpcyBub3QgYVxuICAgKiB2YWx1ZSB0aGlzIGZpZWxkIGFjY2VwdHMg4oCUIHdoaWNoIGJsb2NrcyB0aGUgc2F2ZSByYXRoZXIgdGhhbiBkaXNjYXJkaW5nIGl0LlxuICAgKi9cbiAgcGFyc2U6ICh0ZXh0OiBzdHJpbmcpID0+IEZpZWxkV3JpdGUgfCB1bmRlZmluZWQ7XG59XG5cbi8qKiBPbmUgZmllbGQgYXMgdGhlIGNhcmQncyBjb250cm9sIHJlbmRlcnMgaXQuICovXG5leHBvcnQgaW50ZXJmYWNlIENhcmRGaWVsZFN0YXRlIHtcbiAgLyoqIERyYWZ0IHRleHQgdGhlIGNvbnRyb2wgcmVuZGVycy4gKi9cbiAgdGV4dDogc3RyaW5nO1xuICAvKiogV2hldGhlciBzYXZpbmcgd291bGQgbGVhdmUgYSB1c2VyLWxheWVyIGVudHJ5IGZvciB0aGlzIGZpZWxkLiAqL1xuICBvdmVycmlkZGVuOiBib29sZWFuO1xuICAvKiogV2hldGhlciB0aGUgZHJhZnQgaXMgbm90IGEgdmFsdWUgdGhpcyBmaWVsZCBhY2NlcHRzLCB3aGljaCBibG9ja3Mgc2F2aW5nLiAqL1xuICBpbnZhbGlkOiBib29sZWFuO1xufVxuXG4vKiogRm9ybSBzdGF0ZSBldmVyeSBwbHVnaW4gY2FyZCBzaGFyZXMuICovXG5leHBvcnQgaW50ZXJmYWNlIENhcmRTaGVsbCB7XG4gIC8qKiBGYWxzZSB3aGlsZSB0aGUgbmFtZXNwYWNlIGlzIG5vdCBzZXJ2ZWQgdG8gdGhpcyBjbGllbnQ7IHRoZSBjYXJkIHJlbmRlcnMgbm90aGluZy4gKi9cbiAgYXZhaWxhYmxlOiBib29sZWFuO1xuICAvKiogV2hldGhlciB0aGUgSG9zdCBkb2N1bWVudCBhY2NlcHRzIHdyaXRlcy4gKi9cbiAgd3JpdGFibGU6IGJvb2xlYW47XG4gIC8qKiBXaGV0aGVyIHRoZSBmb3JtIGhvbGRzIGVkaXRzIHRoYXQgYSBzYXZlIHdvdWxkIHdyaXRlLiAqL1xuICBkaXJ0eTogYm9vbGVhbjtcbiAgLyoqIFdoZXRoZXIgYW55IHN0YWdlZCBkcmFmdCBpcyBpbnZhbGlkLCB3aGljaCBibG9ja3MgdGhlIHNhdmUuICovXG4gIGludmFsaWQ6IGJvb2xlYW47XG4gIC8qKiBXaGV0aGVyIGEgc2F2ZSBpcyBjcm9zc2luZyB0aGUgd2lyZS4gKi9cbiAgc2F2aW5nOiBib29sZWFuO1xuICAvKiogV2hldGhlciB0aGUgbGFzdCBzYXZlIGRpZCBub3QgbGFuZCBhcyBzdGFnZWQ7IGNsZWFyZWQgYnkgdGhlIG5leHQgZWRpdCBvciBzYXZlLiAqL1xuICBmYWlsZWQ6IGJvb2xlYW47XG59XG5cbi8qKiBUaGUgd3JpdGUgYWN0aW9ucyB0aGUgY2FyZCdzIHNsb3QgZW50cnkgaW5qZWN0cy4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQ2FyZEFjdGlvbnMge1xuICAvKiogU3RhZ2UgZHJhZnQgdGV4dCBmb3Igb25lIGZpZWxkLiAqL1xuICBlZGl0OiAoZmllbGQ6IHN0cmluZywgdGV4dDogc3RyaW5nKSA9PiB2b2lkO1xuICAvKiogU3RhZ2UgYSBjbGVhciwgc28gc2F2aW5nIGxldHMgdGhlIGZpZWxkIHJlLWluaGVyaXQgdGhlIGNvbXBvc2l0aW9uIGxheWVyLiAqL1xuICByZXNldEZpZWxkOiAoZmllbGQ6IHN0cmluZykgPT4gdm9pZDtcbiAgLyoqIFdyaXRlIGV2ZXJ5IHN0YWdlZCBlZGl0LCB0aGVuIHJlLXNlZWQgZnJvbSB3aGF0IHRoZSBIb3N0IGFjY2VwdGVkLiAqL1xuICBzYXZlOiAoKSA9PiB2b2lkO1xuICAvKiogRHJvcCBldmVyeSBzdGFnZWQgZWRpdC4gKi9cbiAgZGlzY2FyZDogKCkgPT4gdm9pZDtcbn1cblxuLyoqIEEgd2hvbGUtbnVtYmVyIGZpZWxkLiBBbiBlbXB0eSBkcmFmdCBjbGVhcnMgdGhlIGZpZWxkOyBhIG5vbi1udW1iZXIgb3Igb3V0LW9mLXJhbmdlIGRyYWZ0IGJsb2NrcyB0aGUgc2F2ZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBudW1iZXJGaWVsZChmaWVsZDogc3RyaW5nLCBtaW4gPSAwKTogQ2FyZEZpZWxkU3BlYyB7XG4gIHJldHVybiB7XG4gICAgZmllbGQsXG4gICAgZm9ybWF0OiAodmFsdWUpID0+ICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInID8gU3RyaW5nKHZhbHVlKSA6ICcnKSxcbiAgICBwYXJzZTogKHRleHQpID0+IHtcbiAgICAgIGNvbnN0IHRyaW1tZWQgPSB0ZXh0LnRyaW0oKTtcbiAgICAgIGlmICh0cmltbWVkID09PSAnJykgcmV0dXJuIHsga2luZDogJ2NsZWFyJyB9O1xuICAgICAgY29uc3QgcGFyc2VkID0gTnVtYmVyKHRyaW1tZWQpO1xuICAgICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUocGFyc2VkKSB8fCAhTnVtYmVyLmlzSW50ZWdlcihwYXJzZWQpIHx8IHBhcnNlZCA8IG1pbikgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIHJldHVybiB7IGtpbmQ6ICdzZXQnLCB2YWx1ZTogcGFyc2VkIH07XG4gICAgfSxcbiAgfTtcbn1cblxuLyoqIEEgZnJlZS10ZXh0IGZpZWxkLiBBbiBlbXB0eSBkcmFmdCBjbGVhcnMgdGhlIGZpZWxkLCBzbyBlbXB0eWluZyB0aGUgY29udHJvbCBhbmQgc2F2aW5nIGlzIHRoZSBzYW1lIGdlc3R1cmUgYXMgcmVzZXR0aW5nIGl0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRleHRGaWVsZChmaWVsZDogc3RyaW5nKTogQ2FyZEZpZWxkU3BlYyB7XG4gIHJldHVybiB7XG4gICAgZmllbGQsXG4gICAgZm9ybWF0OiAodmFsdWUpID0+ICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gdmFsdWUgOiAnJyksXG4gICAgcGFyc2U6ICh0ZXh0KSA9PiB7XG4gICAgICBjb25zdCB0cmltbWVkID0gdGV4dC50cmltKCk7XG4gICAgICByZXR1cm4gdHJpbW1lZCA9PT0gJycgPyB7IGtpbmQ6ICdjbGVhcicgfSA6IHsga2luZDogJ3NldCcsIHZhbHVlOiB0cmltbWVkIH07XG4gICAgfSxcbiAgfTtcbn1cblxuLyoqIEEgYm9vbGVhbiBmaWVsZCwgZWRpdGVkIHRocm91Z2ggdHJ1ZS9mYWxzZSBkcmFmdCB0ZXh0OyBhbiBlbXB0eSBkcmFmdCBpbmhlcml0cy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBib29sZWFuRmllbGQoZmllbGQ6IHN0cmluZyk6IENhcmRGaWVsZFNwZWMge1xuICByZXR1cm4ge1xuICAgIGZpZWxkLFxuICAgIGZvcm1hdDogKHZhbHVlKSA9PiAodHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicgPyBTdHJpbmcodmFsdWUpIDogJycpLFxuICAgIHBhcnNlOiAodGV4dCkgPT4ge1xuICAgICAgY29uc3QgdHJpbW1lZCA9IHRleHQudHJpbSgpO1xuICAgICAgaWYgKHRyaW1tZWQgPT09ICcnKSByZXR1cm4geyBraW5kOiAnY2xlYXInIH07XG4gICAgICBpZiAodHJpbW1lZCA9PT0gJ3RydWUnKSByZXR1cm4geyBraW5kOiAnc2V0JywgdmFsdWU6IHRydWUgfTtcbiAgICAgIGlmICh0cmltbWVkID09PSAnZmFsc2UnKSByZXR1cm4geyBraW5kOiAnc2V0JywgdmFsdWU6IGZhbHNlIH07XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH0sXG4gIH07XG59XG5cbi8qKiBPbmUgZmllbGQncyBzdGFnZWQgZWRpdC4gKi9cbmludGVyZmFjZSBTdGFnZWRFZGl0IHtcbiAgLyoqIERyYWZ0IHRleHQgdGhlIGNvbnRyb2wgcmVuZGVycy4gKi9cbiAgdGV4dDogc3RyaW5nO1xuICAvKiogVHJ1ZSB3aGVuIHRoaXMgZWRpdCBjbGVhcnMgdGhlIGZpZWxkIHdoYXRldmVyIHRleHQgaXQgc2hvd3MuICovXG4gIGNsZWFyOiBib29sZWFuO1xufVxuXG4vKipcbiAqIFN0YWdlcyBvbmUgY2FyZCdzIGVkaXRzIG92ZXIgb25lIHNldHRpbmdzIG5hbWVzcGFjZSBhbmQgd3JpdGVzIHRoZW0gb24gc2F2ZS5cbiAqXG4gKiBUaGUgSG9zdCBpcyB0aGUgb25seSBhdXRob3JpdHkgb24gd2hldGhlciBhIHZhbHVlIHdhcyBhY2NlcHRlZCwgc28gdGhlXG4gKiBvdXRjb21lIGlzIHJlYWQgYmFjayBmcm9tIHRoZSBzZWN0aW9uIHJhdGhlciB0aGFuIHByZWRpY3RlZCBoZXJlLiBBIHNhdmVcbiAqIHRoYXQgZGlkIG5vdCBsYW5kIGtlZXBzIGl0cyBkcmFmdHMsIHNvIHRoZSB1c2VyIGNhbiBjb3JyZWN0IHRoZW0gaW5zdGVhZCBvZlxuICogcmV0eXBpbmcuXG4gKi9cbmV4cG9ydCBjbGFzcyBDYXJkRm9ybTxUPiB7XG4gIHByaXZhdGUgcmVhZG9ubHkgc3BlY3M6IE1hcDxzdHJpbmcsIENhcmRGaWVsZFNwZWM+O1xuICBwcml2YXRlIHJlYWRvbmx5IHN0YWdlZCA9IG5ldyBNYXA8c3RyaW5nLCBTdGFnZWRFZGl0PigpO1xuICBwcml2YXRlIHJlYWRvbmx5IGxpc3RlbmVycyA9IG5ldyBTZXQ8KCkgPT4gdm9pZD4oKTtcbiAgcHJpdmF0ZSBzYXZpbmcgPSBmYWxzZTtcbiAgcHJpdmF0ZSBmYWlsZWQgPSBmYWxzZTtcblxuICAvKipcbiAgICogQHBhcmFtIHNjb3BlIC0gdGhlIGJvdW5kIHNldHRpbmdzIHNjb3BlIGZvciB0aGlzIGNhcmQncyBuYW1lc3BhY2UuXG4gICAqIEBwYXJhbSBzcGVjcyAtIHRoZSBzZWN0aW9uIGZpZWxkcyB0aGlzIGNhcmQgZWRpdHMuXG4gICAqL1xuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIHJlYWRvbmx5IHNjb3BlOiBTZXR0aW5nc1Njb3BlPFQ+LFxuICAgIHNwZWNzOiBDYXJkRmllbGRTcGVjW10sXG4gICkge1xuICAgIHRoaXMuc3BlY3MgPSBuZXcgTWFwKHNwZWNzLm1hcCgoc3BlYykgPT4gW3NwZWMuZmllbGQsIHNwZWNdKSk7XG4gICAgdGhpcy5zY29wZS5zdWJzY3JpYmUoKCkgPT4gdGhpcy5wdWJsaXNoKCkpO1xuICB9XG5cbiAgLyoqIFB1Ymxpc2ggYSBwcm9qZWN0aW9uIG9mIHRoaXMgZm9ybSwgcmVidWlsdCB3aGVuZXZlciB0aGUgc2NvcGUgb3IgYSBkcmFmdCBjaGFuZ2VzLiAqL1xuICBiaW5kPFM+KHByb2plY3Q6ICgpID0+IFMsIGNyZWF0ZVN0b3JlOiAoaW5pdDogUykgPT4gU25hcHNob3RTdG9yZTxTPik6IFNuYXBzaG90U3RvcmU8Uz4ge1xuICAgIGNvbnN0IHN0b3JlID0gY3JlYXRlU3RvcmUocHJvamVjdCgpKTtcbiAgICB0aGlzLmxpc3RlbmVycy5hZGQoKCkgPT4gc3RvcmUuc2V0KHByb2plY3QoKSkpO1xuICAgIHJldHVybiBzdG9yZTtcbiAgfVxuXG4gIC8qKiBSZWFkIHRoZSBjYXJkLWxldmVsIHN0YXRlOiB3aGF0IHRoZSBIb3N0IHNlcnZlcywgYW5kIHdoYXQgYSBzYXZlIHdvdWxkIGRvLiAqL1xuICBzaGVsbCgpOiBDYXJkU2hlbGwge1xuICAgIGNvbnN0IHNuYXBzaG90ID0gdGhpcy5zY29wZS5nZXRTbmFwc2hvdCgpO1xuICAgIHJldHVybiB7XG4gICAgICBhdmFpbGFibGU6IHNuYXBzaG90LnN0YXR1cyA9PT0gJ3JlYWR5JyxcbiAgICAgIHdyaXRhYmxlOiBzbmFwc2hvdC53cml0YWJsZSxcbiAgICAgIGRpcnR5OiB0aGlzLnBsYW4oKS5sZW5ndGggPiAwLFxuICAgICAgaW52YWxpZDogdGhpcy5wbGFuKCkuc29tZSgoaXRlbSkgPT4gaXRlbS5ydW4gPT09IHVuZGVmaW5lZCksXG4gICAgICBzYXZpbmc6IHRoaXMuc2F2aW5nLFxuICAgICAgZmFpbGVkOiB0aGlzLmZhaWxlZCxcbiAgICB9O1xuICB9XG5cbiAgLyoqIFJlYWQgb25lIGZpZWxkJ3Mgc3RhdGUgZnJvbSB0aGUgZWZmZWN0aXZlIHNlY3Rpb24gYW5kIGl0cyBzdGFnZWQgZHJhZnQuICovXG4gIGZpZWxkKGZpZWxkOiBzdHJpbmcpOiBDYXJkRmllbGRTdGF0ZSB7XG4gICAgY29uc3Qgc3BlYyA9IHRoaXMuc3BlY09mKGZpZWxkKTtcbiAgICBjb25zdCBzdGFnZWQgPSB0aGlzLnN0YWdlZC5nZXQoZmllbGQpO1xuICAgIGlmIChzdGFnZWQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgdGV4dDogc3BlYy5mb3JtYXQodGhpcy5zZWN0aW9uVmFsdWUoZmllbGQpKSxcbiAgICAgICAgb3ZlcnJpZGRlbjogdGhpcy5zdG9yZWQoZmllbGQpLFxuICAgICAgICBpbnZhbGlkOiBmYWxzZSxcbiAgICAgIH07XG4gICAgfVxuICAgIGNvbnN0IHdyaXRlID0gc3RhZ2VkLmNsZWFyID8geyBraW5kOiAnY2xlYXInIGFzIGNvbnN0IH0gOiBzcGVjLnBhcnNlKHN0YWdlZC50ZXh0KTtcbiAgICByZXR1cm4ge1xuICAgICAgdGV4dDogc3RhZ2VkLnRleHQsXG4gICAgICBvdmVycmlkZGVuOiB3cml0ZT8ua2luZCA9PT0gJ3NldCcsXG4gICAgICBpbnZhbGlkOiB3cml0ZSA9PT0gdW5kZWZpbmVkLFxuICAgIH07XG4gIH1cblxuICAvKiogVGhlIGFjdGlvbnMgdGhlIGNhcmQncyBzbG90IHJlZ2lzdHJhdGlvbiBpbmplY3RzLiAqL1xuICBhY3Rpb25zKCk6IENhcmRBY3Rpb25zIHtcbiAgICByZXR1cm4ge1xuICAgICAgZWRpdDogKGZpZWxkLCB0ZXh0KSA9PiB0aGlzLnN0YWdlKGZpZWxkLCB7IHRleHQsIGNsZWFyOiBmYWxzZSB9KSxcbiAgICAgIHJlc2V0RmllbGQ6IChmaWVsZCkgPT4ge1xuICAgICAgICB0aGlzLnN0YWdlKGZpZWxkLCB7IHRleHQ6IHRoaXMuc3BlY09mKGZpZWxkKS5mb3JtYXQodGhpcy5iYXNlVmFsdWUoZmllbGQpKSwgY2xlYXI6IHRydWUgfSk7XG4gICAgICB9LFxuICAgICAgc2F2ZTogKCkgPT4gdm9pZCB0aGlzLnNhdmUoKSxcbiAgICAgIGRpc2NhcmQ6ICgpID0+IHtcbiAgICAgICAgaWYgKHRoaXMuc3RhZ2VkLnNpemUgPT09IDAgJiYgIXRoaXMuZmFpbGVkKSByZXR1cm47XG4gICAgICAgIHRoaXMuc3RhZ2VkLmNsZWFyKCk7XG4gICAgICAgIHRoaXMuZmFpbGVkID0gZmFsc2U7XG4gICAgICAgIHRoaXMucHVibGlzaCgpO1xuICAgICAgfSxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFdyaXRlIGV2ZXJ5IHN0YWdlZCBlZGl0LCB0aGVuIHJlLXNlZWQgZnJvbSB3aGF0IHRoZSBIb3N0IGFjY2VwdGVkLlxuICAgKiBAcmV0dXJucyBzZXR0bGVtZW50IGFmdGVyIGV2ZXJ5IHdyaXRlIGFuZCB0aGUgcmVhZC1iYWNrLlxuICAgKi9cbiAgYXN5bmMgc2F2ZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBwbGFuID0gdGhpcy5wbGFuKCk7XG4gICAgY29uc3Qgd3JpdGVzID0gcGxhbi5mbGF0TWFwKChpdGVtKSA9PiAoaXRlbS5ydW4gPT09IHVuZGVmaW5lZCA/IFtdIDogW2l0ZW0ucnVuXSkpO1xuICAgIGlmIChwbGFuLmxlbmd0aCA9PT0gMCB8fCB0aGlzLnNhdmluZyB8fCB3cml0ZXMubGVuZ3RoICE9PSBwbGFuLmxlbmd0aCkgcmV0dXJuO1xuICAgIC8vIFNuYXBzaG90IHRoZSBmaWVsZHMgdGhpcyBzYXZlIHdyaXRlcywgc28gZWRpdHMgc3RhZ2VkIHdoaWxlIGl0IGlzIGluXG4gICAgLy8gZmxpZ2h0IHN1cnZpdmU6IG9ubHkgdGhlIHN0YWdlZCBrZXlzIHRoaXMgc2F2ZSBhY3R1YWxseSB3cm90ZSBhcmUgY2xlYXJlZC5cbiAgICBjb25zdCBmaWVsZHMgPSBuZXcgU2V0KHBsYW4ubWFwKChpdGVtKSA9PiBpdGVtLmZpZWxkKSk7XG4gICAgdGhpcy5zYXZpbmcgPSB0cnVlO1xuICAgIHRoaXMuZmFpbGVkID0gZmFsc2U7XG4gICAgdGhpcy5wdWJsaXNoKCk7XG4gICAgbGV0IGxhbmRlZCA9IHRydWU7XG4gICAgZm9yIChjb25zdCB3cml0ZSBvZiB3cml0ZXMpIHtcbiAgICAgIGxhbmRlZCA9IChhd2FpdCB3cml0ZSgpKSAmJiBsYW5kZWQ7XG4gICAgfVxuICAgIGlmIChsYW5kZWQpIHtcbiAgICAgIGZvciAoY29uc3QgZmllbGQgb2YgZmllbGRzKSB0aGlzLnN0YWdlZC5kZWxldGUoZmllbGQpO1xuICAgIH1cbiAgICB0aGlzLnNhdmluZyA9IGZhbHNlO1xuICAgIHRoaXMuZmFpbGVkID0gIWxhbmRlZDtcbiAgICB0aGlzLnB1Ymxpc2goKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFdmVyeSBzdGFnZWQgZWRpdCBhIHNhdmUgd291bGQgd3JpdGUuIEFuIGVudHJ5IHdob3NlIGRyYWZ0IGlzIG5vdCBhIHZhbHVlXG4gICAqIGl0cyBmaWVsZCBhY2NlcHRzIGNhcnJpZXMgbm8gd3JpdGU6IHRoZSBmb3JtIGlzIHN0aWxsIGRpcnR5LCBhbmQgdGhlIHNhdmVcbiAgICogcmVmdXNlcyByYXRoZXIgdGhhbiBkcm9wcGluZyB0aGUgZWRpdC4gQSBzdGFnZWQgZWRpdCB0aGF0IG1hdGNoZXMgdGhlXG4gICAqIGVmZmVjdGl2ZSBzZWN0aW9uIGlzIG5vdCBhIHdyaXRlIGF0IGFsbC5cbiAgICovXG4gIHByaXZhdGUgcGxhbigpOiB7IGZpZWxkOiBzdHJpbmc7IHJ1bjogKCgpID0+IFByb21pc2U8Ym9vbGVhbj4pIHwgdW5kZWZpbmVkIH1bXSB7XG4gICAgY29uc3QgcGxhbjogeyBmaWVsZDogc3RyaW5nOyBydW46ICgoKSA9PiBQcm9taXNlPGJvb2xlYW4+KSB8IHVuZGVmaW5lZCB9W10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IFtmaWVsZCwgc3RhZ2VkXSBvZiB0aGlzLnN0YWdlZCkge1xuICAgICAgY29uc3Qgc3BlYyA9IHRoaXMuc3BlY09mKGZpZWxkKTtcbiAgICAgIGlmIChzdGFnZWQuY2xlYXIpIHtcbiAgICAgICAgaWYgKHRoaXMuc3RvcmVkKGZpZWxkKSkgcGxhbi5wdXNoKHsgZmllbGQsIHJ1bjogKCkgPT4gdGhpcy5jbGVhcihmaWVsZCkgfSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlZC50ZXh0ID09PSBzcGVjLmZvcm1hdCh0aGlzLnNlY3Rpb25WYWx1ZShmaWVsZCkpKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHdyaXRlID0gc3BlYy5wYXJzZShzdGFnZWQudGV4dCk7XG4gICAgICBpZiAod3JpdGUgPT09IHVuZGVmaW5lZCkgcGxhbi5wdXNoKHsgZmllbGQsIHJ1bjogdW5kZWZpbmVkIH0pO1xuICAgICAgZWxzZSBpZiAod3JpdGUua2luZCA9PT0gJ2NsZWFyJykgcGxhbi5wdXNoKHsgZmllbGQsIHJ1bjogKCkgPT4gdGhpcy5jbGVhcihmaWVsZCkgfSk7XG4gICAgICBlbHNlIHBsYW4ucHVzaCh7IGZpZWxkLCBydW46ICgpID0+IHRoaXMuc3RvcmUoZmllbGQsIHdyaXRlLnZhbHVlKSB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHBsYW47XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNsZWFyKGZpZWxkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBhd2FpdCB0aGlzLnNjb3BlLnVuc2V0KGZpZWxkKTtcbiAgICByZXR1cm4gIXRoaXMuc3RvcmVkKGZpZWxkKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc3RvcmUoZmllbGQ6IHN0cmluZywgdmFsdWU6IHVua25vd24pOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBhd2FpdCB0aGlzLnNjb3BlLnNldChmaWVsZCwgdmFsdWUpO1xuICAgIHJldHVybiB0aGlzLnVzZXJMYXllcigpPy5bZmllbGRdID09PSB2YWx1ZTtcbiAgfVxuXG4gIHByaXZhdGUgc3RhZ2UoZmllbGQ6IHN0cmluZywgZWRpdDogU3RhZ2VkRWRpdCk6IHZvaWQge1xuICAgIHRoaXMuc3RhZ2VkLnNldChmaWVsZCwgZWRpdCk7XG4gICAgdGhpcy5mYWlsZWQgPSBmYWxzZTtcbiAgICB0aGlzLnB1Ymxpc2goKTtcbiAgfVxuXG4gIHByaXZhdGUgc3BlY09mKGZpZWxkOiBzdHJpbmcpOiBDYXJkRmllbGRTcGVjIHtcbiAgICBjb25zdCBzcGVjID0gdGhpcy5zcGVjcy5nZXQoZmllbGQpO1xuICAgIGlmIChzcGVjID09PSB1bmRlZmluZWQpIHRocm93IG5ldyBFcnJvcihgc2V0dGluZ3MgY2FyZCBoYXMgbm8gZmllbGQgJHtmaWVsZH1gKTtcbiAgICByZXR1cm4gc3BlYztcbiAgfVxuXG4gIHByaXZhdGUgc2VjdGlvblZhbHVlKGZpZWxkOiBzdHJpbmcpOiB1bmtub3duIHtcbiAgICByZXR1cm4gKHRoaXMuc2NvcGUuZ2V0U25hcHNob3QoKS52YWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk/LltmaWVsZF07XG4gIH1cblxuICBwcml2YXRlIGJhc2VWYWx1ZShmaWVsZDogc3RyaW5nKTogdW5rbm93biB7XG4gICAgcmV0dXJuICh0aGlzLnNjb3BlLmdldFNuYXBzaG90KCkuYmFzZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk/LltmaWVsZF07XG4gIH1cblxuICBwcml2YXRlIHVzZXJMYXllcigpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCB7XG4gICAgcmV0dXJuIHRoaXMuc2NvcGUuZ2V0U25hcHNob3QoKS51c2VyIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkO1xuICB9XG5cbiAgcHJpdmF0ZSBzdG9yZWQoZmllbGQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHVzZXIgPSB0aGlzLnVzZXJMYXllcigpO1xuICAgIHJldHVybiB1c2VyICE9PSB1bmRlZmluZWQgJiYgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHVzZXIsIGZpZWxkKTtcbiAgfVxuXG4gIHByaXZhdGUgcHVibGlzaCgpOiB2b2lkIHtcbiAgICBmb3IgKGNvbnN0IGxpc3RlbmVyIG9mIHRoaXMubGlzdGVuZXJzKSBsaXN0ZW5lcigpO1xuICB9XG59XG4iLCAiLyoqXG4gKiBTdHlsZXMgZm9yIHRoZSBhdXRvLWNvbnRpbnVlIHNldHRpbmdzIGNhcmQsIGluamVjdGVkIGF0IGZhY3RvcnlcbiAqIG1hdGVyaWFsaXphdGlvbiBzbyB0aGUgY2xpZW50IG1vZHVsZSBzeXN0ZW0ncyBzdHlsZSBib29ra2VlcGluZyAoSE1SKSBvd25zXG4gKiB0aGVtLiBVc2VzIHRoZSBEU0ggZGVzaWduIHRva2VucyAoYC0tZHN3LWFsaWFzLSpgKSBzbyB0aGUgY2FyZCBmb2xsb3dzIHRoZVxuICogYWN0aXZlIHRoZW1lLlxuICovXG5cbmNvbnN0IGNzcyA9IGBcbi5kc2hBY0NhcmQge1xuICBib3JkZXI6IDFweCBzb2xpZCB2YXIoLS1kc3ctYWxpYXMtYm9yZGVyLWwyKTtcbiAgYmFja2dyb3VuZDogdmFyKC0tZHN3LWFsaWFzLWJnLWxheWVyLTMpO1xuICBib3JkZXItcmFkaXVzOiAxMnB4O1xuICBsaXN0LXN0eWxlOiBub25lO1xuICB0cmFuc2l0aW9uOiBib3JkZXItY29sb3IgLjE2cywgYmFja2dyb3VuZCAuMTZzO1xufVxuLmRzaEFjQ2FyZDpob3ZlciB7IGJvcmRlci1jb2xvcjogdmFyKC0tZHN3LWFsaWFzLWxhYmVsLWRpbW1lZCk7IH1cbi5kc2hBY0NhcmRPcGVuIHtcbiAgYmFja2dyb3VuZDogdmFyKC0tZHN3LWFsaWFzLWJnLWxheWVyLTIpO1xuICBib3JkZXItY29sb3I6IHZhcigtLWRzdy1hbGlhcy1sYWJlbC1kaW1tZWQpO1xufVxuLmRzaEFjSGVhZGVyIHtcbiAgYXBwZWFyYW5jZTogbm9uZTtcbiAgd2lkdGg6IDEwMCU7XG4gIGZvbnQ6IGluaGVyaXQ7XG4gIGNvbG9yOiBpbmhlcml0O1xuICB0ZXh0LWFsaWduOiBsZWZ0O1xuICBjdXJzb3I6IHBvaW50ZXI7XG4gIGJhY2tncm91bmQ6IG5vbmU7XG4gIGJvcmRlcjogMDtcbiAgYm9yZGVyLXJhZGl1czogMTJweDtcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgZ2FwOiAxMnB4O1xuICBwYWRkaW5nOiAxNHB4IDE2cHg7XG4gIGRpc3BsYXk6IGZsZXg7XG59XG4uZHNoQWNIZWFkZXI6Zm9jdXMtdmlzaWJsZSB7IG91dGxpbmU6IDJweCBzb2xpZCB2YXIoLS1kc3ctYWxpYXMtYnJhbmQtcHJpbWFyeSk7IG91dGxpbmUtb2Zmc2V0OiAtMnB4OyB9XG4uZHNoQWNIZWFkVGV4dCB7IGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47IGZsZXg6IDE7IGdhcDogNHB4OyBtaW4td2lkdGg6IDA7IGRpc3BsYXk6IGZsZXg7IH1cbi5kc2hBY05hbWUgeyBjb2xvcjogdmFyKC0tZHN3LWFsaWFzLWxhYmVsLXByaW1hcnkpOyBmb250LXNpemU6IDE1cHg7IGZvbnQtd2VpZ2h0OiA2MDA7IGxpbmUtaGVpZ2h0OiAxLjQ7IH1cbi5kc2hBY0Rlc2NyaXB0aW9uIHsgY29sb3I6IHZhcigtLWRzdy1hbGlhcy1sYWJlbC10ZXJ0aWFyeSk7IGZvbnQtc2l6ZTogMTNweDsgbGluZS1oZWlnaHQ6IDEuNTsgfVxuLmRzaEFjQ2hldnJvbiB7IGNvbG9yOiB2YXIoLS1kc3ctYWxpYXMtbGFiZWwtdGVydGlhcnkpOyBmbGV4OiBub25lOyB0cmFuc2l0aW9uOiB0cmFuc2Zvcm0gLjE2czsgfVxuLmRzaEFjQ2hldnJvbk9wZW4geyB0cmFuc2Zvcm06IHJvdGF0ZSgxODBkZWcpOyB9XG4uZHNoQWNCb2R5IHsgYm9yZGVyLXRvcDogMXB4IHNvbGlkIHZhcigtLWRzdy1hbGlhcy1ib3JkZXItbDIpOyBtYXJnaW46IDAgMTZweDsgcGFkZGluZy1ib3R0b206IDhweDsgfVxuLmRzaEFjUmVhZE9ubHkgeyBjb2xvcjogdmFyKC0tZHN3LWFsaWFzLWxhYmVsLXRlcnRpYXJ5KTsgbWFyZ2luOiAxMnB4IDAgMDsgZm9udC1zaXplOiAxMnB4OyBsaW5lLWhlaWdodDogMS41OyB9XG4uZHNoQWNQZW5kaW5nIHtcbiAgd2hpdGUtc3BhY2U6IG5vd3JhcDtcbiAgYmFja2dyb3VuZDogdmFyKC0tZHN3LWFsaWFzLWJnLW1vZHVsZS1wbGF0Zm9ybSk7XG4gIGNvbG9yOiB2YXIoLS1kc3ctYWxpYXMtbGFiZWwtc2Vjb25kYXJ5KTtcbiAgYm9yZGVyLXJhZGl1czogOTk5cHg7XG4gIGZsZXg6IG5vbmU7XG4gIHBhZGRpbmc6IDFweCA4cHg7XG4gIGZvbnQtc2l6ZTogMTFweDtcbiAgZm9udC13ZWlnaHQ6IDUwMDtcbiAgbGluZS1oZWlnaHQ6IDE3cHg7XG59XG4uZHNoQWNGb290ZXIge1xuICBib3JkZXItdG9wOiAxcHggc29saWQgdmFyKC0tZHN3LWFsaWFzLWJvcmRlci1sMik7XG4gIGp1c3RpZnktY29udGVudDogZmxleC1lbmQ7XG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gIGdhcDogOHB4O1xuICBwYWRkaW5nOiAxMnB4IDAgNHB4O1xuICBkaXNwbGF5OiBmbGV4O1xufVxuLmRzaEFjRmFpbGVkIHsgbWluLXdpZHRoOiAwOyBjb2xvcjogdmFyKC0tZHN3LWFsaWFzLWxhYmVsLWVycm9yKTsgZmxleDogMTsgbWFyZ2luOiAwOyBmb250LXNpemU6IDEycHg7IGxpbmUtaGVpZ2h0OiAxLjU7IH1cbi5kc2hBY0Rpc2NhcmQsIC5kc2hBY1NhdmUge1xuICBhcHBlYXJhbmNlOiBub25lO1xuICBmb250OiBpbmhlcml0O1xuICBjdXJzb3I6IHBvaW50ZXI7XG4gIGJvcmRlcjogMXB4IHNvbGlkIHRyYW5zcGFyZW50O1xuICBib3JkZXItcmFkaXVzOiA4cHg7XG4gIHBhZGRpbmc6IDVweCAxNHB4O1xuICBmb250LXNpemU6IDEzcHg7XG4gIGxpbmUtaGVpZ2h0OiAxLjU7XG59XG4uZHNoQWNEaXNjYXJkIHsgYm9yZGVyLWNvbG9yOiB2YXIoLS1kc3ctYWxpYXMtYm9yZGVyLWwyKTsgY29sb3I6IHZhcigtLWRzdy1hbGlhcy1sYWJlbC1zZWNvbmRhcnkpOyBiYWNrZ3JvdW5kOiBub25lOyB9XG4uZHNoQWNEaXNjYXJkOmhvdmVyOm5vdCg6ZGlzYWJsZWQpIHsgY29sb3I6IHZhcigtLWRzdy1hbGlhcy1sYWJlbC1wcmltYXJ5KTsgYm9yZGVyLWNvbG9yOiB2YXIoLS1kc3ctYWxpYXMtbGFiZWwtZGltbWVkKTsgfVxuLmRzaEFjU2F2ZSB7IGJhY2tncm91bmQ6IHZhcigtLWRzdy1hbGlhcy1sYWJlbC1wcmltYXJ5KTsgY29sb3I6IHZhcigtLWRzdy1hbGlhcy1iZy1sYXllci0zKTsgfVxuLmRzaEFjRGlzY2FyZDpkaXNhYmxlZCwgLmRzaEFjU2F2ZTpkaXNhYmxlZCB7IG9wYWNpdHk6IC40OyBjdXJzb3I6IGRlZmF1bHQ7IH1cbi5kc2hBY0Rpc2NhcmQ6Zm9jdXMtdmlzaWJsZSwgLmRzaEFjU2F2ZTpmb2N1cy12aXNpYmxlIHsgb3V0bGluZTogMnB4IHNvbGlkIHZhcigtLWRzdy1hbGlhcy1icmFuZC1wcmltYXJ5KTsgb3V0bGluZS1vZmZzZXQ6IDFweDsgfVxuLmRzaEFjRmllbGQgeyBmbGV4LWRpcmVjdGlvbjogY29sdW1uOyBnYXA6IDZweDsgcGFkZGluZzogMTJweCAwOyBkaXNwbGF5OiBmbGV4OyB9XG4uZHNoQWNGaWVsZCArIC5kc2hBY0ZpZWxkIHsgYm9yZGVyLXRvcDogMXB4IHNvbGlkIHZhcigtLWRzdy1hbGlhcy1ib3JkZXItbDIpOyB9XG4uZHNoQWNIZWFkIHsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZ2FwOiA4cHg7IGRpc3BsYXk6IGZsZXg7IH1cbi5kc2hBY0xhYmVsIHsgbWluLXdpZHRoOiAwOyBjb2xvcjogdmFyKC0tZHN3LWFsaWFzLWxhYmVsLXByaW1hcnkpOyBmbGV4OiAxOyBmb250LXNpemU6IDEzcHg7IGZvbnQtd2VpZ2h0OiA1MDA7IGxpbmUtaGVpZ2h0OiAxLjU7IH1cbi5kc2hBY0JhZGdlcyB7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogOHB4OyBkaXNwbGF5OiBpbmxpbmUtZmxleDsgfVxuLmRzaEFjQmFkZ2Uge1xuICB3aGl0ZS1zcGFjZTogbm93cmFwO1xuICBiYWNrZ3JvdW5kOiB2YXIoLS1kc3ctYWxpYXMtYmctbW9kdWxlLXBsYXRmb3JtKTtcbiAgY29sb3I6IHZhcigtLWRzdy1hbGlhcy1sYWJlbC1zZWNvbmRhcnkpO1xuICBib3JkZXItcmFkaXVzOiA5OTlweDtcbiAgcGFkZGluZzogMXB4IDhweDtcbiAgZm9udC1zaXplOiAxMXB4O1xuICBmb250LXdlaWdodDogNTAwO1xuICBsaW5lLWhlaWdodDogMTdweDtcbn1cbi5kc2hBY1Jlc2V0IHtcbiAgZm9udDogaW5oZXJpdDtcbiAgY29sb3I6IHZhcigtLWRzdy1hbGlhcy1sYWJlbC1zZWNvbmRhcnkpO1xuICBjdXJzb3I6IHBvaW50ZXI7XG4gIGJhY2tncm91bmQ6IG5vbmU7XG4gIGJvcmRlcjogbm9uZTtcbiAgcGFkZGluZzogMDtcbiAgZm9udC1zaXplOiAxMnB4O1xuICBsaW5lLWhlaWdodDogMS41O1xufVxuLmRzaEFjUmVzZXQ6aG92ZXI6bm90KDpkaXNhYmxlZCkgeyBjb2xvcjogdmFyKC0tZHN3LWFsaWFzLWxhYmVsLXByaW1hcnkpOyB9XG4uZHNoQWNSZXNldDpkaXNhYmxlZCB7IGN1cnNvcjogZGVmYXVsdDsgfVxuLmRzaEFjSW5wdXQge1xuICBib3JkZXI6IDFweCBzb2xpZCB2YXIoLS1kc3ctYWxpYXMtYm9yZGVyLWwyKTtcbiAgYmFja2dyb3VuZDogdmFyKC0tZHN3LWFsaWFzLWJnLWxheWVyLTMpO1xuICBoZWlnaHQ6IDM0cHg7XG4gIGZvbnQ6IGluaGVyaXQ7XG4gIGNvbG9yOiB2YXIoLS1kc3ctYWxpYXMtbGFiZWwtcHJpbWFyeSk7XG4gIGJvcmRlci1yYWRpdXM6IDhweDtcbiAgcGFkZGluZzogMCAxMnB4O1xuICBmb250LXNpemU6IDEzcHg7XG4gIGxpbmUtaGVpZ2h0OiAxLjU7XG59XG4uZHNoQWNJbnB1dDpmb2N1cy12aXNpYmxlIHsgYm9yZGVyLWNvbG9yOiB2YXIoLS1kc3ctYWxpYXMtYnJhbmQtcHJpbWFyeSk7IG91dGxpbmU6IG5vbmU7IH1cbi5kc2hBY0lucHV0OmRpc2FibGVkIHsgY29sb3I6IHZhcigtLWRzdy1hbGlhcy1sYWJlbC10ZXJ0aWFyeSk7IGN1cnNvcjogZGVmYXVsdDsgfVxuLmRzaEFjSW5wdXRJbnZhbGlkIHsgYm9yZGVyLWNvbG9yOiB2YXIoLS1kc3ctYWxpYXMtbGFiZWwtZXJyb3IpOyB9XG4uZHNoQWNTZWxlY3Qge1xuICBib3JkZXI6IDFweCBzb2xpZCB2YXIoLS1kc3ctYWxpYXMtYm9yZGVyLWwyKTtcbiAgYmFja2dyb3VuZDogdmFyKC0tZHN3LWFsaWFzLWJnLWxheWVyLTMpO1xuICBoZWlnaHQ6IDM0cHg7XG4gIGZvbnQ6IGluaGVyaXQ7XG4gIGNvbG9yOiB2YXIoLS1kc3ctYWxpYXMtbGFiZWwtcHJpbWFyeSk7XG4gIGJvcmRlci1yYWRpdXM6IDhweDtcbiAgcGFkZGluZzogMCA4cHg7XG4gIGZvbnQtc2l6ZTogMTNweDtcbiAgbGluZS1oZWlnaHQ6IDEuNTtcbn1cbi5kc2hBY1NlbGVjdDpmb2N1cy12aXNpYmxlIHsgYm9yZGVyLWNvbG9yOiB2YXIoLS1kc3ctYWxpYXMtYnJhbmQtcHJpbWFyeSk7IG91dGxpbmU6IG5vbmU7IH1cbi5kc2hBY1NlbGVjdDpkaXNhYmxlZCB7IGNvbG9yOiB2YXIoLS1kc3ctYWxpYXMtbGFiZWwtdGVydGlhcnkpOyBjdXJzb3I6IGRlZmF1bHQ7IH1cbi5kc2hBY0ludmFsaWQgeyBjb2xvcjogdmFyKC0tZHN3LWFsaWFzLWxhYmVsLWVycm9yKTsgbWFyZ2luOiAwOyBmb250LXNpemU6IDEycHg7IGxpbmUtaGVpZ2h0OiAxLjU7IH1cbi5kc2hBY0hpbnQgeyBjb2xvcjogdmFyKC0tZHN3LWFsaWFzLWxhYmVsLXRlcnRpYXJ5KTsgbWFyZ2luOiAwOyBmb250LXNpemU6IDEycHg7IGxpbmUtaGVpZ2h0OiAxLjU7IH1cbmA7XG5cbi8qKiBJbmplY3QgdGhlIHN0eWxlc2hlZXQgb25jZTsgYSBuby1vcCBvdXRzaWRlIGEgYnJvd3NlciBlbnZpcm9ubWVudC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbmplY3RTdHlsZXMoKTogdm9pZCB7XG4gIGlmICh0eXBlb2YgZG9jdW1lbnQgPT09ICd1bmRlZmluZWQnKSByZXR1cm47XG4gIGlmIChkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdzdHlsZVtkYXRhLXBsdWdpbi1jc3M9XCJhdXRvLWNvbnRpbnVlL2NhcmRcIl0nKSAhPT0gbnVsbCkgcmV0dXJuO1xuICBjb25zdCB0YWcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICB0YWcuZGF0YXNldC5wbHVnaW4gPSAnZHNoLWNsaWVudC1hdXRvLWNvbnRpbnVlJztcbiAgdGFnLmRhdGFzZXQucGx1Z2luQ3NzID0gJ2F1dG8tY29udGludWUvY2FyZCc7XG4gIHRhZy50ZXh0Q29udGVudCA9IGNzcztcbiAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZCh0YWcpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7OztBQ2tETyxJQUFNLGlCQUFxQztBQUFBLEVBQ2hELGNBQWM7QUFBQSxFQUNkLFNBQVM7QUFBQSxFQUNULFlBQVk7QUFBQSxF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

		return module.exports;
	}
});
