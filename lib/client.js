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
  fillTemplate: () => fillTemplate,
  inject: () => inject,
  pauseSession: () => pauseSession,
  pausedSessions: () => pausedSessions,
  readTodayStats: () => readTodayStats,
  resetTodayStats: () => resetTodayStats,
  sessionPauseUntil: () => sessionPauseUntil,
  unpauseSession: () => unpauseSession
});
module.exports = __toCommonJS(index_exports);

// src/client/engine.ts
var DEFAULT_CONFIG = {
  continueText: "继续",
  continueTextMaxTokens: "继续",
  guardTools: true,
  guardPendingText: "(上一步工具「{tool}」可能未完成, 先确认状态再继续, 不要重复执行)",
  guardDoneText: "(上一步工具「{tool}」已完成, 结果: {result}; 不要重复执行, 直接继续)",
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
  notify: false,
  paused: false,
  loopGuard: true,
  loopShortChars: 40,
  loopWindowMs: 3e4,
  loopShortCount: 12,
  loopRepeatText: 4,
  loopToolRepeat: 5,
  loopText: "(检测到你可能陷入循环, 请停止重复刚才的动作, 换一种方式继续)"
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
  const maxTokensText = typeof value.continueTextMaxTokens === "string" && value.continueTextMaxTokens.trim() !== "" ? value.continueTextMaxTokens : DEFAULT_CONFIG.continueTextMaxTokens;
  const guardPendingText = typeof value.guardPendingText === "string" && value.guardPendingText.trim() !== "" ? value.guardPendingText : DEFAULT_CONFIG.guardPendingText;
  const guardDoneText = typeof value.guardDoneText === "string" && value.guardDoneText.trim() !== "" ? value.guardDoneText : DEFAULT_CONFIG.guardDoneText;
  return {
    continueText: text,
    continueTextMaxTokens: maxTokensText,
    guardTools: booleanOr(value.guardTools, DEFAULT_CONFIG.guardTools),
    guardPendingText,
    guardDoneText,
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
    notify: booleanOr(value.notify, DEFAULT_CONFIG.notify),
    paused: booleanOr(value.paused, DEFAULT_CONFIG.paused),
    loopGuard: booleanOr(value.loopGuard, DEFAULT_CONFIG.loopGuard),
    loopShortChars: Math.max(1, numberOr(value.loopShortChars, DEFAULT_CONFIG.loopShortChars)),
    loopWindowMs: Math.max(1e3, numberOr(value.loopWindowMs, DEFAULT_CONFIG.loopWindowMs)),
    loopShortCount: Math.max(2, numberOr(value.loopShortCount, DEFAULT_CONFIG.loopShortCount)),
    loopRepeatText: Math.max(2, numberOr(value.loopRepeatText, DEFAULT_CONFIG.loopRepeatText)),
    loopToolRepeat: Math.max(2, numberOr(value.loopToolRepeat, DEFAULT_CONFIG.loopToolRepeat)),
    loopText: typeof value.loopText === "string" && value.loopText.trim() !== "" ? value.loopText : DEFAULT_CONFIG.loopText
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
function isTransientAgentError(message) {
  return /network|timeout|timed ?out|econn|etimedout|socket|5\d\d|\b429\b|upstream|temporar/i.test(message);
}
function notify(title, body, options) {
  try {
    const N = globalThis.Notification;
    if (typeof N === "undefined") return;
    const permission = N.permission;
    const create = () => {
      const instance = new N(title, {
        body,
        ...options?.actions !== void 0 && options.actions.length > 0 ? { actions: options.actions } : {}
      });
      const target = instance;
      target.onclick = () => {
        try {
          globalThis.focus?.();
        } catch {
        }
      };
      if (options?.onAction !== void 0) {
        target.onaction = (event) => options.onAction?.(event.action);
      }
    };
    if (permission === "granted") {
      create();
    } else if (permission === "default") {
      void N.requestPermission?.().then((result) => {
        if (result === "granted") create();
      }).catch(() => {
      });
    }
  } catch {
  }
}
function formatElapsed(ms) {
  if (ms === void 0 || !Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1e3) return `${Math.round(ms)}ms`;
  const s = Math.round(ms / 1e3);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${s % 60 > 0 ? `${s % 60}s` : ""}`;
}
function fillTemplate(template, ctx) {
  return template.replace(/\{code\}/g, ctx.facts?.code ?? "").replace(/\{message\}/g, ctx.facts?.message ?? "").replace(/\{status\}/g, ctx.facts?.status !== void 0 ? String(ctx.facts.status) : "").replace(/\{tool\}/g, ctx.tool ?? "").replace(/\{turn\}/g, ctx.turn !== void 0 ? String(ctx.turn) : "").replace(/\{errorCount\}/g, ctx.errorCount !== void 0 ? String(ctx.errorCount) : "").replace(/\{sessionTitle\}/g, ctx.sessionTitle ?? "").replace(/\{elapsed\}/g, formatElapsed(ctx.elapsedMs)).replace(/\{result\}/g, ctx.result ?? "");
}
var TOOL_RESULT_CAP = 160;
function extractText(blocks, cap) {
  let out = "";
  const walk = (value) => {
    if (out.length >= cap) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    const record = value;
    if (record["type"] === "text" && typeof record["text"] === "string") {
      out += record["text"];
      return;
    }
    for (const child of Object.values(record)) walk(child);
  };
  walk(blocks);
  return out.slice(0, cap);
}
function toolResultFacts(data) {
  const failed = data.error !== void 0 || data.message?.content?.[0]?.isError === true;
  return { ok: !failed, excerpt: extractText(data.message?.content?.[0]?.content, TOOL_RESULT_CAP) };
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
var pauseKey = (sessionId) => `${lockPrefix}pause:${sessionId}`;
function pauseSession(sessionId, ms) {
  try {
    localStorage.setItem(pauseKey(sessionId), String(Date.now() + ms));
  } catch {
  }
}
function unpauseSession(sessionId) {
  try {
    localStorage.removeItem(pauseKey(sessionId));
  } catch {
  }
}
function sessionPauseUntil(sessionId) {
  try {
    return Number(localStorage.getItem(pauseKey(sessionId)) ?? 0) || 0;
  } catch {
    return 0;
  }
}
function pausedSessions() {
  const out = [];
  const now = Date.now();
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key === null || !key.startsWith(`${lockPrefix}pause:`)) continue;
      const sessionId = key.slice(lockPrefix.length + "pause:".length);
      const until = Number(localStorage.getItem(key) ?? 0) || 0;
      if (until > now) out.push({ sessionId, until });
      else localStorage.removeItem(key);
    }
  } catch {
  }
  return out;
}
var statsKey = `${lockPrefix}stats`;
var STATS_MAX_DAYS = 90;
function todayKey() {
  const d = /* @__PURE__ */ new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function readStats() {
  try {
    const raw = localStorage.getItem(statsKey);
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) => typeof item === "object" && item !== null && typeof item.date === "string"
    );
  } catch {
    return [];
  }
}
function writeStats(list) {
  try {
    localStorage.setItem(statsKey, JSON.stringify(list));
  } catch {
  }
}
function bumpStat(delta) {
  const list = readStats();
  let day = list.find((item) => item.date === todayKey());
  if (day === void 0) {
    day = { date: todayKey(), sent: 0, skipped: 0, recovered: 0, failed: 0, gaveUp: 0, looped: 0, byCode: {} };
    list.unshift(day);
  }
  if (delta.sent !== void 0) day.sent += delta.sent;
  if (delta.skipped !== void 0) day.skipped += delta.skipped;
  if (delta.recovered !== void 0) day.recovered += delta.recovered;
  if (delta.failed !== void 0) day.failed += delta.failed;
  if (delta.gaveUp !== void 0) day.gaveUp += delta.gaveUp;
  if (delta.looped !== void 0) day.looped += delta.looped;
  if (delta.code !== void 0) day.byCode[delta.code] = (day.byCode[delta.code] ?? 0) + 1;
  writeStats(list.slice(0, STATS_MAX_DAYS));
}
function readTodayStats() {
  const today = todayKey();
  const found = readStats().find((item) => item.date === today);
  return found ?? { date: today, sent: 0, skipped: 0, recovered: 0, failed: 0, gaveUp: 0, looped: 0, byCode: {} };
}
function resetTodayStats() {
  writeStats(readStats().filter((item) => item.date !== todayKey()));
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
  lastFailureAt: 0,
  lastTool: void 0,
  lastToolResult: void 0,
  lastTurn: void 0,
  pendingRecoveryAt: 0,
  shortRun: 0,
  lastShortAt: 0,
  lastAssistantText: "",
  sameTextRun: 0,
  toolRun: void 0,
  loopFired: false,
  loopCancelled: false
});
var RECOVERY_WINDOW_MS = 10 * 60 * 1e3;
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
    /** 会话标题缓存(来自 session.list 投影, {sessionTitle} 占位符用)。 */
    this.titles = /* @__PURE__ */ new Map();
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
          if (typeof name === "string") {
            const state = this.state(frame.sessionId);
            state.lastTool = name;
            state.lastToolResult = "pending";
            state.shortRun = 0;
            const key = `${name}
${frame.event.data.arguments}`;
            if (state.toolRun?.key === key) {
              state.toolRun.waiting = true;
            } else {
              state.toolRun = { key, count: 1, lastResult: void 0, waiting: false };
            }
          }
        } else if (frame.event.type === "tool/result") {
          const state = this.state(frame.sessionId);
          if (state.lastToolResult === "pending") {
            const facts = toolResultFacts(frame.event.data);
            state.lastToolResult = facts;
            const run = state.toolRun;
            if (run !== void 0 && run.waiting) {
              run.waiting = false;
              if (run.lastResult !== void 0 && run.lastResult === facts.excerpt) {
                run.count += 1;
                this.checkLoop(frame.sessionId, state);
              } else {
                run.lastResult = facts.excerpt;
                run.count = 1;
              }
            } else if (run !== void 0 && !run.waiting) {
              run.lastResult = facts.excerpt;
            }
          }
        } else if (frame.event.type === "assistant/message") {
          const state = this.state(frame.sessionId);
          this.onAssistantMessage(frame.sessionId, state, frame.event);
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
  /** 从 assistant/message 事件提取纯文本。 */
  assistantText(event) {
    const content = event.data.message.content;
    if (!Array.isArray(content)) return "";
    return content.filter((part) => part.type === "text").map((part) => part.text).join("");
  }
  /**
   * loop guard 信号 1(空转): 时间窗内连续短句且期间无工具调用。
   * 短句 = 模型消息文本短于 loopShortChars; 长句、工具调用、或短句间隔超过
   * loopWindowMs(正常思考的短文本散布在长时间里)都会重置计数。
   */
  onAssistantMessage(sessionId, state, event) {
    if (!this.getConfig().loopGuard) return;
    const text = this.assistantText(event);
    const trimmed = text.trim();
    if (trimmed !== "" && trimmed === state.lastAssistantText) {
      state.sameTextRun += 1;
    } else {
      state.lastAssistantText = trimmed;
      state.sameTextRun = 1;
    }
    if (trimmed.length < this.getConfig().loopShortChars) {
      const now = Date.now();
      if (now - state.lastShortAt > this.getConfig().loopWindowMs) {
        state.shortRun = 0;
      }
      state.shortRun += 1;
      state.lastShortAt = now;
    } else {
      state.shortRun = 0;
      state.lastShortAt = 0;
    }
    this.checkLoop(sessionId, state);
  }
  /** 两个循环信号的公共检查; 命中且本回合未打断过则打断。 */
  checkLoop(sessionId, state) {
    if (!this.getConfig().loopGuard) return;
    if (state.loopFired) return;
    if (!state.running) return;
    const config = this.getConfig();
    if (state.sameTextRun >= config.loopRepeatText) {
      this.log(`检测到空转循环 ${sessionId}: 连续 ${state.sameTextRun} 条相同消息`);
      void this.interruptLoop(sessionId, state);
    } else if (state.shortRun >= config.loopShortCount) {
      this.log(`检测到空转循环 ${sessionId}: 连续 ${state.shortRun} 条短句且无工具调用`);
      void this.interruptLoop(sessionId, state);
    } else if (state.toolRun !== void 0 && state.toolRun.count >= config.loopToolRepeat) {
      const toolName = state.toolRun.key.split("\n")[0] ?? "?";
      this.log(`检测到工具死循环 ${sessionId}: 「${toolName}」连续 ${state.toolRun.count} 次(同参数同结果)`);
      void this.interruptLoop(sessionId, state);
    }
  }
  /**
   * 打断运行中的回合: cancel(带来源标记)+ 进冷却。
   * 随后的 turn/end aborted 会因 loopCancelled 走「可恢复中断」路径,
   * 用 loopText 重启回合——不会与用户手动停止混淆。
   */
  async interruptLoop(sessionId, state) {
    if (state.loopFired) return;
    if (Date.now() - state.lastAttemptAt < this.cooldownFor(state)) {
      this.log(`跳过循环打断 ${sessionId}: 处于冷却期`);
      return;
    }
    state.loopFired = true;
    state.loopCancelled = true;
    state.lastAttemptAt = Date.now();
    bumpStat({ looped: 1 });
    try {
      const response = await this.api.sessions.cancel({ sessionId });
      this.log(
        `已打断循环 ${sessionId}: ${response.result.ok ? "cancel 已受理" : "cancel 被拒绝"}`
      );
    } catch (error) {
      this.log(`打断循环失败 ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
      state.loopCancelled = false;
    }
  }
  onSessionEvent(sessionId, event) {
    const state = this.state(sessionId);
    switch (event.type) {
      case "turn/start":
        state.running = true;
        state.lastTool = void 0;
        state.lastToolResult = void 0;
        state.shortRun = 0;
        state.lastShortAt = 0;
        state.lastAssistantText = "";
        state.sameTextRun = 0;
        state.toolRun = void 0;
        state.loopFired = false;
        state.loopCancelled = false;
        this.cancelPending(sessionId, "宿主自行开启新回合");
        break;
      case "turn/end": {
        state.running = false;
        this.cancelPending(sessionId, "收到新的 turn/end");
        const reason = event.data.reason;
        if (reason.kind === "completed") {
          state.consecutive = 0;
          state.lastFailure = void 0;
          this.noteRecovery(sessionId, "completed");
        } else if (reason.kind === "aborted") {
          if (state.loopCancelled) {
            state.loopCancelled = false;
            state.loopFired = false;
            state.consecutive = 0;
            state.pendingRecoveryAt = 0;
            state.shortRun = 0;
            state.lastShortAt = 0;
            state.lastAssistantText = "";
            state.sameTextRun = 0;
            state.toolRun = void 0;
            state.lastAttemptAt = 0;
            this.schedule(sessionId, "loop:aborted");
          } else {
            state.consecutive = 0;
            state.pendingRecoveryAt = 0;
          }
        } else if (reason.kind === "blocked") {
        } else if (reason.kind === "interrupted") {
          state.consecutive = 0;
          state.pendingRecoveryAt = 0;
        } else if (reason.kind === "error") {
          const error = reason.error;
          state.lastFailure = {
            code: typeof error.code === "string" ? error.code : "UNKNOWN",
            message: typeof error.message === "string" ? error.message : String(error),
            ...typeof error.status === "number" ? { status: error.status } : {}
          };
          state.lastTurn = event.data.turn;
          state.lastFailureAt = Date.now();
          this.noteRecovery(sessionId, "error");
          this.onTurnFailure(sessionId, "turn/end:error", state.lastFailure);
        } else if (reason.kind === "max-tokens") {
          state.lastFailureAt = Date.now();
          this.noteRecovery(sessionId, "error");
          this.schedule(sessionId, "turn/end:max-tokens");
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
        if (!isTransientAgentError(frame.message)) {
          this.log(`跳过 ${frame.sessionId}: 永久性 agent 错误 — ${frame.message}`);
          bumpStat({ skipped: 1 });
          if (this.getConfig().notify) {
            notify(
              "dsh-auto-continue: 未自动继续",
              `${frame.sessionId}: 永久性 agent 错误 ${frame.message.slice(0, 120)}`,
              this.notifyOptions(frame.sessionId)
            );
          }
          break;
        }
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
      bumpStat({ skipped: 1, code: failure.code });
      if (config.notify) {
        notify(
          "dsh-auto-continue: 未自动继续",
          `${sessionId}: 永久性错误 ${summary}，需要人工处理`,
          this.notifyOptions(sessionId)
        );
      }
      return;
    }
    this.schedule(sessionId, reason);
  }
  /** 通知操作按钮与回调(「立即续跑」/「暂停该会话 1 小时」)。 */
  notifyOptions(sessionId) {
    return {
      actions: [
        { action: "resume", title: "立即续跑" },
        { action: "pause1h", title: "暂停该会话 1 小时" }
      ],
      onAction: (action) => this.onNotifyAction(sessionId, action)
    };
  }
  onNotifyAction(sessionId, action) {
    if (action === "resume") {
      this.log(`通知按钮: 立即续跑 ${sessionId}`);
      void this.resumeNow(sessionId);
    } else if (action === "pause1h") {
      this.log(`通知按钮: 暂停 ${sessionId} 1 小时`);
      pauseSession(sessionId, 60 * 60 * 1e3);
      this.cancelPending(sessionId, "通知按钮暂停该会话");
    }
  }
  /** 恢复结果记账: 自动发送后窗口内的回合结束, 判定恢复成功或失败。 */
  noteRecovery(sessionId, outcome) {
    const state = this.state(sessionId);
    if (state.pendingRecoveryAt === 0) return;
    if (Date.now() - state.pendingRecoveryAt > RECOVERY_WINDOW_MS) {
      state.pendingRecoveryAt = 0;
      return;
    }
    state.pendingRecoveryAt = 0;
    bumpStat(outcome === "completed" ? { recovered: 1 } : { failed: 1 });
    this.log(`恢复结果(${sessionId}): ${outcome === "completed" ? "成功" : "失败"}`);
  }
  /** 立即为该会话发送一次自动继续(无视冷却与连续上限; 由通知按钮触发)。 */
  async resumeNow(sessionId) {
    if (this.disposed) return;
    const state = this.state(sessionId);
    if (state.subagent) return;
    if (state.pendingTimer !== void 0) {
      clearTimeout(state.pendingTimer);
      state.pendingTimer = void 0;
    }
    await this.fire(sessionId, "manual:notification", true);
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
    if (config.paused) {
      this.log(`跳过 ${sessionId}(${reason}): 全局暂停中`);
      return;
    }
    if (Date.now() < sessionPauseUntil(sessionId)) {
      this.log(`跳过 ${sessionId}(${reason}): 会话暂停中`);
      return;
    }
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
    const template = reason.startsWith("loop:") ? config.loopText : reason.includes("max-tokens") ? config.continueTextMaxTokens : config.continueText;
    this.log(
      `检测到非人为中断 ${sessionId}(${reason}), ${config.graceMs}ms 后自动发送「${template}」`
    );
  }
  cancelPending(sessionId, why) {
    const state = this.state(sessionId);
    if (state.pendingTimer === void 0) return;
    clearTimeout(state.pendingTimer);
    state.pendingTimer = void 0;
    this.log(`取消 ${sessionId} 的自动继续(${why})`);
  }
  async fire(sessionId, reason, force = false) {
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
    if (!force && Date.now() - readLastSend(sessionId) < this.cooldownFor(state)) {
      this.log(`跳过 ${sessionId}: 其他标签页刚发送过`);
      return;
    }
    if (!claimSend(sessionId)) {
      this.log(`跳过 ${sessionId}: 其他标签页正在发送`);
      return;
    }
    const template = reason.startsWith("loop:") ? config.loopText : reason.includes("max-tokens") ? config.continueTextMaxTokens : config.continueText;
    let sessionTitle;
    if (template.includes("{sessionTitle}")) {
      sessionTitle = this.titles.get(sessionId);
      if (sessionTitle === void 0) {
        const info = await this.fetchSessionInfo(sessionId);
        sessionTitle = info?.title;
      }
    }
    const text = this.buildContinueText(config, state, template, sessionTitle);
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
        state.pendingRecoveryAt = now;
        writeLastSend(sessionId, now);
        bumpStat({ sent: 1, ...state.lastFailure !== void 0 ? { code: state.lastFailure.code } : {} });
        this.log(`已自动发送「${text}」到 ${sessionId}(${reason}), 第 ${state.consecutive} 次连续`);
        if (config.notify) {
          notify(
            "dsh-auto-continue: 已自动继续",
            `${sessionId}: 已发送「${text}」(第 ${state.consecutive} 次连续)`,
            this.notifyOptions(sessionId)
          );
        }
        if (state.consecutive >= config.maxConsecutive) {
          bumpStat({ gaveUp: 1 });
          this.log(`达到连续上限 ${config.maxConsecutive} 次, 停止自动继续 ${sessionId}`);
          if (config.notify) {
            notify(
              "dsh-auto-continue: 已停止自动继续",
              `${sessionId}: 连续失败 ${state.consecutive} 次, 需要人工介入`,
              this.notifyOptions(sessionId)
            );
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
  /**
   * 组装本次续跑消息: 模板填充 + 幂等护栏。
   * 护栏依据上一步工具调用的执行状态附加指引, 防止重跑副作用操作:
   * - 结果未确认(可能已部分执行)→ 提示先确认状态、不要重复执行
   * - 已确认成功 → 提示已完成、不要重复执行
   * - 已失败 → 不加护栏(重试工具本来就是目的)
   */
  buildContinueText(config, state, template, sessionTitle) {
    let text = fillTemplate(template, {
      facts: state.lastFailure,
      tool: state.lastTool,
      turn: state.lastTurn,
      errorCount: state.consecutive + 1,
      sessionTitle,
      elapsedMs: state.lastFailureAt > 0 ? Date.now() - state.lastFailureAt : void 0
    });
    if (!config.guardTools) return text;
    const guard = this.currentGuard(state);
    if (guard.kind === "pending") {
      text += ` ${fillTemplate(config.guardPendingText, { tool: guard.tool, result: guard.result })}`;
    } else if (guard.kind === "done") {
      text += ` ${fillTemplate(config.guardDoneText, { tool: guard.tool, result: guard.result })}`;
    }
    return text;
  }
  /** 上一步工具调用的护栏状态(实时路径, 由 mux 帧维护)。 */
  currentGuard(state) {
    if (state.lastTool === void 0 || state.lastToolResult === void 0) return { kind: "none" };
    if (state.lastToolResult === "pending") return { kind: "pending", tool: state.lastTool };
    if (state.lastToolResult.ok) {
      return { kind: "done", tool: state.lastTool, result: state.lastToolResult.excerpt };
    }
    return { kind: "failed", tool: state.lastTool };
  }
  /** 查一次 session.list, 顺带缓存该会话的标题。 */
  async fetchSessionInfo(sessionId) {
    try {
      const response = await this.api.sessions.list({});
      if (!response.result.ok) return void 0;
      const item = response.result.value.items.find(
        (summary) => summary.sessionId === sessionId
      );
      if (item === void 0) return void 0;
      const title = item.projections?.values?.title;
      if (typeof title === "string" && title !== "") this.titles.set(sessionId, title);
      return { running: item.running, title: typeof title === "string" ? title : void 0 };
    } catch {
      return void 0;
    }
  }
  async runningViaList(sessionId) {
    const info = await this.fetchSessionInfo(sessionId);
    return info?.running;
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
    if (config.paused) return true;
    const response = await this.api.sessions.list({});
    if (!response.result.ok) return false;
    const items = response.result.value.items;
    for (const summary of items) {
      const title = summary.projections?.values?.title;
      if (typeof title === "string" && title !== "") this.titles.set(summary.sessionId, title);
    }
    const candidates = items.filter((summary) => !summary.running && summary.parentSessionId === void 0).slice(0, config.scanLimit);
    const now = Date.now();
    for (const summary of candidates) {
      if (this.disposed) return true;
      const state = this.state(summary.sessionId);
      if (state.pendingTimer !== void 0) continue;
      if (state.consecutive >= config.maxConsecutive) continue;
      if (now - state.lastAttemptAt < this.cooldownFor(state)) continue;
      if (now < sessionPauseUntil(summary.sessionId)) continue;
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
      this.applyGuardFromEvents(state, events, lastEnd.seq);
      this.log(`扫描发现中断 ${summary.sessionId}(turn/end:${reason.kind}), 安排自动继续`);
      this.schedule(summary.sessionId, `scan:turn/end:${reason.kind}`);
    }
    return true;
  }
  /** 从历史事件恢复上一步工具调用状态(扫描路径的幂等护栏)。 */
  applyGuardFromEvents(state, events, untilSeq) {
    state.lastTool = void 0;
    state.lastToolResult = void 0;
    let call;
    for (const entry of events) {
      const event = entry.event;
      if (event.seq >= untilSeq) continue;
      if (event.type === "tool/call") call = event;
    }
    if (call === void 0) return;
    state.lastTool = call.data.name;
    state.lastToolResult = "pending";
    for (const entry of events) {
      const event = entry.event;
      if (event.seq <= call.seq || event.seq >= untilSeq) continue;
      if (event.type === "tool/result") {
        state.lastToolResult = toolResultFacts(event.data);
        break;
      }
    }
  }
};

// src/client/locales.ts
var zh = {
  "card.title": "自动继续",
  "card.description": "请求因网络等原因(非人为)中断后, 自动发送「继续」续跑。",
  "field.paused": "暂停自动继续",
  "field.pausedHint": "全局暂停: 实时与扫描都不会再自动发送, 已排队的待发送也会取消。",
  "field.continueText": "继续文本",
  "field.continueTextHint": "中断后自动发送的消息内容。",
  "field.continueTextMaxTokens": "超限时的继续文本",
  "field.continueTextMaxTokensHint": "达到输出 token 上限时自动发送的文本, 支持与继续文本相同的占位符。",
  "field.guardTools": "幂等护栏",
  "field.guardToolsHint": "续跑前检查上一步工具调用: 结果未确认时提示先确认状态, 已成功时提示不要重复执行, 避免重复 commit/调 API。",
  "field.guardPendingText": "结果未确认时的护栏文本",
  "field.guardPendingTextHint": "上一步工具可能已部分执行时附加到继续文本之后, 支持 {tool} 占位符。",
  "field.guardDoneText": "工具已成功时的护栏文本",
  "field.guardDoneTextHint": "上一步工具已确认成功时附加到继续文本之后, 支持 {tool} 与 {result}(结果摘要)占位符。",
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
  "field.notifyHint": "自动继续成功/放弃/遇到永久性错误时弹出浏览器通知, 通知带「立即续跑」与「暂停该会话 1 小时」按钮。",
  "stats.title": "今日统计",
  "stats.sent": "自动继续",
  "stats.skipped": "跳过(永久错误)",
  "stats.recovered": "恢复成功",
  "stats.failed": "继续后仍失败",
  "stats.gaveUp": "停止(达上限)",
  "stats.looped": "循环打断",
  "field.loopGuard": "循环守卫",
  "field.loopGuardHint": "检测运行中的回合空转: 连续短句且无工具调用, 或连续调用相同工具时, 自动取消并用循环提示文本重启回合。",
  "field.loopShortChars": "短句长度上限 (字符)",
  "field.loopShortCharsHint": "模型消息文本短于该值计为一条短句(空转信号)。",
  "field.loopWindowMs": "短句时间窗 (ms)",
  "field.loopWindowMsHint": "连续短句必须落在这个时间窗内; 正常思考的短文本散布在长时间里不会被误判。",
  "field.loopShortCount": "连续短句阈值",
  "field.loopShortCountHint": "时间窗内连续多少条短句且期间无工具调用时判定空转循环。",
  "field.loopRepeatText": "相同消息重复次数",
  "field.loopRepeatTextHint": "连续输出多少条完全相同的消息时判定空转(最强信号, 不限长度, 如模型反复说同一句话)。",
  "field.loopToolRepeat": "同工具重复次数",
  "field.loopToolRepeatHint": "同工具+同参数+同结果的连续调用多少次时判定死循环; 参数或结果有变化视为有进展。",
  "field.loopText": "循环提示文本",
  "field.loopTextHint": "打断后重启回合时发送的文本, 支持 {tool} 占位符。",
  "stats.byCode": "按错误码统计",
  "stats.empty": "今天还没有自动继续记录。",
  "stats.reset": "清零",
  "pause.title": "已暂停会话",
  "pause.none": "没有暂停中的会话。",
  "pause.clearAll": "全部解除",
  "pause.unpause": "解除",
  "pause.minutes": "分钟",
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
  "field.paused": "Pause auto-continue",
  "field.pausedHint": "Globally pause: no live or scan auto-send fires, and queued pending sends are cancelled.",
  "field.continueText": "Continue text",
  "field.continueTextHint": "Message automatically sent after an interruption.",
  "field.continueTextMaxTokens": "Continue text (max tokens)",
  "field.continueTextMaxTokensHint": "Text sent when the output token ceiling is reached; same placeholders as the continue text.",
  "field.guardTools": "Idempotency guard",
  "field.guardToolsHint": "Before resuming, inspect the last tool call: if its result is unconfirmed, tell the model to check state first; if it succeeded, tell it not to rerun — avoids duplicate commits / API calls.",
  "field.guardPendingText": "Guard text (unconfirmed result)",
  "field.guardPendingTextHint": "Appended when the last tool may have partially executed; supports the {tool} placeholder.",
  "field.guardDoneText": "Guard text (tool succeeded)",
  "field.guardDoneTextHint": "Appended when the last tool is confirmed done; supports {tool} and {result} (result excerpt).",
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
  "field.notifyHint": 'Notify when auto-continue fires, gives up, or hits a permanent error; notifications carry "Resume now" and "Pause this session 1h" buttons.',
  "stats.title": "Today's stats",
  "stats.sent": "Auto-continued",
  "stats.skipped": "Skipped (permanent)",
  "stats.recovered": "Recovered",
  "stats.failed": "Failed after",
  "stats.gaveUp": "Gave up (cap)",
  "stats.looped": "Loops broken",
  "field.loopGuard": "Loop guard",
  "field.loopGuardHint": "Detects a running turn spinning in place — many short sentences with no tool calls, or the same tool repeating — cancels it and restarts with the loop text.",
  "field.loopShortChars": "Short-sentence max (chars)",
  "field.loopShortCharsHint": "A model message shorter than this counts as a short sentence (spinning signal).",
  "field.loopWindowMs": "Short-sentence window (ms)",
  "field.loopWindowMsHint": "Consecutive short sentences must land inside this window; normal thinking spread over time is not misjudged.",
  "field.loopShortCount": "Short-sentence threshold",
  "field.loopShortCountHint": "How many consecutive short sentences inside the window, with no tool call, trip the loop guard.",
  "field.loopRepeatText": "Identical message count",
  "field.loopRepeatTextHint": "How many consecutive identical messages trip the guard (strongest signal, any length, e.g. the model repeating the same line).",
  "field.loopToolRepeat": "Same-tool repeat count",
  "field.loopToolRepeatHint": "How many consecutive calls of the same tool with identical arguments and results trip the loop guard; a changed argument or result counts as progress.",
  "field.loopText": "Loop text",
  "field.loopTextHint": "Text sent after the loop guard restarts a turn; supports the {tool} placeholder.",
  "stats.byCode": "By error code",
  "stats.empty": "No auto-continue activity today.",
  "stats.reset": "Reset",
  "pause.title": "Paused sessions",
  "pause.none": "No sessions paused.",
  "pause.clearAll": "Clear all",
  "pause.unpause": "Resume",
  "pause.minutes": "min",
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
.dshAcPanel { border-top: 1px solid var(--dsw-alias-border-l2); flex-direction: column; gap: 8px; padding: 12px 0; display: flex; }
.dshAcPanelHead { align-items: center; gap: 8px; display: flex; }
.dshAcPanelTitle { color: var(--dsw-alias-label-primary); flex: 1; font-size: 13px; font-weight: 600; line-height: 1.5; }
.dshAcStats { gap: 4px 16px; margin: 0; grid-template-columns: repeat(2, minmax(0, 1fr)); display: grid; }
.dshAcStats > div { justify-content: space-between; gap: 8px; display: flex; }
.dshAcStats dt { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.5; }
.dshAcStats dd { color: var(--dsw-alias-label-primary); margin: 0; font-size: 12px; font-weight: 600; line-height: 1.5; }
.dshAcCodes { flex-wrap: wrap; align-items: center; gap: 6px; display: flex; }
.dshAcCode {
  white-space: nowrap;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 500;
  line-height: 17px;
}
.dshAcPauseList { flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; display: flex; }
.dshAcPauseList li { align-items: center; gap: 8px; display: flex; }
.dshAcPauseId {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 1.5;
}
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
      booleanField("paused"),
      textField("continueText"),
      textField("continueTextMaxTokens"),
      booleanField("guardTools"),
      textField("guardPendingText"),
      textField("guardDoneText"),
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
      booleanField("notify"),
      booleanField("loopGuard"),
      numberField("loopShortChars", 1),
      numberField("loopWindowMs", 1e3),
      numberField("loopShortCount", 2),
      numberField("loopRepeatText", 2),
      numberField("loopToolRepeat", 2),
      textField("loopText")
    ]);
    this.store = this.form.bind(() => this.projection(), import_client.createSnapshotStore);
  }
  projection() {
    return {
      ...this.form.shell(),
      paused: this.form.field("paused"),
      continueText: this.form.field("continueText"),
      continueTextMaxTokens: this.form.field("continueTextMaxTokens"),
      guardTools: this.form.field("guardTools"),
      guardPendingText: this.form.field("guardPendingText"),
      guardDoneText: this.form.field("guardDoneText"),
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
      notify: this.form.field("notify"),
      loopGuard: this.form.field("loopGuard"),
      loopShortChars: this.form.field("loopShortChars"),
      loopWindowMs: this.form.field("loopWindowMs"),
      loopShortCount: this.form.field("loopShortCount"),
      loopRepeatText: this.form.field("loopRepeatText"),
      loopToolRepeat: this.form.field("loopToolRepeat"),
      loopText: this.form.field("loopText")
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
function LivePanels(props) {
  const { t } = props;
  const [, refresh] = (0, import_react.useState)(0);
  (0, import_react.useEffect)(() => {
    const timer = setInterval(() => refresh((value) => value + 1), 5e3);
    return () => clearInterval(timer);
  }, []);
  const stats = readTodayStats();
  const hasStats = stats.sent + stats.skipped + stats.recovered + stats.failed + stats.gaveUp + stats.looped > 0;
  const codes = Object.entries(stats.byCode).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const paused = pausedSessions();
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "dshAcPanel", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshAcPanelHead", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshAcPanelTitle", children: t("stats.title") }),
        hasStats ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "dshAcReset",
            onClick: () => {
              resetTodayStats();
              refresh((value) => value + 1);
            },
            children: t("stats.reset")
          }
        ) : null
      ] }),
      !hasStats ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dshAcHint", children: t("stats.empty") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", { className: "dshAcStats", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: t("stats.sent") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: stats.sent })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: t("stats.recovered") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: stats.recovered })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: t("stats.failed") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: stats.failed })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: t("stats.skipped") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: stats.skipped })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: t("stats.gaveUp") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: stats.gaveUp })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: t("stats.looped") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: stats.looped })
          ] })
        ] }),
        codes.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshAcCodes", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dshAcHint", children: [
            t("stats.byCode"),
            ":"
          ] }),
          codes.map(([code, count]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dshAcCode", children: [
            code,
            " ×",
            count
          ] }, code))
        ] }) : null
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "dshAcPanel", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshAcPanelHead", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshAcPanelTitle", children: t("pause.title") }),
        paused.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "dshAcReset",
            onClick: () => {
              for (const item of paused) unpauseSession(item.sessionId);
              refresh((value) => value + 1);
            },
            children: t("pause.clearAll")
          }
        ) : null
      ] }),
      paused.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dshAcHint", children: t("pause.none") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: "dshAcPauseList", children: paused.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dshAcPauseId", children: [
          item.sessionId.slice(0, 8),
          "…"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dshAcHint", children: [
          Math.max(1, Math.ceil((item.until - Date.now()) / 6e4)),
          " ",
          t("pause.minutes")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "dshAcReset",
            onClick: () => {
              unpauseSession(item.sessionId);
              refresh((value) => value + 1);
            },
            children: t("pause.unpause")
          }
        )
      ] }, item.sessionId)) })
    ] })
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
          BooleanField,
          {
            id: "auto-continue-paused",
            label: t("field.paused"),
            hint: t("field.pausedHint"),
            ...shared,
            ...state.paused,
            onEdit: (text) => props.edit("paused", text),
            onReset: () => props.resetField("paused")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          ValueField,
          {
            id: "auto-continue-continue-text",
            label: t("field.continueText"),
            hint: t("field.continueTextHint"),
            ...shared,
            ...state.continueText,
            onEdit: (text) => props.edit("continueText", text),
            placeholder: DEFAULT_CONFIG.continueText,
            onReset: () => props.resetField("continueText")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          ValueField,
          {
            id: "auto-continue-continue-text-max-tokens",
            label: t("field.continueTextMaxTokens"),
            hint: t("field.continueTextMaxTokensHint"),
            ...shared,
            ...state.continueTextMaxTokens,
            onEdit: (text) => props.edit("continueTextMaxTokens", text),
            placeholder: DEFAULT_CONFIG.continueTextMaxTokens,
            onReset: () => props.resetField("continueTextMaxTokens")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          BooleanField,
          {
            id: "auto-continue-guard-tools",
            label: t("field.guardTools"),
            hint: t("field.guardToolsHint"),
            ...shared,
            ...state.guardTools,
            onEdit: (text) => props.edit("guardTools", text),
            onReset: () => props.resetField("guardTools")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          ValueField,
          {
            id: "auto-continue-guard-pending-text",
            label: t("field.guardPendingText"),
            hint: t("field.guardPendingTextHint"),
            ...shared,
            ...state.guardPendingText,
            onEdit: (text) => props.edit("guardPendingText", text),
            placeholder: DEFAULT_CONFIG.guardPendingText,
            onReset: () => props.resetField("guardPendingText")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          ValueField,
          {
            id: "auto-continue-guard-done-text",
            label: t("field.guardDoneText"),
            hint: t("field.guardDoneTextHint"),
            ...shared,
            ...state.guardDoneText,
            onEdit: (text) => props.edit("guardDoneText", text),
            placeholder: DEFAULT_CONFIG.guardDoneText,
            onReset: () => props.resetField("guardDoneText")
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
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          BooleanField,
          {
            id: "auto-continue-loop-guard",
            label: t("field.loopGuard"),
            hint: t("field.loopGuardHint"),
            ...shared,
            ...state.loopGuard,
            onEdit: (text) => props.edit("loopGuard", text),
            onReset: () => props.resetField("loopGuard")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          ValueField,
          {
            id: "auto-continue-loop-short-chars",
            label: t("field.loopShortChars"),
            hint: t("field.loopShortCharsHint"),
            numeric: true,
            ...shared,
            ...state.loopShortChars,
            onEdit: (text) => props.edit("loopShortChars", text),
            onReset: () => props.resetField("loopShortChars")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          ValueField,
          {
            id: "auto-continue-loop-window-ms",
            label: t("field.loopWindowMs"),
            hint: t("field.loopWindowMsHint"),
            numeric: true,
            ...shared,
            ...state.loopWindowMs,
            onEdit: (text) => props.edit("loopWindowMs", text),
            onReset: () => props.resetField("loopWindowMs")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          ValueField,
          {
            id: "auto-continue-loop-short-count",
            label: t("field.loopShortCount"),
            hint: t("field.loopShortCountHint"),
            numeric: true,
            ...shared,
            ...state.loopShortCount,
            onEdit: (text) => props.edit("loopShortCount", text),
            onReset: () => props.resetField("loopShortCount")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          ValueField,
          {
            id: "auto-continue-loop-tool-repeat",
            label: t("field.loopToolRepeat"),
            hint: t("field.loopToolRepeatHint"),
            numeric: true,
            ...shared,
            ...state.loopToolRepeat,
            onEdit: (text) => props.edit("loopToolRepeat", text),
            onReset: () => props.resetField("loopToolRepeat")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          ValueField,
          {
            id: "auto-continue-loop-repeat-text",
            label: t("field.loopRepeatText"),
            hint: t("field.loopRepeatTextHint"),
            numeric: true,
            ...shared,
            ...state.loopRepeatText,
            onEdit: (text) => props.edit("loopRepeatText", text),
            onReset: () => props.resetField("loopRepeatText")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          ValueField,
          {
            id: "auto-continue-loop-text",
            label: t("field.loopText"),
            hint: t("field.loopTextHint"),
            ...shared,
            ...state.loopText,
            onEdit: (text) => props.edit("loopText", text),
            placeholder: DEFAULT_CONFIG.loopText,
            onReset: () => props.resetField("loopText")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LivePanels, { t })
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
        key: SETTINGS_NS,
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
