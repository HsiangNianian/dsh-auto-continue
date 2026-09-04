// src/index.ts
import z2 from "@deepseek-ai/schemastery";

// node_modules/@deepseek-ai/dsh-llm/lib/index.js
import { createRequire } from "node:module";
import { Service } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";

// node_modules/@deepseek-ai/dsh-timeout/lib/index.js
var MAX_TIMER_DELAY_MS = 2147483647;

// node_modules/@deepseek-ai/dsh-llm/lib/index.js
function MessageId(id) {
  return id;
}
function deepFreeze(value) {
  const seen = /* @__PURE__ */ new WeakSet();
  const pending = [{
    kind: "visit",
    node: value
  }];
  while (pending.length > 0) {
    const task = pending.pop();
    if (task === void 0) continue;
    if (task.kind === "property") {
      pending.push({
        kind: "visit",
        node: task.source[task.key]
      });
      continue;
    }
    const node = task.node;
    if (node === null || typeof node !== "object") continue;
    if (node instanceof AbortSignal) continue;
    if (seen.has(node)) continue;
    seen.add(node);
    Object.freeze(node);
    const keys = Object.keys(node);
    for (let index = keys.length - 1; index >= 0; index--) {
      const key = keys[index];
      if (key === void 0) continue;
      pending.push({
        kind: "property",
        source: node,
        key
      });
    }
  }
  return value;
}
function freezeMessage(message) {
  return deepFreeze(structuredClone(message));
}
function createMessage(input) {
  return freezeMessage({
    ...input,
    id: MessageId(crypto.randomUUID())
  });
}
function createUserMessage(input) {
  return createMessage({
    ...input,
    role: "user"
  });
}
var EMPTY_RESPONSE_CODE = "EMPTY_RESPONSE";
var STRUCTURED_CONTEXT_OVERFLOW = new RegExp(String.raw`(?:^|[^a-z0-9])context[\s_-](?:length|window)[\s_-]` + String.raw`(?:exceed(?:ed|s)?|overflow(?:ed)?|limit[\s_-]exceeded)(?:$|[^a-z0-9])`, "i");
var TOO_LARGE_FOR_CONTEXT = new RegExp(String.raw`\b(?:request|prompt|input|messages?)\s+(?:is\s+|are\s+)?` + String.raw`too\s+(?:large|long)\s+for\s+(?:(?:this|the)\s+)?` + String.raw`(?:model(?:'s)?\s+)?context(?:\s+window)?\b`, "i");
var EXCEEDS_MODEL_CONTEXT = new RegExp(String.raw`\b(?:input|prompt|request|messages?)\b.{0,40}` + String.raw`\b(?:exceed(?:s|ed)?|overflows?|is\s+larger\s+than)\b.{0,40}` + String.raw`\b(?:the\s+)?(?:model(?:'s)?\s+)?context(?:\s+(?:length|window))?\b`, "i");
var DEFAULT_MAX_RETRIES = 2;
var DEFAULT_INITIAL_DELAY_MS = 500;
var DEFAULT_MAX_DELAY_MS = 1e4;
var DEFAULT_JITTER_RATIO = 0.1;
var DEFAULT_RETRYABLE_CODES = Object.freeze([
  EMPTY_RESPONSE_CODE,
  "RATE_LIMIT",
  "SERVER",
  "TIMEOUT",
  "TRANSPORT"
]);
var backoffSchema = z.object({
  initialDelayMs: z.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_INITIAL_DELAY_MS),
  maxDelayMs: z.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_MAX_DELAY_MS),
  jitterRatio: z.number().min(0).max(1).default(DEFAULT_JITTER_RATIO)
});
var normalPolicySchema = z.object({
  mode: z.const("normal").required(),
  maxRetries: z.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_MAX_RETRIES),
  retryableCodes: z.array(z.string()).default([...DEFAULT_RETRYABLE_CODES]),
  backoff: backoffSchema
});
var alwaysPolicySchema = z.object({
  mode: z.const("always").required(),
  backoff: backoffSchema
});
var RetryPolicySchema = z.union([normalPolicySchema, alwaysPolicySchema]);
var { version } = createRequire(import.meta.url)("../package.json");

// src/shared/core.ts
var LOCALIZED_TEXT_DEFAULTS = {
  zh: {
    continueText: "继续",
    continueTextMaxTokens: "继续",
    guardPendingText: "(上一步工具「{tool}」可能未完成, 先确认状态再继续, 不要重复执行)",
    guardDoneText: "(上一步工具「{tool}」已完成, 结果: {result}; 不要重复执行, 直接继续)",
    loopText: "(检测到你可能陷入循环, 请停止重复刚才的动作, 换一种方式继续)"
  },
  en: {
    continueText: "Continue",
    continueTextMaxTokens: "Continue",
    guardPendingText: '(The previous tool "{tool}" may not have completed. Check its state before continuing and do not run it again.)',
    guardDoneText: '(The previous tool "{tool}" completed successfully. Result: {result}; do not run it again. Continue from there.)',
    loopText: "(You may be stuck in a loop. Stop repeating the last action and continue with a different approach.)"
  }
};
var DEFAULT_CONFIG = {
  locale: "zh",
  ...LOCALIZED_TEXT_DEFAULTS.zh,
  guardTools: true,
  graceMs: 3e3,
  cooldownMs: 2e4,
  maxConsecutive: 3,
  scanOnBoot: true,
  scanLimit: 8,
  freshMs: 15 * 60 * 1e3,
  verbose: true,
  classify: true,
  retryableErrorPatterns: "",
  backoffFactor: 2,
  backoffMaxMs: 3e5,
  notify: false,
  paused: false,
  loopGuard: true,
  loopShortChars: 40,
  loopWindowMs: 3e4,
  loopShortCount: 12,
  loopRepeatText: 4,
  loopToolRepeat: 5
};
function numberOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}
function booleanOr(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}
function resolveConfig(section) {
  const value = section ?? {};
  const locale = value.locale === "en" ? "en" : "zh";
  const localized = LOCALIZED_TEXT_DEFAULTS[locale];
  const text = typeof value.continueText === "string" && value.continueText.trim() !== "" ? value.continueText : localized.continueText;
  const maxTokensText = typeof value.continueTextMaxTokens === "string" && value.continueTextMaxTokens.trim() !== "" ? value.continueTextMaxTokens : localized.continueTextMaxTokens;
  const guardPendingText = typeof value.guardPendingText === "string" && value.guardPendingText.trim() !== "" ? value.guardPendingText : localized.guardPendingText;
  const guardDoneText = typeof value.guardDoneText === "string" && value.guardDoneText.trim() !== "" ? value.guardDoneText : localized.guardDoneText;
  return {
    locale,
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
    verbose: booleanOr(value.verbose, DEFAULT_CONFIG.verbose),
    classify: booleanOr(value.classify, DEFAULT_CONFIG.classify),
    retryableErrorPatterns: typeof value.retryableErrorPatterns === "string" ? value.retryableErrorPatterns.trim() : DEFAULT_CONFIG.retryableErrorPatterns,
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
    loopText: typeof value.loopText === "string" && value.loopText.trim() !== "" ? value.loopText : localized.loopText
  };
}
function isNonHumanReason(kind) {
  return kind === "error" || kind === "interrupted" || kind === "max-tokens";
}
function isTransientFailure(failure, retryableErrorPatterns = "") {
  const haystack = `${failure.code} ${failure.status ?? ""} ${failure.message}`.toLowerCase();
  const explicitlyRetryable = retryableErrorPatterns.split(/\r?\n/).map((pattern) => pattern.trim().toLowerCase()).filter((pattern) => pattern !== "").some((pattern) => haystack.includes(pattern));
  if (explicitlyRetryable) return true;
  const status = failure.status;
  if (status !== void 0 && (status === 401 || status === 403)) return false;
  const permanent = /auth|unauthor|forbidden|credential|api[_-]?key|permission/i.test(haystack) || /insufficient.*(balance|quota)|billing|payment|quota.*exceeded.*(?!retry)/i.test(haystack) || /model.*not[_-]?found|unknown[_-]?model|model[_-]?not[_-]?found|not.*support.*model/i.test(haystack) || /context.*(length|limit|overflow|exceed)|token.*limit|max.*context/i.test(haystack) || /invalid[_-]?request|bad[_-]?request/i.test(haystack);
  return !permanent;
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
function todayKey() {
  const d = /* @__PURE__ */ new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function emptyDayStats() {
  return { date: todayKey(), sent: 0, skipped: 0, recovered: 0, failed: 0, gaveUp: 0, looped: 0, byCode: {} };
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
  loopCancelled: false,
  loopRetryTimer: void 0
});
var RECOVERY_WINDOW_MS = 10 * 60 * 1e3;
var ECHO_WINDOW_MS = 10 * 60 * 1e3;
function isOurEcho(state, event) {
  if (event.type !== "user/message") return false;
  const message = event.data;
  if (message.source.kind !== "user") return false;
  if (state.lastSentText === "") return false;
  if (Date.now() - state.lastAutoAt > ECHO_WINDOW_MS) return false;
  const text = message.content.filter((part) => part.type === "text").map((part) => part.text).join("");
  return text === state.lastSentText;
}

// src/host/engine.ts
var NOTICE_COPY = {
  zh: {
    notContinuedTitle: "dsh-auto-continue: 未自动继续",
    permanentErrorBody: (sessionId, summary) => `${sessionId}: 永久性错误 ${summary}，需要人工处理`,
    resumeAction: "立即续跑",
    pauseAction: "暂停该会话 1 小时",
    continuedTitle: "dsh-auto-continue: 已自动继续",
    continuedBody: (sessionId, text, count) => `${sessionId}: 已发送「${text}」(第 ${count} 次连续)`,
    stoppedTitle: "dsh-auto-continue: 已停止自动继续",
    stoppedBody: (sessionId, count) => `${sessionId}: 连续失败 ${count} 次, 需要人工介入`
  },
  en: {
    notContinuedTitle: "dsh-auto-continue: Not continued",
    permanentErrorBody: (sessionId, summary) => `${sessionId}: Permanent error ${summary}; manual intervention required`,
    resumeAction: "Resume now",
    pauseAction: "Pause this session for 1 hour",
    continuedTitle: "dsh-auto-continue: Continued automatically",
    continuedBody: (sessionId, text, count) => `${sessionId}: Sent "${text}" (consecutive attempt ${count})`,
    stoppedTitle: "dsh-auto-continue: Auto-continue stopped",
    stoppedBody: (sessionId, count) => `${sessionId}: ${count} consecutive failures; manual intervention required`
  }
};
var AutoContinueRunner = class {
  /**
   * @param ctx - host plugin context (agents registry, session events, settings).
   * @param getConfig - read the current resolved configuration (settings service).
   */
  constructor(ctx, getConfig) {
    this.ctx = ctx;
    this.getConfig = getConfig;
    this.states = /* @__PURE__ */ new Map();
    this.pauseUntil = /* @__PURE__ */ new Map();
    this.dayStats = emptyDayStats();
    this.notices = [];
    this.noticeListeners = /* @__PURE__ */ new Set();
    this.stateListeners = /* @__PURE__ */ new Set();
    this.disposed = false;
    this.disposeSessionEvents = ctx.on("session/event", (session, event) => {
      try {
        this.onHostEvent(session, event);
      } catch (error) {
        console.error(
          `[auto-continue] 会话事件处理异常 ${session.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
    const config = this.getConfig();
    if (config.scanOnBoot) {
      void this.bootScanLoop();
    }
    this.log(
      `已启动(host 单实例, 文本="${config.continueText}", 宽限 ${config.graceMs}ms, 冷却 ${config.cooldownMs}ms, 最多连续 ${config.maxConsecutive} 次)`
    );
  }
  log(message) {
    if (this.getConfig().verbose) console.info(`[auto-continue] ${message}`);
  }
  /** 对外(状态桥): 今日统计快照。 */
  todayStats() {
    const today = todayKey();
    if (this.dayStats.date !== today) this.dayStats = emptyDayStats();
    return { ...this.dayStats, byCode: { ...this.dayStats.byCode } };
  }
  /** 对外(状态桥): 当前生效的会话级暂停列表。 */
  activePauses() {
    const now = Date.now();
    const out = [];
    for (const [sessionId, until] of this.pauseUntil) {
      if (until > now) out.push({ sessionId, until });
    }
    return out;
  }
  /** 对外(状态桥): 订阅通知事件(SSE 端点推送)。 */
  subscribeNotices(listener) {
    this.noticeListeners.add(listener);
    return () => {
      this.noticeListeners.delete(listener);
    };
  }
  /** 对外(状态桥): 订阅运行时状态变化(统计/暂停列表)。 */
  subscribeState(listener) {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }
  emitState() {
    for (const listener of this.stateListeners) listener();
  }
  /** 对外(状态桥): 消费待展示的通知。 */
  drainNotices() {
    return this.notices.splice(0, this.notices.length);
  }
  /** 通知动作(browser 通知按钮回传): 立即续跑 / 暂停该会话 / 解除暂停 / 清零统计。 */
  handleNoticeAction(sessionId, action) {
    if (action === "unpause") {
      if (sessionId !== void 0) this.pauseUntil.delete(sessionId);
      this.log(`解除暂停 ${sessionId ?? "?"}`);
    } else if (action === "reset-stats") {
      this.dayStats = emptyDayStats();
      this.log("清零今日统计");
    } else if (sessionId !== void 0) {
      this.onNotifyAction(sessionId, action);
    }
    this.emitState();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeSessionEvents();
    for (const state of this.states.values()) {
      if (state.pendingTimer !== void 0) clearTimeout(state.pendingTimer);
      if (state.loopRetryTimer !== void 0) clearTimeout(state.loopRetryTimer);
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
  /**
   * 事件入口(host 单实例): 预处理工具调用/结果/模型消息(护栏与循环信号),
   * 然后交给回合状态机。
   */
  onHostEvent(session, event) {
    const sessionId = session.id;
    if (event.type === "tool/call") {
      const name = event.data.name;
      if (typeof name === "string") {
        const state = this.state(sessionId);
        state.lastTool = name;
        state.lastToolResult = "pending";
        state.shortRun = 0;
        const key = `${name}
${event.data.arguments}`;
        if (state.toolRun?.key === key) {
          state.toolRun.waiting = true;
        } else {
          state.toolRun = { key, count: 1, lastResult: void 0, waiting: false };
        }
      }
    } else if (event.type === "tool/result") {
      const state = this.state(sessionId);
      if (state.lastToolResult === "pending") {
        const facts = toolResultFacts(event.data);
        state.lastToolResult = facts;
        const run = state.toolRun;
        if (run !== void 0 && run.waiting) {
          run.waiting = false;
          if (run.lastResult !== void 0 && run.lastResult === facts.excerpt) {
            run.count += 1;
            this.checkLoop(sessionId, state);
          } else {
            run.lastResult = facts.excerpt;
            run.count = 1;
          }
        } else if (run !== void 0 && !run.waiting) {
          run.lastResult = facts.excerpt;
        }
      }
    } else if (event.type === "assistant/message") {
      const state = this.state(sessionId);
      this.onAssistantMessage(sessionId, state, event);
    }
    this.onSessionEvent(sessionId, event);
  }
  /** 从 assistant/message 事件提取纯文本。 */
  assistantText(event) {
    const content = event.data.message.content;
    if (!Array.isArray(content)) return "";
    return content.filter((part) => part.type === "text").map((part) => part.text).join("");
  }
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
    this.bumpStat({ looped: 1 });
    try {
      const agent = this.ctx.agents.get(sessionId);
      if (agent === void 0) {
        this.log(`打断循环失败 ${sessionId}: 无 live agent`);
        state.loopCancelled = false;
        return;
      }
      agent.cancel({ kind: "user" }, { keepInbox: true });
      this.log(`已打断循环 ${sessionId}: cancel 已受理`);
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
        if (state.loopRetryTimer !== void 0) {
          clearTimeout(state.loopRetryTimer);
          state.loopRetryTimer = void 0;
        }
        this.cancelPending(sessionId, "宿主自行开启新回合");
        break;
      case "turn/end": {
        state.running = false;
        this.cancelPending(sessionId, "收到新的 turn/end");
        const reason = event.data.reason;
        if (typeof reason !== "object" || reason === null || Array.isArray(reason) || typeof reason.kind !== "string" || reason.kind.trim() === "") {
          console.error(`[auto-continue] 忽略畸形 turn/end ${sessionId}: reason 无法解释`);
          break;
        }
        if (reason.kind === "completed") {
          state.consecutive = 0;
          state.lastFailure = void 0;
          this.noteRecovery(sessionId, "completed");
        } else if (reason.kind === "aborted") {
          if (state.loopCancelled) {
            state.loopCancelled = false;
            state.loopFired = false;
            state.pendingRecoveryAt = 0;
            state.shortRun = 0;
            state.lastShortAt = 0;
            state.lastAssistantText = "";
            state.sameTextRun = 0;
            state.toolRun = void 0;
            const cooldown = this.cooldownFor(state);
            const remaining = cooldown - (Date.now() - state.lastAttemptAt);
            if (remaining > 0) {
              if (state.loopRetryTimer !== void 0) clearTimeout(state.loopRetryTimer);
              state.loopRetryTimer = setTimeout(() => {
                state.loopRetryTimer = void 0;
                try {
                  this.schedule(sessionId, "loop:aborted");
                } catch (error) {
                  console.error(`[auto-continue] loop 重启异常 ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
                }
              }, remaining);
              this.log(`loop 重启延迟 ${remaining}ms(冷却期) ${sessionId}`);
            } else {
              this.schedule(sessionId, "loop:aborted");
            }
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
          if (typeof error !== "object" || error === null || Array.isArray(error)) {
            console.error(`[auto-continue] 忽略畸形 turn/end ${sessionId}: error details 缺失`);
            break;
          }
          const code = typeof error.code === "string" && error.code.trim() !== "" ? error.code : void 0;
          const message = typeof error.message === "string" && error.message.trim() !== "" ? error.message : void 0;
          const status = typeof error.status === "number" && Number.isFinite(error.status) ? error.status : void 0;
          if (code === void 0 && message === void 0 && status === void 0) {
            console.error(`[auto-continue] 忽略畸形 turn/end ${sessionId}: error details 无法解释`);
            break;
          }
          state.lastFailure = {
            code: code ?? "UNKNOWN",
            message: message ?? code ?? `HTTP ${status}`,
            ...status !== void 0 ? { status } : {}
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
  onTurnFailure(sessionId, reason, failure) {
    const config = this.getConfig();
    if (config.classify && !isTransientFailure(failure, config.retryableErrorPatterns)) {
      const copy = NOTICE_COPY[config.locale];
      const summary = `${failure.code}${failure.status !== void 0 ? ` (HTTP ${failure.status})` : ""}`;
      this.log(`跳过 ${sessionId}(${reason}): 永久性失败 ${summary} — ${failure.message}`);
      this.bumpStat({ skipped: 1, code: failure.code });
      if (config.notify) {
        this.notify(
          sessionId,
          copy.notContinuedTitle,
          copy.permanentErrorBody(sessionId, summary),
          this.notifyOptions(sessionId, config.locale)
        );
      }
      return;
    }
    this.schedule(sessionId, reason);
  }
  /** 通知操作按钮与回调(「立即续跑」/「暂停该会话 1 小时」)。 */
  notifyOptions(sessionId, locale) {
    const copy = NOTICE_COPY[locale];
    return {
      actions: [
        { action: "resume", title: copy.resumeAction },
        { action: "pause1h", title: copy.pauseAction }
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
      this.pauseUntil.set(sessionId, Date.now() + 60 * 60 * 1e3);
      this.cancelPending(sessionId, "通知按钮暂停该会话");
    }
  }
  /** 内存统计(host 单实例): 按今日桶累计。 */
  bumpStat(delta) {
    const today = todayKey();
    if (this.dayStats.date !== today) this.dayStats = emptyDayStats();
    if (delta.sent !== void 0) this.dayStats.sent += delta.sent;
    if (delta.skipped !== void 0) this.dayStats.skipped += delta.skipped;
    if (delta.recovered !== void 0) this.dayStats.recovered += delta.recovered;
    if (delta.failed !== void 0) this.dayStats.failed += delta.failed;
    if (delta.gaveUp !== void 0) this.dayStats.gaveUp += delta.gaveUp;
    if (delta.looped !== void 0) this.dayStats.looped += delta.looped;
    if (delta.code !== void 0) {
      this.dayStats.byCode[delta.code] = (this.dayStats.byCode[delta.code] ?? 0) + 1;
    }
  }
  /** 通知桥: 产生一条通知事件, SSE 端点推给 browser 侧展示。 */
  notify(sessionId, title, body, options) {
    const notice = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title,
      body,
      sessionId,
      ...options?.actions !== void 0 && options.actions.length > 0 ? { actions: options.actions } : { actions: [] },
      at: Date.now()
    };
    this.notices.push(notice);
    for (const listener of this.noticeListeners) listener();
    this.emitState();
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
    this.bumpStat(outcome === "completed" ? { recovered: 1 } : { failed: 1 });
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
    try {
      await this.fire(sessionId, "manual:notification", true);
    } catch (error) {
      console.error(`[auto-continue] 手动续跑异常 ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
    }
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
    if (Date.now() < (this.pauseUntil.get(sessionId) ?? 0)) {
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
    const timer = setTimeout(() => {
      if (state.pendingTimer !== timer) return;
      state.pendingTimer = void 0;
      try {
        void this.fire(sessionId, reason);
      } catch (error) {
        console.error(`[auto-continue] 定时发送异常 ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
      }
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
  fire(sessionId, reason, force = false) {
    if (this.disposed) return;
    const state = this.state(sessionId);
    const config = this.getConfig();
    if (state.subagent) return;
    if (config.paused) {
      this.log(`跳过 ${sessionId}(${reason}): 全局暂停中`);
      return;
    }
    if (Date.now() < (this.pauseUntil.get(sessionId) ?? 0)) {
      this.log(`跳过 ${sessionId}(${reason}): 会话暂停中`);
      return;
    }
    if (!force && Date.now() - state.lastAttemptAt < this.cooldownFor(state)) {
      this.log(`跳过 ${sessionId}(${reason}): 处于冷却期`);
      return;
    }
    if (!force && state.consecutive >= config.maxConsecutive) {
      this.log(`跳过 ${sessionId}(${reason}): 已连续自动继续 ${state.consecutive} 次, 等待用户介入或成功回合`);
      return;
    }
    const template = reason.startsWith("loop:") ? config.loopText : reason.includes("max-tokens") ? config.continueTextMaxTokens : config.continueText;
    const text = this.buildContinueText(config, state, template);
    const agent = this.ctx.agents.get(sessionId);
    if (agent === void 0) {
      this.log(`跳过 ${sessionId}(${reason}): 无 live agent`);
      return;
    }
    state.lastAttemptAt = Date.now();
    try {
      agent.followup(
        createUserMessage({
          content: [{ type: "text", text }],
          source: { kind: "user" }
        })
      );
      const now = Date.now();
      state.consecutive += 1;
      state.lastAutoAt = now;
      state.lastSentText = text;
      state.pendingRecoveryAt = now;
      this.bumpStat({ sent: 1, ...state.lastFailure !== void 0 ? { code: state.lastFailure.code } : {} });
      this.log(`已自动发送「${text}」到 ${sessionId}(${reason}), 第 ${state.consecutive} 次连续`);
      if (config.notify) {
        const copy = NOTICE_COPY[config.locale];
        this.notify(
          sessionId,
          copy.continuedTitle,
          copy.continuedBody(sessionId, text, state.consecutive),
          this.notifyOptions(sessionId, config.locale)
        );
      }
      if (state.consecutive >= config.maxConsecutive) {
        this.bumpStat({ gaveUp: 1 });
        this.log(`达到连续上限 ${config.maxConsecutive} 次, 停止自动继续 ${sessionId}`);
        if (config.notify) {
          const copy = NOTICE_COPY[config.locale];
          this.notify(
            sessionId,
            copy.stoppedTitle,
            copy.stoppedBody(sessionId, state.consecutive),
            this.notifyOptions(sessionId, config.locale)
          );
        }
      }
    } catch (error) {
      this.log(`发送异常 ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  /**
   * 组装本次续跑消息: 模板填充 + 幂等护栏。
   * 护栏依据上一步工具调用的执行状态附加指引, 防止重跑副作用操作:
   * - 结果未确认(可能已部分执行)→ 提示先确认状态、不要重复执行
   * - 已确认成功 → 提示已完成、不要重复执行
   * - 已失败 → 不加护栏(重试工具本来就是目的)
   */
  buildContinueText(config, state, template) {
    let text = fillTemplate(template, {
      facts: state.lastFailure,
      tool: state.lastTool,
      turn: state.lastTurn,
      errorCount: state.consecutive + 1,
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
    const now = Date.now();
    const candidates = [];
    for (const agent of this.ctx.agents.list()) {
      const session = agent.session;
      if (session.header.origin === "subagent") continue;
      const eventSource = session;
      const events = typeof eventSource.snapshotEvents === "function" ? eventSource.snapshotEvents() : eventSource.events ?? [];
      const lastActivityAt = events.reduce(
        (latest, event) => Math.max(latest, event.time),
        0
      );
      candidates.push({
        sessionId: session.id,
        events,
        lastActivityAt,
        listIndex: candidates.length
      });
    }
    candidates.sort(
      (left, right) => right.lastActivityAt - left.lastActivityAt || left.listIndex - right.listIndex
    );
    for (const candidate of candidates.slice(0, config.scanLimit)) {
      if (this.disposed) return true;
      const state = this.state(candidate.sessionId);
      if (state.pendingTimer !== void 0) continue;
      if (state.consecutive >= config.maxConsecutive) continue;
      if (now - state.lastAttemptAt < this.cooldownFor(state)) continue;
      if (now < (this.pauseUntil.get(candidate.sessionId) ?? 0)) continue;
      const events = candidate.events;
      let lastEnd;
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const event = events[i];
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
      for (const event of events) {
        if (event.seq <= lastEnd.seq) continue;
        if (event.type === "turn/start") superseded = true;
        if (event.type === "user/message" && event.data.source.kind === "user") superseded = true;
        if (superseded) break;
      }
      if (superseded) continue;
      this.applyGuardFromEvents(state, events, lastEnd.seq);
      const scanReason = `scan:turn/end:${reason.kind}`;
      this.log(`扫描发现中断 ${candidate.sessionId}(turn/end:${reason.kind}), 交给恢复策略处理`);
      if (reason.kind === "error") {
        const error = reason.error;
        state.lastFailure = {
          code: typeof error.code === "string" ? error.code : "UNKNOWN",
          message: typeof error.message === "string" ? error.message : String(error),
          ...typeof error.status === "number" ? { status: error.status } : {}
        };
        state.lastTurn = lastEnd.data.turn;
        state.lastFailureAt = lastEnd.time;
        this.onTurnFailure(candidate.sessionId, scanReason, state.lastFailure);
      } else {
        this.schedule(candidate.sessionId, scanReason);
      }
    }
    return true;
  }
  /** 从历史事件恢复上一步工具调用状态(扫描路径的幂等护栏)。 */
  applyGuardFromEvents(state, events, untilSeq) {
    state.lastTool = void 0;
    state.lastToolResult = void 0;
    let call;
    for (const event of events) {
      if (event.seq >= untilSeq) continue;
      if (event.type === "tool/call") call = event;
    }
    if (call === void 0) return;
    state.lastTool = call.data.name;
    state.lastToolResult = "pending";
    for (const event of events) {
      if (event.seq <= call.seq || event.seq >= untilSeq) continue;
      if (event.type === "tool/result") {
        state.lastToolResult = toolResultFacts(event.data);
        break;
      }
    }
  }
};

// src/index.ts
var AUTO_CONTINUE_NS = "auto-continue";
var SETTINGS_NS = AUTO_CONTINUE_NS;
var AutoContinueSchema = z2.object({
  /** Active browser/UI locale mirrored by the client. */
  locale: z2.string().default("zh"),
  /** Text automatically sent after an interruption. */
  continueText: z2.string().default(""),
  /** Text sent when the output token ceiling is reached (same placeholders as `continueText`). */
  continueTextMaxTokens: z2.string().default(""),
  /** Idempotency guard: inspect the last tool call before resuming and steer the model. */
  guardTools: z2.boolean().default(true),
  /** Guard text appended when the last tool call has no confirmed result (it may have partially executed). */
  guardPendingText: z2.string().default(""),
  /** Guard text appended when the last tool call completed successfully (don't rerun it). */
  guardDoneText: z2.string().default(""),
  /** Grace period after an interruption before auto-sending (ms). */
  graceMs: z2.natural().default(3e3),
  /** Minimum interval between two auto-continues per session (ms). */
  cooldownMs: z2.natural().default(2e4),
  /** Max consecutive auto-continues per session before stopping. */
  maxConsecutive: z2.natural().min(1).default(3),
  /** Scan recently interrupted sessions on page load / reconnect. */
  scanOnBoot: z2.boolean().default(true),
  /** Max sessions the scan checks (most recently updated). */
  scanLimit: z2.natural().min(1).default(8),
  /** Scan only considers interruptions inside this window (ms). */
  freshMs: z2.natural().default(15 * 60 * 1e3),
  /** Log `[auto-continue]` lines to the browser console. */
  verbose: z2.boolean().default(true),
  /** Classify failures: auto-continue transient errors only; permanent ones are skipped and notified. */
  classify: z2.boolean().default(true),
  /** Provider-specific message/code/status fragments that explicitly count as retryable, one literal per line. */
  retryableErrorPatterns: z2.string().default(""),
  /** Cooldown multiplier per consecutive failure (adaptive backoff). */
  backoffFactor: z2.natural().min(1).default(2),
  /** Cap on the effective backoff interval (ms). */
  backoffMaxMs: z2.natural().default(3e5),
  /** Show browser notifications for auto-continue events. */
  notify: z2.boolean().default(false),
  /** Globally pause auto-continue: no live or scan send. */
  paused: z2.boolean().default(false),
  /** Loop guard: detect a running turn spinning in place and restart it. */
  loopGuard: z2.boolean().default(true),
  /** A model message shorter than this many chars counts as a short sentence (loop signal). */
  loopShortChars: z2.natural().min(1).default(40),
  /** Consecutive short sentences within this window (ms) with no tool call in between trip the loop guard. */
  loopWindowMs: z2.natural().min(1e3).default(3e4),
  /** Consecutive short sentences trip the loop guard. */
  loopShortCount: z2.natural().min(2).default(12),
  /** Consecutive identical short sentences trip the loop guard (strongest spinning signal). */
  loopRepeatText: z2.natural().min(2).default(4),
  /** Consecutive identical tool calls with identical arguments AND results trip the loop guard. */
  loopToolRepeat: z2.natural().min(2).default(5),
  /** Text sent after the loop guard cancels and restarts a turn (supports {tool}). */
  loopText: z2.string().default("")
});
function apply(ctx) {
  ctx.inject(["settings"], (settingsCtx) => {
    settingsCtx.settings.register(SETTINGS_NS, AutoContinueSchema, {
      applies: "live"
    });
  });
  let runnerRef;
  ctx.inject(["settings", "agents", "webServer"], (engineCtx) => {
    if (runnerRef !== void 0) runnerRef.dispose();
    const runner = new AutoContinueRunner(
      engineCtx,
      () => resolveConfig(engineCtx.settings.get(SETTINGS_NS))
    );
    runnerRef = runner;
    const sseClients = /* @__PURE__ */ new Set();
    const pushToAll = (data) => {
      for (const send of sseClients) {
        try {
          send(data);
        } catch {
          sseClients.delete(send);
        }
      }
    };
    const statePayload = () => JSON.stringify({
      type: "state",
      stats: runner.todayStats(),
      paused: runner.activePauses()
    });
    runner.subscribeNotices(() => {
      for (const notice of runner.drainNotices()) {
        pushToAll(`data: ${JSON.stringify({ type: "notice", notice })}

`);
      }
    });
    runner.subscribeState(() => {
      pushToAll(`data: ${statePayload()}

`);
    });
    engineCtx.webServer.register({
      kind: "exact",
      path: "/api/auto-continue-bridge",
      handler: (req, res) => {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive"
        });
        res.write(`data: ${statePayload()}

`);
        const send = (data) => {
          res.write(data);
        };
        sseClients.add(send);
        req.on("close", () => sseClients.delete(send));
      }
    });
    engineCtx.webServer.register({
      kind: "exact",
      path: "/api/auto-continue-action",
      handler: (req, res) => {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString("utf8");
          if (body.length > 4096) req.destroy();
        });
        req.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            if (typeof parsed.action === "string") {
              runner.handleNoticeAction(parsed.sessionId ?? void 0, parsed.action);
              res.writeHead(200, { "content-type": "application/json" });
              res.end(JSON.stringify({ ok: true }));
              return;
            }
            res.writeHead(400, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: false }));
          } catch {
            res.writeHead(400, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: false }));
          }
        });
      }
    });
  });
  ctx.effect(() => () => {
    const runner = runnerRef;
    runnerRef = void 0;
    if (runner !== void 0) runner.dispose();
  });
}
export {
  AUTO_CONTINUE_NS,
  AutoContinueSchema,
  apply
};
