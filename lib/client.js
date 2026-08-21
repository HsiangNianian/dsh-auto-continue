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
  inject: () => inject,
  pausedSessions: () => pausedSessions,
  readTodayStats: () => readTodayStats,
  resetTodayStats: () => resetTodayStats,
  unpauseSession: () => unpauseSession
});
module.exports = __toCommonJS(index_exports);

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
var lockPrefix = "dsh-auto-continue:";
var SEND_COUNT_WINDOW_MS = 10 * 60 * 1e3;
var statsKey = `${lockPrefix}stats`;
var RECOVERY_WINDOW_MS = 10 * 60 * 1e3;
var ECHO_WINDOW_MS = 10 * 60 * 1e3;

// src/client/bridge.ts
var EMPTY_STATS = {
  date: "",
  sent: 0,
  skipped: 0,
  recovered: 0,
  failed: 0,
  gaveUp: 0,
  looped: 0,
  byCode: {}
};
var state = { stats: EMPTY_STATS, paused: [] };
var listeners = /* @__PURE__ */ new Set();
function pausedSessions() {
  return state.paused;
}
function readTodayStats() {
  return state.stats;
}
function resetTodayStats() {
  void postAction({ action: "reset-stats" });
}
function unpauseSession(sessionId) {
  void postAction({ action: "unpause", sessionId });
}
function subscribeBridge(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
async function postAction(payload) {
  try {
    await fetch("/api/auto-continue-action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch {
  }
}
function handleEvent(event) {
  if (event.type === "state") {
    state = {
      stats: event.stats ?? EMPTY_STATS,
      paused: event.paused ?? []
    };
    for (const listener of listeners) listener();
  } else if (event.type === "notice" && event.notice !== void 0) {
    showNotification(event.notice);
  }
}
function showNotification(notice) {
  try {
    const N = globalThis.Notification;
    if (typeof N === "undefined") return;
    const permission = N.permission;
    const create = () => {
      const instance = new N(notice.title, {
        body: notice.body,
        ...notice.actions.length > 0 ? { actions: notice.actions } : {}
      });
      const target = instance;
      target.onclick = () => {
        try {
          globalThis.focus?.();
        } catch {
        }
      };
      target.onaction = (event) => {
        if (notice.sessionId !== void 0) {
          void postAction({ action: event.action, sessionId: notice.sessionId });
        }
      };
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
function startBridge() {
  let stopped = false;
  let controller;
  const loop = async () => {
    while (!stopped) {
      controller = new AbortController();
      try {
        const response = await fetch("/api/auto-continue-bridge", { signal: controller.signal });
        if (!response.ok || response.body === null) throw new Error(`bridge HTTP ${response.status}`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (; ; ) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx = buffer.indexOf("\n\n");
          while (idx !== -1) {
            const chunk = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            for (const line of chunk.split("\n")) {
              if (line.startsWith("data: ")) {
                try {
                  handleEvent(JSON.parse(line.slice(6)));
                } catch {
                }
              }
            }
            idx = buffer.indexOf("\n\n");
          }
        }
      } catch {
      }
      if (!stopped) await new Promise((resolve) => setTimeout(resolve, 3e3));
    }
  };
  void loop();
  return () => {
    stopped = true;
    controller?.abort();
  };
}

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
  const { state: state2 } = props;
  if (!state2.available) return null;
  const title = props.t(props.titleKey);
  const blocked = !state2.dirty || state2.invalid || state2.saving;
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
          state2.dirty ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshAcPending", title: props.t("chrome.unsaved"), children: props.t("chrome.unsaved") }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: open ? "dshAcChevron dshAcChevronOpen" : "dshAcChevron", children: "▾" })
        ]
      }
    ),
    open ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshAcBody", children: [
      !state2.writable ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dshAcReadOnly", role: "status", children: props.t("chrome.readOnly") }) : null,
      props.children,
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshAcFooter", children: [
        state2.failed ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dshAcFailed", role: "status", children: props.t("chrome.saveFailed") }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "dshAcDiscard",
            disabled: !state2.dirty || state2.saving,
            onClick: props.onDiscard,
            children: props.t("chrome.discard")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dshAcSave", disabled: blocked, onClick: props.onSave, children: props.t(!state2.saving ? "chrome.save" : "chrome.saving") })
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
    const unsubscribe = subscribeBridge(() => refresh((value) => value + 1));
    const timer = setInterval(() => refresh((value) => value + 1), 5e3);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
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
  const state2 = props.useAutoContinueSettingsCard((snapshot) => snapshot);
  const disabled = !state2.writable;
  const shared = { t, disabled };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    SettingsCard,
    {
      t,
      titleKey: "card.title",
      descriptionKey: "card.description",
      state: state2,
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
            ...state2.paused,
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
            ...state2.continueText,
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
            ...state2.continueTextMaxTokens,
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
            ...state2.guardTools,
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
            ...state2.guardPendingText,
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
            ...state2.guardDoneText,
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
            ...state2.graceMs,
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
            ...state2.cooldownMs,
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
            ...state2.maxConsecutive,
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
            ...state2.scanOnBoot,
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
            ...state2.scanLimit,
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
            ...state2.freshMs,
            onEdit: (text) => props.edit("freshMs", text),
            onReset: () => props.resetField("freshMs")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          BooleanField,
          {
            id: "auto-continue-verbose",
            label: t("field.verbose"),
            hint: t("field.verboseHint"),
            ...shared,
            ...state2.verbose,
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
            ...state2.classify,
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
            ...state2.backoffFactor,
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
            ...state2.backoffMaxMs,
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
            ...state2.notify,
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
            ...state2.loopGuard,
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
            ...state2.loopShortChars,
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
            ...state2.loopWindowMs,
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
            ...state2.loopShortCount,
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
            ...state2.loopToolRepeat,
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
            ...state2.loopRepeatText,
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
            ...state2.loopText,
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
var inject = ["slots", "locale", "settingsScope"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "auto-continue: dictionaries");
  ctx.effect(() => startBridge(), "auto-continue: host bridge");
  const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NS });
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
