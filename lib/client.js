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
  verbose: true,
  classify: true,
  backoffFactor: 2,
  backoffMaxMs: 3e5,
  notify: false
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
    verbose: booleanOr(value.verbose, DEFAULT_CONFIG.verbose),
    classify: booleanOr(value.classify, DEFAULT_CONFIG.classify),
    backoffFactor: Math.max(1, numberOr(value.backoffFactor, DEFAULT_CONFIG.backoffFactor)),
    backoffMaxMs: numberOr(value.backoffMaxMs, DEFAULT_CONFIG.backoffMaxMs),
    notify: booleanOr(value.notify, DEFAULT_CONFIG.notify)
  };
}
function isNonHumanReason(kind) {
  return kind === "error" || kind === "interrupted" || kind === "max-tokens";
}
function isTransientFailure(failure) {
  const haystack = `${failure.code} ${failure.message}`.toLowerCase();
  const status = failure.status;
  if (status !== void 0 && (status === 401 || status === 403)) return false;
  const permanent = /auth|unauthor|forbidden|credential|api[_-]?key|permission/i.test(haystack) || /insufficient.*(balance|quota)|billing|payment|quota.*exceeded.*(?!retry)/i.test(haystack) || /model.*not[_-]?found|unknown[_-]?model|model[_-]?not[_-]?found|not.*support.*model/i.test(haystack) || /context.*(length|limit|overflow|exceed)|token.*limit|max.*context/i.test(haystack) || /invalid[_-]?request|bad[_-]?request/i.test(haystack);
  return !permanent;
}
function notify(title, body) {
  try {
    const N = globalThis.Notification;
    if (typeof N === "undefined") return;
    const permission = N.permission;
    if (permission === "granted") {
      new N(title, { body });
    } else if (permission === "default") {
      void N.requestPermission?.().then((result) => {
        if (result === "granted") new N(title, { body });
      }).catch(() => {
      });
    }
  } catch {
  }
}
function fillTemplate(template, facts, tool, turn) {
  return template.replace(/\{code\}/g, facts?.code ?? "").replace(/\{message\}/g, facts?.message ?? "").replace(/\{status\}/g, facts?.status !== void 0 ? String(facts.status) : "").replace(/\{tool\}/g, tool ?? "").replace(/\{turn\}/g, turn !== void 0 ? String(turn) : "");
}
function effectiveCooldown(consecutive, base, factor, max) {
  const multiplier = Math.pow(factor, consecutive);
  return Math.min(Math.max(base, base * multiplier), Math.max(base, max));
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
  subagent: false,
  lastFailure: void 0,
  lastTool: void 0,
  lastTurn: void 0
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
        if (frame.event.type === "tool/call") {
          const name = frame.event.data.name;
          if (typeof name === "string") this.state(frame.sessionId).lastTool = name;
        }
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
          state.lastFailure = void 0;
        } else if (reason.kind === "aborted") {
          state.consecutive = 0;
        } else if (reason.kind === "blocked") {
        } else if (reason.kind === "error") {
          const error = reason.error;
          state.lastFailure = {
            code: typeof error.code === "string" ? error.code : "UNKNOWN",
            message: typeof error.message === "string" ? error.message : String(error),
            ...typeof error.status === "number" ? { status: error.status } : {}
          };
          state.lastTurn = event.data.turn;
          this.onTurnFailure(sessionId, "turn/end:error", state.lastFailure);
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
  /** 回合失败入口: 先做错误分类, 永久性失败跳过并通知, 临时性失败走正常调度。 */
  onTurnFailure(sessionId, reason, failure) {
    const config = this.getConfig();
    if (config.classify && !isTransientFailure(failure)) {
      const summary = `${failure.code}${failure.status !== void 0 ? ` (HTTP ${failure.status})` : ""}`;
      this.log(`跳过 ${sessionId}(${reason}): 永久性失败 ${summary} — ${failure.message}`);
      if (config.notify) {
        notify("dsh-auto-continue: 未自动继续", `${sessionId}: 永久性错误 ${summary}，需要人工处理`);
      }
      return;
    }
    this.schedule(sessionId, reason);
  }
  /** 本会话当前生效的冷却间隔(自适应退避)。 */
  cooldownFor(state) {
    const config = this.getConfig();
    return effectiveCooldown(
      state.consecutive,
      config.cooldownMs,
      config.backoffFactor,
      config.backoffMaxMs
    );
  }
  schedule(sessionId, reason) {
    const state = this.state(sessionId);
    const config = this.getConfig();
    if (state.subagent) return;
    if (state.pendingTimer !== void 0) return;
    if (Date.now() - state.lastAttemptAt < this.cooldownFor(state)) return;
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
    if (Date.now() - readLastSend(sessionId) < this.cooldownFor(state)) {
      this.log(`跳过 ${sessionId}: 其他标签页刚发送过`);
      return;
    }
    if (!claimSend(sessionId)) {
      this.log(`跳过 ${sessionId}: 其他标签页正在发送`);
      return;
    }
    const text = fillTemplate(config.continueText, state.lastFailure, state.lastTool, state.lastTurn);
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
        if (config.notify) {
          notify("dsh-auto-continue: 已自动继续", `${sessionId}: 已发送「${text}」(第 ${state.consecutive} 次连续)`);
        }
        if (state.consecutive >= config.maxConsecutive) {
          this.log(`达到连续上限 ${config.maxConsecutive} 次, 停止自动继续 ${sessionId}`);
          if (config.notify) {
            notify("dsh-auto-continue: 已停止自动继续", `${sessionId}: 连续失败 ${state.consecutive} 次, 需要人工介入`);
          }
        }
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
      if (now - state.lastAttemptAt < this.cooldownFor(state)) continue;
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
  "field.classify": "错误分类",
  "field.classifyHint": "仅自动恢复临时性错误(网络/超时/5xx 等); 认证/余额/模型不存在等永久性错误跳过并通知。",
  "field.backoffFactor": "退避系数",
  "field.backoffFactorHint": "连续失败时冷却间隔的倍率(如 2 表示 20s→40s→80s 递增)。",
  "field.backoffMaxMs": "最大退避间隔 (ms)",
  "field.backoffMaxMsHint": "自适应退避的上限, 防止等待过久。",
  "field.notify": "浏览器通知",
  "field.notifyHint": "自动继续成功/放弃/遇到永久性错误时弹出浏览器通知。",
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
  "field.classify": "Classify errors",
  "field.classifyHint": "Auto-resume transient failures only (network/timeout/5xx…); auth, balance and model errors are skipped and notified.",
  "field.backoffFactor": "Backoff factor",
  "field.backoffFactorHint": "Cooldown multiplier per consecutive failure (2 = 20s→40s→80s…).",
  "field.backoffMaxMs": "Max backoff (ms)",
  "field.backoffMaxMsHint": "Cap on the adaptive backoff interval.",
  "field.notify": "Browser notifications",
  "field.notifyHint": "Notify when auto-continue fires, gives up, or hits a permanent error.",
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
      booleanField("verbose"),
      booleanField("classify"),
      numberField("backoffFactor", 1),
      numberField("backoffMaxMs", 0),
      booleanField("notify")
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
      verbose: this.form.field("verbose"),
      classify: this.form.field("classify"),
      backoffFactor: this.form.field("backoffFactor"),
      backoffMaxMs: this.form.field("backoffMaxMs"),
      notify: this.form.field("notify")
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
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          BooleanField,
          {
            id: "auto-continue-classify",
            label: t("field.classify"),
            hint: t("field.classifyHint"),
            ...shared,
            ...state.classify,
            onEdit: (text) => props.edit("classify", text),
            onReset: () => props.resetField("classify")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          ValueField,
          {
            id: "auto-continue-backoff-factor",
            label: t("field.backoffFactor"),
            hint: t("field.backoffFactorHint"),
            numeric: true,
            ...shared,
            ...state.backoffFactor,
            onEdit: (text) => props.edit("backoffFactor", text),
            onReset: () => props.resetField("backoffFactor")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          ValueField,
          {
            id: "auto-continue-backoff-max",
            label: t("field.backoffMaxMs"),
            hint: t("field.backoffMaxMsHint"),
            numeric: true,
            ...shared,
            ...state.backoffMaxMs,
            onEdit: (text) => props.edit("backoffMaxMs", text),
            onReset: () => props.resetField("backoffMaxMs")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          BooleanField,
          {
            id: "auto-continue-notify",
            label: t("field.notify"),
            hint: t("field.notifyHint"),
            ...shared,
            ...state.notify,
            onEdit: (text) => props.edit("notify", text),
            onReset: () => props.resetField("notify")
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
//# sourceMappingURL=client.js.map
		return module.exports;
	}
});
