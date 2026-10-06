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

// src/shared/core.ts
var LOCALIZED_TEXT_DEFAULTS = {
  zh: {
    continueText: "继续",
    continueTextMaxTokens: "继续",
    continueTextSilent: "继续。你上一轮只输出了内部推理, 既没有回复也没有调用工具, 用户什么都没看到。每一轮都要以工具调用或可见回复结束。",
    continueTextLoop: "继续",
    guardPendingText: "(上一步工具「{tool}」可能未完成, 先确认状态再继续, 不要重复执行)",
    guardDoneText: "(上一步工具「{tool}」已完成, 结果: {result}; 不要重复执行, 直接继续)",
    loopText: "(检测到你可能陷入循环, 请停止重复刚才的动作, 换一种方式继续)"
  },
  en: {
    continueText: "Continue",
    continueTextMaxTokens: "Continue",
    continueTextSilent: "Continue. Your previous turn ended with internal reasoning only, with no message and no tool call, so nothing reached the user. Always finish a turn with a tool call or a visible answer.",
    continueTextLoop: "Continue",
    guardPendingText: '(The previous tool "{tool}" may not have completed. Check its state before continuing and do not run it again.)',
    guardDoneText: '(The previous tool "{tool}" completed successfully. Result: {result}; do not run it again. Continue from there.)',
    loopText: "(You may be stuck in a loop. Stop repeating the last action and continue with a different approach.)"
  }
};
var DEFAULT_CONFIG = {
  locale: "zh",
  ...LOCALIZED_TEXT_DEFAULTS.zh,
  resumeSilentTurns: true,
  resumeCompletedTurns: false,
  continueTextLoop: "",
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
  showComposerToggle: true,
  loopGuard: true,
  loopShortChars: 40,
  loopWindowMs: 3e4,
  loopShortCount: 12,
  loopRepeatText: 4,
  loopToolRepeat: 5
};
var RECOVERY_WINDOW_MS = 10 * 60 * 1e3;
var ECHO_WINDOW_MS = 10 * 60 * 1e3;

// src/client/locales.ts
var zh = {
  "card.title": "自动继续",
  "card.description": "恢复意外中断的会话，按你的节奏继续。",
  "repo.star": "觉得好用的话，点个 Star 吧",
  "repo.note": "HsiangNianian 的开源插件，也欢迎反馈和 PR。",
  "repo.link": "GitHub 仓库",
  "repo.aria": "在新标签页打开 HsiangNianian/dsh-auto-continue 的 GitHub 仓库",
  "chrome.enabled": "已启用",
  "chrome.paused": "已暂停",
  "chrome.saved": "所有更改已保存",
  "notification.title": "自动继续设置",
  "notification.enabled": "设置已保存，浏览器通知已开启。",
  "notification.disabled": "设置已保存，浏览器通知已关闭。",
  "notification.saved": "自动继续的设置已保存。",
  "notification.blocked": "设置已保存，但浏览器尚未允许通知。请在此网站的权限设置中允许通知。",
  "notification.unsupported": "设置已保存，当前浏览器不支持通知。",
  "notification.failed": "设置已保存，但浏览器通知未能发出。请检查网站和系统的通知权限。",
  "chrome.categories": "设置类别",
  "category.general.title": "常规",
  "category.general.description": "控制自动继续的启停、显示和通知。",
  "category.recovery.title": "重试策略",
  "category.recovery.description": "设置等待时间、次数上限和错误分类。",
  "category.startup.title": "启动恢复",
  "category.startup.description": "DSH 重启后，找回最近中断的会话。",
  "category.prompts.title": "继续文本",
  "category.prompts.description": "留空使用内置文案，跟随 DSH 的界面语言。",
  "category.safety.title": "安全保护",
  "category.safety.description": "避免重复执行工具，识别并打断无效循环。",
  "category.status.title": "状态与日志",
  "category.status.description": "查看活动记录与暂停的会话。",
  "field.paused": "自动继续",
  "field.showComposerToggle": "在会话区显示自动继续开关",
  "field.showComposerToggleHint": "默认显示。隐藏开关不会暂停自动继续；点击保存后生效。",
  "composer.label": "自动继续",
  "composer.scope": "控制当前配置下所有会话的自动继续，修改立即保存。",
  "composer.saving": "正在保存自动继续设置…",
  "composer.saveFailed": "保存失败，请重试",
  "field.pausedHint": "恢复意外中断的会话。关闭并保存后，全局暂停恢复并取消已排队的继续。",
  "field.continueText": "继续文本",
  "field.continueTextHint": "中断后自动发送的消息内容。",
  "default.continueText": LOCALIZED_TEXT_DEFAULTS.zh.continueText,
  "field.continueTextMaxTokens": "超限时的继续文本",
  "field.continueTextMaxTokensHint": "达到输出 token 上限时自动发送的文本, 支持与继续文本相同的占位符。",
  "default.continueTextMaxTokens": LOCALIZED_TEXT_DEFAULTS.zh.continueTextMaxTokens,
  "field.resumeSilentTurns": "续跑无输出回合",
  "field.resumeSilentTurnsHint": "已观察到模型活动但没有可见输出时续跑；不把空回合、图片或扩展内容误判为静默，冷却与连续上限照常生效。",
  "field.resumeCompletedTurns": "自主循环（每个回合后都续跑）",
  "field.resumeCompletedTurnsHint": "正常完成后经过宽限期自动续跑，不受恢复冷却和次数上限限制；仅有推理或显式无输出的回合仍消耗重试预算。暂停或关闭该选项可停止后续接力，手动停止或发送消息会取消当前待发送的继续提示。",
  "field.continueTextLoop": "自主循环的继续文本",
  "field.continueTextLoopHint": "自主循环每次续跑时发送的文本。",
  "default.continueTextLoop": LOCALIZED_TEXT_DEFAULTS.zh.continueTextLoop,
  "field.continueTextSilent": "无输出回合的继续文本",
  "field.continueTextSilentHint": "回合只输出推理就结束时自动发送的文本, 支持与继续文本相同的占位符。",
  "default.continueTextSilent": LOCALIZED_TEXT_DEFAULTS.zh.continueTextSilent,
  "field.guardTools": "幂等护栏",
  "field.guardToolsHint": "续跑前检查上一步工具调用: 结果未确认时提示先确认状态, 已成功时提示不要重复执行, 避免重复 commit/调 API。",
  "field.guardPendingText": "结果未确认时的护栏文本",
  "field.guardPendingTextHint": "上一步工具可能已部分执行时附加到继续文本之后, 支持 {tool} 占位符。",
  "default.guardPendingText": LOCALIZED_TEXT_DEFAULTS.zh.guardPendingText,
  "field.guardDoneText": "工具已成功时的护栏文本",
  "field.guardDoneTextHint": "上一步工具已确认成功时附加到继续文本之后, 支持 {tool} 与 {result}(结果摘要)占位符。",
  "default.guardDoneText": LOCALIZED_TEXT_DEFAULTS.zh.guardDoneText,
  "field.graceMs": "宽限期 (ms)",
  "field.graceMsHint": "检测到中断后等待的时长; 期间宿主自行恢复则取消。",
  "field.cooldownMs": "冷却时间 (ms)",
  "field.cooldownMsHint": "同一会话恢复尝试的最小间隔；期间出现的失败会等待剩余冷却，再进入宽限期。正常完成后的自主循环接力不受此限制。",
  "field.maxConsecutive": "最大连续次数",
  "field.maxConsecutiveHint": "连续恢复尝试上限；用户介入或观察到有可见输出的成功回合后清零。正常完成后的自主循环接力不计入。",
  "field.scanOnBoot": "启动恢复扫描",
  "field.scanOnBootHint": "宿主启动后在扫描时间窗内等待延迟加载的中断会话，每个已就绪会话只检查一次。",
  "field.scanLimit": "扫描会话数",
  "field.scanLimitHint": "每次扫描最多恢复多少个符合条件的会话，优先最近活动的会话。",
  "field.freshMs": "扫描时间窗 (ms)",
  "field.freshMsHint": "只处理该时间窗内的中断；启动轮询也会在这段时间后结束。",
  "field.verbose": "详细日志",
  "field.verboseHint": "在 DSH 宿主日志中输出 [auto-continue] 引擎活动；CLI 用户可在运行 DSH 的终端查看。",
  "field.classify": "错误分类",
  "field.classifyHint": "仅自动恢复临时性错误(网络/超时/5xx 等); 认证/余额/模型不存在等永久性错误跳过并通知。",
  "field.retryableErrorPatterns": "自定义可恢复错误",
  "field.retryableErrorPatternsHint": "每行一个大小写不敏感的普通文本片段; 命中错误码、HTTP 状态或消息时覆盖内置分类。请只填 provider 稳定且足够具体的文案, 过宽会重复请求。",
  "field.retryableErrorPatternsPlaceholder": "例如：Upstream rejected the request as invalid",
  "field.backoffFactor": "退避系数",
  "field.backoffFactorHint": "连续失败时冷却间隔的倍率(如 2 表示 20s→40s→80s 递增)。",
  "field.backoffMaxMs": "最大退避间隔 (ms)",
  "field.backoffMaxMsHint": "自适应退避的上限, 防止等待过久。",
  "field.notify": "浏览器通知",
  "field.notifyHint": "开启后，自动继续事件和配置保存成功时会通知。切换此选项并保存后也会确认状态；首次开启需允许浏览器通知。",
  "stats.title": "今日统计",
  "stats.sent": "自动继续",
  "stats.skipped": "跳过(永久错误)",
  "stats.recovered": "恢复成功",
  "stats.failed": "继续后仍失败",
  "stats.gaveUp": "停止(达上限)",
  "stats.looped": "循环打断",
  "field.loopGuard": "循环守卫",
  "field.loopGuardHint": "检测运行中的回合空转: 连续短句且无工具调用、流式消息内连续复读, 或连续调用相同工具时, 自动取消并用循环提示文本重启回合。",
  "field.loopShortChars": "短句长度上限 (字符)",
  "field.loopShortCharsHint": "模型消息文本短于该值计为一条短句(空转信号)。",
  "field.loopWindowMs": "短句时间窗 (ms)",
  "field.loopWindowMsHint": "连续短句必须落在这个时间窗内; 正常思考的短文本散布在长时间里不会被误判。",
  "field.loopShortCount": "连续短句阈值",
  "field.loopShortCountHint": "时间窗内连续多少条短句且期间无工具调用时判定空转循环。",
  "field.loopRepeatText": "相同消息重复次数",
  "field.loopRepeatTextHint": "连续输出多少条完全相同的消息时判定空转(最强信号, 不限长度, 也用于流式消息内连续复读段落)。",
  "field.loopToolRepeat": "同工具重复次数",
  "field.loopToolRepeatHint": "同工具+同参数+同结果的连续调用多少次时判定死循环; 参数或结果有变化视为有进展。",
  "field.loopText": "循环提示文本",
  "field.loopTextHint": "打断后重启回合时发送的文本, 支持 {tool} 占位符。",
  "default.loopText": LOCALIZED_TEXT_DEFAULTS.zh.loopText,
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
  "card.description": "Resume interrupted sessions, at your pace.",
  "repo.star": "Finding it useful? Leave a Star",
  "repo.note": "By HsiangNianian. Feedback and PRs welcome.",
  "repo.link": "GitHub repo",
  "repo.aria": "Open HsiangNianian/dsh-auto-continue on GitHub in a new tab",
  "chrome.enabled": "Enabled",
  "chrome.paused": "Paused",
  "chrome.saved": "All changes saved",
  "notification.title": "Auto-continue settings",
  "notification.enabled": "Settings saved. Browser notifications are on.",
  "notification.disabled": "Settings saved. Browser notifications are off.",
  "notification.saved": "Your auto-continue settings have been saved.",
  "notification.blocked": "Settings saved, but browser notifications are not allowed. Allow notifications in this site’s permissions.",
  "notification.unsupported": "Settings saved. This browser does not support notifications.",
  "notification.failed": "Settings saved, but the notification could not be sent. Check notification permissions for this site and your system.",
  "chrome.categories": "Settings categories",
  "category.general.title": "General",
  "category.general.description": "Control automatic recovery, visibility, and notifications.",
  "category.recovery.title": "Retry strategy",
  "category.recovery.description": "Set wait times, retry limits, and error classification.",
  "category.startup.title": "Startup recovery",
  "category.startup.description": "Find recently interrupted sessions when DSH restarts.",
  "category.prompts.title": "Continue text",
  "category.prompts.description": "Leave blank for built-in text in the current DSH language.",
  "category.safety.title": "Safety",
  "category.safety.description": "Avoid duplicate tool actions and break unproductive loops.",
  "category.status.title": "Status and logs",
  "category.status.description": "View activity and paused sessions.",
  "field.paused": "Auto-continue",
  "field.showComposerToggle": "Show auto-continue switch in the composer",
  "field.showComposerToggleHint": "Shown by default. Hiding the switch does not pause auto-continue. Click Save to apply.",
  "composer.label": "Auto-continue",
  "composer.scope": "Controls auto-continue for all sessions in this profile. Changes save immediately.",
  "composer.saving": "Saving auto-continue setting…",
  "composer.saveFailed": "Could not save. Try again.",
  "field.pausedHint": "Resume interrupted sessions. Turn off and save to pause recovery globally and cancel queued continuations.",
  "field.continueText": "Continue text",
  "field.continueTextHint": "Message automatically sent after an interruption.",
  "default.continueText": LOCALIZED_TEXT_DEFAULTS.en.continueText,
  "field.continueTextMaxTokens": "Continue text (max tokens)",
  "field.continueTextMaxTokensHint": "Text sent when the output token ceiling is reached; same placeholders as the continue text.",
  "default.continueTextMaxTokens": LOCALIZED_TEXT_DEFAULTS.en.continueTextMaxTokens,
  "field.resumeSilentTurns": "Resume silent turns",
  "field.resumeSilentTurnsHint": "Resume observed model activity without visible output. No-op turns, images and extension blocks are not treated as silent; cooldown and retry limits still apply.",
  "field.resumeCompletedTurns": "Autonomous loop (continue after every turn)",
  "field.resumeCompletedTurnsHint": "Continue normal completions after grace, without the recovery cooldown or cap. Reasoning-only and explicit silent endings still consume the retry budget. Pause or disable this option to stop future handoffs; Stop or a manual message cancels the queued continuation.",
  "field.continueTextLoop": "Continue text (autonomous loop)",
  "field.continueTextLoopHint": "Text sent on each autonomous-loop continuation.",
  "default.continueTextLoop": LOCALIZED_TEXT_DEFAULTS.en.continueTextLoop,
  "field.continueTextSilent": "Continue text (silent turn)",
  "field.continueTextSilentHint": "Text sent when a turn ends with reasoning only; same placeholders as the continue text.",
  "default.continueTextSilent": LOCALIZED_TEXT_DEFAULTS.en.continueTextSilent,
  "field.guardTools": "Idempotency guard",
  "field.guardToolsHint": "Before resuming, inspect the last tool call: if its result is unconfirmed, tell the model to check state first; if it succeeded, tell it not to rerun — avoids duplicate commits / API calls.",
  "field.guardPendingText": "Guard text (unconfirmed result)",
  "field.guardPendingTextHint": "Appended when the last tool may have partially executed; supports the {tool} placeholder.",
  "default.guardPendingText": LOCALIZED_TEXT_DEFAULTS.en.guardPendingText,
  "field.guardDoneText": "Guard text (tool succeeded)",
  "field.guardDoneTextHint": "Appended when the last tool is confirmed done; supports {tool} and {result} (result excerpt).",
  "default.guardDoneText": LOCALIZED_TEXT_DEFAULTS.en.guardDoneText,
  "field.graceMs": "Grace period (ms)",
  "field.graceMsHint": "Wait after an interruption; cancelled if the host recovers on its own.",
  "field.cooldownMs": "Cooldown (ms)",
  "field.cooldownMsHint": "Minimum interval between recovery attempts; failures during cooldown wait for the remaining interval, then grace. Normal autonomous-loop handoffs are exempt.",
  "field.maxConsecutive": "Max consecutive",
  "field.maxConsecutiveHint": "Consecutive recovery-attempt cap; resets on user intervention or an observed completion with visible output. Normal autonomous-loop handoffs are exempt.",
  "field.scanOnBoot": "Scan on host startup",
  "field.scanOnBootHint": "Wait for delayed interrupted sessions during the startup scan window; inspect each settled session once.",
  "field.scanLimit": "Scan limit",
  "field.scanLimitHint": "Maximum eligible sessions to recover per pass, most recently active first.",
  "field.freshMs": "Scan window (ms)",
  "field.freshMsHint": "Only interruptions inside this window are considered; startup polling also ends after this duration.",
  "field.verbose": "Verbose logs",
  "field.verboseHint": "Write engine activity to DSH host logs with the [auto-continue] prefix; CLI users can read them in the terminal running DSH.",
  "field.classify": "Classify errors",
  "field.classifyHint": "Auto-resume transient failures only (network/timeout/5xx…); auth, balance and model errors are skipped and notified.",
  "field.retryableErrorPatterns": "Custom retryable errors",
  "field.retryableErrorPatternsHint": "One case-insensitive literal per line. A match in the error code, HTTP status, or message overrides built-in classification. Use only stable, provider-specific text; broad matches can repeat requests.",
  "field.retryableErrorPatternsPlaceholder": "For example: Upstream rejected the request as invalid",
  "field.backoffFactor": "Backoff factor",
  "field.backoffFactorHint": "Cooldown multiplier per consecutive failure (2 = 20s→40s→80s…).",
  "field.backoffMaxMs": "Max backoff (ms)",
  "field.backoffMaxMsHint": "Cap on the adaptive backoff interval.",
  "field.notify": "Browser notifications",
  "field.notifyHint": "Notify about auto-continue events and successful settings saves. Saving a change to this option also confirms its state. Allow browser notifications when first enabling it.",
  "stats.title": "Today's stats",
  "stats.sent": "Auto-continued",
  "stats.skipped": "Skipped (permanent)",
  "stats.recovered": "Recovered",
  "stats.failed": "Failed after",
  "stats.gaveUp": "Gave up (cap)",
  "stats.looped": "Loops broken",
  "field.loopGuard": "Loop guard",
  "field.loopGuardHint": "Detects a running turn spinning in place — many short sentences with no tool calls, repeated paragraphs inside one streamed assistant message, or the same tool repeating — then cancels and restarts with the loop text.",
  "field.loopShortChars": "Short-sentence max (chars)",
  "field.loopShortCharsHint": "A model message shorter than this counts as a short sentence (spinning signal).",
  "field.loopWindowMs": "Short-sentence window (ms)",
  "field.loopWindowMsHint": "Consecutive short sentences must land inside this window; normal thinking spread over time is not misjudged.",
  "field.loopShortCount": "Short-sentence threshold",
  "field.loopShortCountHint": "How many consecutive short sentences inside the window, with no tool call, trip the loop guard.",
  "field.loopRepeatText": "Identical message count",
  "field.loopRepeatTextHint": "How many consecutive identical messages trip the guard (strongest signal, any length; also used for repeated paragraphs inside one streamed assistant message).",
  "field.loopToolRepeat": "Same-tool repeat count",
  "field.loopToolRepeatHint": "How many consecutive calls of the same tool with identical arguments and results trip the loop guard; a changed argument or result counts as progress.",
  "field.loopText": "Loop text",
  "field.loopTextHint": "Text sent after the loop guard restarts a turn; supports the {tool} placeholder.",
  "default.loopText": LOCALIZED_TEXT_DEFAULTS.en.loopText,
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

// src/client/native-switch.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function legacySwitch(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "button",
    {
      type: "button",
      role: "switch",
      className: "dshAcSwitch",
      "aria-checked": props.checked,
      "aria-label": props.label,
      disabled: props.disabled,
      title: props.title,
      onClick: () => props.onChange(!props.checked),
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {})
    }
  );
}
function resolveSwitch() {
  try {
    const { Switch } = require("@deepseek-ai/dsh-client-ui-primitives");
    if (typeof Switch === "function") return Switch;
  } catch {
  }
  return legacySwitch;
}
var NativeSwitch = resolveSwitch();

// src/client/dsh-store-compat.ts
function resolveSnapshotStore() {
  const current = ["@deepseek-ai/dsh-client", "-store"].join("");
  const legacy = ["@deepseek-ai/dsh-client-runtime", "/client"].join("");
  try {
    return require(current);
  } catch {
    return require(legacy);
  }
}
var { createSnapshotStore } = resolveSnapshotStore();

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
    this.unsubscribe = this.scope.subscribe(() => this.publish());
  }
  /** Release this editor's listeners without disposing the provider's shared form. */
  dispose() {
    this.unsubscribe();
    this.listeners.clear();
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
   * @returns true only when a non-empty save was accepted and read back.
   */
  async save() {
    const plan = this.plan();
    const writes = plan.flatMap((item) => item.run === void 0 ? [] : [item.run]);
    const snapshot = this.scope.getSnapshot();
    if (plan.length === 0 || this.saving || writes.length !== plan.length || snapshot.status !== "ready" || !snapshot.writable || snapshot.mode !== "host") return false;
    const edits = plan.map(({ field, staged }) => ({ field, staged }));
    this.saving = true;
    this.failed = false;
    this.publish();
    let landed = true;
    try {
      for (const write of writes) {
        landed = await write() && landed;
      }
    } catch {
      landed = false;
    }
    if (landed) {
      for (const { field, staged } of edits) {
        if (this.staged.get(field) === staged) this.staged.delete(field);
      }
    }
    this.saving = false;
    this.failed = !landed;
    this.publish();
    return landed;
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
        if (this.stored(field)) plan.push({ field, staged, run: () => this.clear(field) });
        continue;
      }
      if (staged.text === spec.format(this.sectionValue(field))) continue;
      const write = spec.parse(staged.text);
      if (write === void 0) plan.push({ field, staged, run: void 0 });
      else if (write.kind === "clear") plan.push({ field, staged, run: () => this.clear(field) });
      else plan.push({ field, staged, run: () => this.store(field, write.value) });
    }
    return plan;
  }
  async clear(field) {
    const accepted = await this.scope.unset(field);
    return accepted !== false && !this.stored(field);
  }
  async store(field, value) {
    const accepted = await this.scope.set(field, value);
    return accepted !== false && this.userLayer()?.[field] === value;
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
.dshAcComposer { display: inline-flex; align-items: center; gap: 7px; min-height: 32px; flex: 0 0 auto; font: inherit; }
.dshAcComposerLabel { color: var(--dsw-alias-label-secondary); font-size: 12px; white-space: nowrap; }
.dshAcSwitchTarget { display: inline-flex; align-items: center; min-height: 32px; }
.dshAcSwitchTarget > button { position: relative; }
.dshAcSwitchTarget > button::before { content: ''; position: absolute; inset: -6px -3px; }
.dshAcComposerError { color: var(--dsw-alias-state-error-primary, var(--dsw-alias-label-secondary)); font-size: 12px; max-width: 160px; }
.dshAcComposerError:empty { display: none; }
.dshAcSwitch { position: relative; box-sizing: border-box; flex: none; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; background: var(--dsw-alias-border-l3); cursor: pointer; }
.dshAcSwitch[aria-checked='true'] { background: var(--dsw-alias-brand-primary); }
.dshAcSwitch > span { display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-label-primary-foreground); }
.dshAcSwitch[aria-checked='true'] > span { transform: translateX(16px); }
.dshAcSwitch[aria-checked='false'] > span { background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary-foreground)); }
.dshAcSwitch:disabled { opacity: .5; cursor: default; }
.dshAcSwitch:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dshAcCard {
  --dsh-ac-bg: var(--dsw-alias-bg-base, var(--dsw-alias-bg-layer-2));
  --dsh-ac-line: var(--dsw-alias-border-l2);
  --dsh-ac-text: var(--dsw-alias-label-primary);
  --dsh-ac-muted: var(--dsw-alias-label-tertiary);
  container: auto-continue-settings / inline-size;
  color: var(--dsh-ac-text);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  list-style: none;
  padding: 0;
}
.dshAcCard *, .dshAcCard *::before, .dshAcCard *::after { box-sizing: border-box; }
.dshAcCard :is(h2,h3,p) { margin: 0; }
.dshAcCard :is(button,input,textarea) { font: inherit; }
.dshAcCard button { cursor: pointer; }
.dshAcCard button:disabled { opacity: .4; cursor: default; }
.dshAcCard :is(a,button,input,textarea):focus-visible { outline: 2px solid var(--dsh-ac-text); outline-offset: 3px; }
.dshAcHeaderFrame { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr); align-items: center; gap: 24px; margin: 20px 0; padding: 16px 18px; border-radius: 9px; color: #f9fafb; background: #23262c; }
.dshAcIntroduction { min-width: 0; }
.dshAcTitleLine { display: flex; align-items: center; gap: 10px; }
.dshAcTitleLine h2 { font-size: 17px; font-weight: 620; line-height: 1.4; white-space: nowrap; }
.dshAcStatus { white-space: nowrap; font-size: 11px; color: #dce0e6; background: #ffffff14; border-radius: 5px; padding: 2px 7px; }
.dshAcIntroduction p { margin-top: 5px; color: #b9bec8; font-size: 12px; line-height: 1.6; }
.dshAcRepository { display: flex; align-items: center; gap: 12px; min-width: 0; }
.dshAcStar { display: grid; place-items: center; flex: none; width: 34px; height: 34px; border: 1px solid #625032; border-radius: 50%; background: #302c25; color: #e9be6d; }
.dshAcStar svg { width: 18px; height: 18px; fill: #e9be6d12; stroke: currentColor; stroke-width: 1.5; stroke-linejoin: round; }
.dshAcRepositoryCopy { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 5px; }
.dshAcRepositoryCopy strong { font-size: 13px; font-weight: 560; line-height: 1.5; }
.dshAcRepositoryCopy > span { color: #b9bec8; font-size: 10px; line-height: 1.6; }
.dshAcRepositoryCopy > * { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.dshAcCard a.dshAcGithub { display: inline-flex; align-items: center; justify-content: center; gap: 8px; flex: none; min-height: 38px; padding: 9px 11px; border: 1px solid transparent; border-radius: 6px; color: #202329; background: #f4f5f7; text-decoration: none; font-size: 12px; font-weight: 550; white-space: nowrap; transition: background-color 140ms ease, box-shadow 140ms ease; }
.dshAcCard a.dshAcGithub:hover { background: #fff; box-shadow: 0 0 0 3px #ffffff18; }
.dshAcCard a.dshAcGithub:focus-visible { outline-color: #e9be6d; }
.dshAcGithub > svg { flex: none; width: 17px; height: 17px; fill: currentColor; }
.dshAcGithub > svg.dshAcExternal { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; margin-left: 2px; }
.dshAcGithubShort { display: none; }
.dshAcReadOnly { padding: 10px 0; color: var(--dsh-ac-muted); }
.dshAcLayout { display: grid; grid-template-columns: 164px minmax(0, 1fr); border-top: 1px solid var(--dsh-ac-line); min-height: 462px; }
.dshAcNav { display: flex; flex-direction: column; gap: 4px; padding: 16px 18px 16px 0; position: sticky; top: 16px; align-self: start; }
.dshAcNav > button { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 37px; padding: 8px 11px; border: 0; border-radius: 6px; text-align: left; background: none; color: var(--dsw-alias-label-secondary); }
.dshAcNav > button:hover, .dshAcNav > button[aria-selected=true] { color: var(--dsh-ac-text); background: var(--dsw-alias-interactive-bg-hover); }
.dshAcNav > button[aria-selected=true] { font-weight: 600; }
.dshAcInvalidMark { color: var(--dsw-alias-state-error-primary); font-weight: 600; }
.dshAcCategory { min-width: 0; padding: 20px 0 16px 26px; border-left: 1px solid var(--dsh-ac-line); }
.dshAcCategoryHeading { padding-bottom: 14px; }
.dshAcCategoryHeading h3 { font-size: 15px; font-weight: 620; }
.dshAcCategoryHeading p { color: var(--dsh-ac-muted); font-size: 12px; margin-top: 3px; }
.dshAcField { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px 24px; padding: 18px 0; border-bottom: 1px solid var(--dsh-ac-line); }
.dshAcField:last-child { border-bottom: 0; }
.dshAcFieldCopy { min-width: 0; }
.dshAcLabel { display: block; font-size: 14px; font-weight: 480; color: var(--dsh-ac-text); }
.dshAcHint { color: var(--dsh-ac-muted); font-size: 12px; line-height: 1.6; }
.dshAcFieldCopy p { margin-top: 4px; }
.dshAcFieldControl { display: flex; align-items: center; justify-content: flex-end; gap: 14px; }
.dshAcReset { padding: 0; border: 0; background: none; color: var(--dsh-ac-muted); font-size: 11px !important; white-space: nowrap; }
.dshAcReset:hover:not(:disabled) { color: var(--dsh-ac-text); text-decoration: underline; }
.dshAcInput { border: 1px solid var(--dsh-ac-line); border-radius: 6px; background: var(--dsh-ac-bg); color: var(--dsh-ac-text); padding: 8px 11px; }
.dshAcInput::placeholder { color: var(--dsh-ac-muted); opacity: .7; }
.dshAcInput[aria-invalid=true] { border-color: var(--dsw-alias-state-error-primary); }
.dshAcNumber { width: 132px; min-width: 0; font-variant-numeric: tabular-nums; }
.dshAcFieldText { display: block; }
.dshAcFieldText .dshAcFieldControl { margin-top: 10px; flex-direction: column-reverse; align-items: flex-end; gap: 6px; }
.dshAcTextArea { display: block; width: 100%; min-height: 66px; resize: vertical; line-height: 1.6; }
.dshAcInvalid, .dshAcFailed { color: var(--dsw-alias-state-error-primary); font-size: 12px; }
.dshAcFooter { display: flex; justify-content: space-between; align-items: center; gap: 14px; margin-top: 24px; padding: 13px 0; border-top: 1px solid var(--dsh-ac-line); background: var(--dsh-ac-bg); }
.dshAcFooter[data-dirty=true] { position: sticky; z-index: 8; bottom: 0; }
.dshAcFooter > div { display: flex; align-items: center; gap: 8px; }
.dshAcDiscard, .dshAcSave { padding: 7px 13px; border: 1px solid var(--dsh-ac-line); border-radius: 6px; font-size: 12px !important; background: var(--dsh-ac-bg); color: var(--dsh-ac-text); white-space: nowrap; }
.dshAcSave { background: var(--dsh-ac-text); color: var(--dsh-ac-bg); border-color: var(--dsh-ac-text); }
.dshAcDiscard:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dshAcSave:hover:not(:disabled) { opacity: .85; }
.dshAcPanel { padding: 20px 0; border-top: 1px solid var(--dsh-ac-line); }
.dshAcPanelHead { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.dshAcPanelTitle { font-weight: 550; }
.dshAcStats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin: 18px 0; }
.dshAcStats dt { font-size: 11px; color: var(--dsh-ac-muted); }
.dshAcStats dd { margin: 4px 0 0; font-size: 19px; font-weight: 550; font-variant-numeric: tabular-nums; }
.dshAcCodes { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dshAcCode { font: 11px ui-monospace, SFMono-Regular, monospace; border: 1px solid var(--dsh-ac-line); border-radius: 4px; padding: 3px 6px; }
.dshAcPauseList { list-style: none; margin: 0; padding: 0; }
.dshAcPauseList li { display: flex; align-items: center; gap: 12px; padding: 10px 0; }
.dshAcPauseId { flex: 1; font: 12px ui-monospace, SFMono-Regular, monospace; }
@container auto-continue-settings (max-width: 760px) {
  .dshAcHeaderFrame { grid-template-columns: minmax(0, 1fr) auto; gap: 16px; }
  .dshAcRepositoryCopy { display: none; }
  .dshAcRepository { gap: 10px; }
  .dshAcLayout { grid-template-columns: 136px minmax(0, 1fr); }
  .dshAcCategory { padding-left: 20px; }
  .dshAcFieldControl { flex-direction: column-reverse; align-items: flex-end; gap: 6px; }
}
@container auto-continue-settings (max-width: 560px) {
  .dshAcLayout { display: block; min-height: 0; }
  .dshAcNav { flex-direction: row; overflow-x: auto; position: static; padding: 12px 0; border-bottom: 1px solid var(--dsh-ac-line); }
  .dshAcNav > button { flex: none; font-size: 12px; min-height: 34px; padding: 7px 10px; }
  .dshAcCategory { border-left: 0; padding: 20px 0; }
  .dshAcField { gap: 8px 14px; }
  .dshAcLabel { font-size: 13px; }
  .dshAcNumber { width: 98px; }
  .dshAcFooter { align-items: flex-start; flex-direction: column; gap: 10px; }
  .dshAcFooter > div { width: 100%; justify-content: flex-end; }
}
@container auto-continue-settings (max-width: 440px) {
  .dshAcHeaderFrame { gap: 12px; padding: 14px; }
  .dshAcTitleLine { gap: 6px; }
  .dshAcTitleLine h2 { font-size: 15px; white-space: normal; }
  .dshAcStatus { padding: 2px 5px; font-size: 10px; }
  .dshAcIntroduction p { font-size: 11px; }
  .dshAcStar, .dshAcGithubLong { display: none; }
  .dshAcGithubShort { display: inline; }
  .dshAcCard a.dshAcGithub { gap: 6px; padding: 8px; font-size: 11px; }
  .dshAcGithub > svg.dshAcExternal { display: none; }
}
@media (prefers-reduced-motion: reduce) { .dshAcCard a.dshAcGithub { transition: none; } }

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

// src/client/settings-notifications.ts
var pendingPermission;
function prepareSettingsNotification(enabled) {
  try {
    if (typeof Notification === "undefined") return Promise.resolve("unsupported");
    if (!enabled || Notification.permission !== "default") return Promise.resolve(Notification.permission);
    if (!pendingPermission) {
      pendingPermission = Notification.requestPermission().catch(() => "failed").finally(() => {
        pendingPermission = void 0;
      });
    }
    return pendingPermission;
  } catch {
    return Promise.resolve("failed");
  }
}
function showSettingsNotification(notice, locale, permission) {
  const message = `notification.${notice}`;
  if (permission !== "granted") {
    if (notice === "disabled") return message;
    return permission === "unsupported" ? "notification.unsupported" : permission === "failed" ? "notification.failed" : "notification.blocked";
  }
  try {
    const copy = locale.startsWith("en") ? en : zh;
    const notification = new Notification(copy["notification.title"], { body: copy[message] });
    notification.onclick = () => {
      try {
        globalThis.focus?.();
      } catch {
      }
    };
    return message;
  } catch {
    return notice === "disabled" ? message : "notification.failed";
  }
}

// src/client/settings-card.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
injectStyles();
var AutoContinueSettingsCardController = class {
  /**
   * @param scope - the bound settings scope for the `auto-continue` namespace.
   */
  constructor(scope, getLocale) {
    this.scope = scope;
    this.getLocale = getLocale;
    this.composerSaving = false;
    this.composerFailed = false;
    this.disposed = false;
    this.saveSequence = 0;
    this.form = new CardForm(scope, [
      booleanField("paused"),
      booleanField("showComposerToggle"),
      textField("continueText"),
      textField("continueTextMaxTokens"),
      booleanField("resumeSilentTurns"),
      booleanField("resumeCompletedTurns"),
      textField("continueTextLoop"),
      textField("continueTextSilent"),
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
      textField("retryableErrorPatterns"),
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
    this.store = this.form.bind(() => this.projection(), createSnapshotStore);
    this.composer = this.form.bind(() => this.composerProjection(), createSnapshotStore);
  }
  projection() {
    return {
      ...this.form.shell(),
      enabled: !(this.scope.getSnapshot().value?.paused ?? DEFAULT_CONFIG.paused),
      notificationFeedback: this.notificationFeedback,
      paused: this.form.field("paused"),
      showComposerToggle: this.form.field("showComposerToggle"),
      continueText: this.form.field("continueText"),
      continueTextMaxTokens: this.form.field("continueTextMaxTokens"),
      resumeSilentTurns: this.form.field("resumeSilentTurns"),
      resumeCompletedTurns: this.form.field("resumeCompletedTurns"),
      continueTextLoop: this.form.field("continueTextLoop"),
      continueTextSilent: this.form.field("continueTextSilent"),
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
      retryableErrorPatterns: this.form.field("retryableErrorPatterns"),
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
    return { hooks: { autoContinueSettingsCard: this.store }, ...this.form.actions(), save: () => void this.save() };
  }
  async save() {
    const state2 = this.form.shell();
    const snapshot = this.scope.getSnapshot();
    if (this.disposed || !state2.available || !state2.writable || !state2.dirty || state2.invalid || state2.saving || snapshot.mode !== "host") return;
    const sequence = ++this.saveSequence;
    const before = snapshot.value?.notify ?? DEFAULT_CONFIG.notify;
    const target = this.form.field("notify").text;
    const permission = prepareSettingsNotification(target === "" ? DEFAULT_CONFIG.notify : target === "true");
    this.notificationFeedback = void 0;
    if (!await this.form.save() || this.disposed) return;
    const after = this.scope.getSnapshot().value?.notify ?? DEFAULT_CONFIG.notify;
    if (!before && !after) return;
    const result = await permission;
    if (this.disposed || sequence !== this.saveSequence || (this.scope.getSnapshot().value?.notify ?? DEFAULT_CONFIG.notify) !== after) return;
    this.notificationFeedback = showSettingsNotification(before === after ? "saved" : after ? "enabled" : "disabled", this.getLocale(), result);
    this.store.set(this.projection());
  }
  injectComposer() {
    return { hooks: { autoContinueComposer: this.composer }, setEnabled: (enabled) => void this.setEnabled(enabled) };
  }
  composerProjection() {
    const snapshot = this.scope.getSnapshot();
    return {
      visible: snapshot.status === "ready" && (snapshot.value?.showComposerToggle ?? DEFAULT_CONFIG.showComposerToggle),
      enabled: !(snapshot.value?.paused ?? DEFAULT_CONFIG.paused),
      writable: snapshot.status === "ready" && snapshot.writable && snapshot.mode === "host",
      saving: this.composerSaving,
      failed: this.composerFailed
    };
  }
  async setEnabled(enabled) {
    if (this.disposed || this.composerSaving || !this.composerProjection().writable) return;
    this.composerSaving = true;
    this.composerFailed = false;
    this.composer.set(this.composerProjection());
    try {
      const result = await this.scope.set("paused", !enabled);
      this.composerFailed = result === false || this.composerProjection().enabled !== enabled;
    } catch {
      this.composerFailed = true;
    } finally {
      this.composerSaving = false;
      if (!this.disposed) this.composer.set(this.composerProjection());
    }
  }
  /** Release this card's subscription to the provider-owned settings form. */
  dispose() {
    this.disposed = true;
    this.form.dispose();
  }
};
function AutoContinueSettingsPage(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { style: { listStyle: "none", margin: 0, padding: 0 }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(AutoContinueSettingsCard, { ...props }) });
}
var REPOSITORY_URL = "https://github.com/HsiangNianian/dsh-auto-continue";
var groups = [
  { id: "general", fields: ["paused", "showComposerToggle", "resumeSilentTurns", "resumeCompletedTurns", "notify"] },
  { id: "recovery", fields: ["graceMs", "cooldownMs", "maxConsecutive", "classify", "retryableErrorPatterns", "backoffFactor", "backoffMaxMs"] },
  { id: "startup", fields: ["scanOnBoot", "scanLimit", "freshMs"] },
  { id: "prompts", fields: ["continueText", "continueTextMaxTokens", "continueTextSilent", "continueTextLoop", "guardPendingText", "guardDoneText", "loopText"] },
  { id: "safety", fields: ["guardTools", "loopGuard", "loopShortChars", "loopWindowMs", "loopShortCount", "loopRepeatText", "loopToolRepeat"] },
  { id: "status", fields: ["verbose"] }
];
var textDefaults = {
  continueText: "default.continueText",
  continueTextMaxTokens: "default.continueTextMaxTokens",
  continueTextSilent: "default.continueTextSilent",
  continueTextLoop: "default.continueTextLoop",
  guardPendingText: "default.guardPendingText",
  guardDoneText: "default.guardDoneText",
  loopText: "default.loopText"
};
function GitHubMark() {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M12 2.4a9.8 9.8 0 0 0-3.1 19.1c.5.1.7-.2.7-.5v-1.9c-2.8.6-3.4-1.2-3.4-1.2-.5-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 0 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-4.9 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.5 9.5 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.8-2.3 4.6-4.6 4.9.4.3.7.9.7 1.8V21c0 .3.2.6.7.5A9.8 9.8 0 0 0 12 2.4Z" }) });
}
function RepositoryInvite({ t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("aside", { className: "dshAcRepository", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshAcStar", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "m12 3 2.78 5.63L21 9.53l-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z" }) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dshAcRepositoryCopy", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: t("repo.star") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("repo.note") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("a", { className: "dshAcGithub", href: REPOSITORY_URL, target: "_blank", rel: "noopener noreferrer", "aria-label": t("repo.aria"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(GitHubMark, {}),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshAcGithubLong", children: t("repo.link") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshAcGithubShort", children: "GitHub" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: "dshAcExternal", viewBox: "0 0 16 16", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M6 3h7v7M13 3 7 9M11 9v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3" }) })
    ] })
  ] });
}
function SettingField({ name, id, state: state2, actions, disabled, t }) {
  const boolean = typeof DEFAULT_CONFIG[name] === "boolean";
  const numeric = typeof DEFAULT_CONFIG[name] === "number";
  const label = t(`field.${name}`);
  const hint = t(`field.${name}Hint`);
  const value = state2.text === "" ? DEFAULT_CONFIG[name] : state2.text === "true";
  const placeholderKey = textDefaults[name];
  const placeholder = placeholderKey ? t(placeholderKey) : name === "retryableErrorPatterns" ? t("field.retryableErrorPatternsPlaceholder") : String(DEFAULT_CONFIG[name]);
  const common = { id, disabled, "aria-describedby": `${id}-hint`, "aria-invalid": state2.invalid || void 0, value: state2.text, onChange: (event) => actions.edit(name, event.target.value) };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: `dshAcField${!boolean && !numeric ? " dshAcFieldText" : ""}`, "data-field": name, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshAcFieldCopy", children: [
      boolean ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshAcLabel", children: label }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "dshAcLabel", htmlFor: id, children: label }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: state2.invalid ? "dshAcInvalid" : "dshAcHint", id: `${id}-hint`, children: state2.invalid ? t("chrome.invalidNumber") : hint })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshAcFieldControl", children: [
      state2.overridden && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dshAcReset", disabled, "aria-label": `${t("chrome.reset")}: ${label}`, onClick: () => actions.resetField(name), children: t("chrome.reset") }),
      boolean ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshAcSwitchTarget", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        NativeSwitch,
        {
          label,
          title: hint,
          disabled,
          checked: name === "paused" ? !value : Boolean(value),
          onChange: (checked) => actions.edit(name, String(name === "paused" ? !checked : checked))
        }
      ) }) : numeric ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { ...common, className: "dshAcInput dshAcNumber", type: "text", inputMode: "numeric", placeholder }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("textarea", { ...common, className: "dshAcInput dshAcTextArea", rows: name === "retryableErrorPatterns" ? 3 : 2, placeholder })
    ] })
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
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "dshAcPanel", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshAcPanelHead", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshAcPanelTitle", children: t("stats.title") }),
        hasStats ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
      !hasStats ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dshAcHint", children: t("stats.empty") }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("dl", { className: "dshAcStats", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: t("stats.sent") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dd", { children: stats.sent })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: t("stats.recovered") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dd", { children: stats.recovered })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: t("stats.failed") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dd", { children: stats.failed })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: t("stats.skipped") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dd", { children: stats.skipped })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: t("stats.gaveUp") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dd", { children: stats.gaveUp })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: t("stats.looped") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dd", { children: stats.looped })
          ] })
        ] }),
        codes.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshAcCodes", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dshAcHint", children: [
            t("stats.byCode"),
            ":"
          ] }),
          codes.map(([code, count]) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dshAcCode", children: [
            code,
            " ×",
            count
          ] }, code))
        ] }) : null
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "dshAcPanel", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshAcPanelHead", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshAcPanelTitle", children: t("pause.title") }),
        paused.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
      paused.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dshAcHint", children: t("pause.none") }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { className: "dshAcPauseList", children: paused.map((item) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dshAcPauseId", children: [
          item.sessionId.slice(0, 8),
          "…"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dshAcHint", children: [
          Math.max(1, Math.ceil((item.until - Date.now()) / 6e4)),
          " ",
          t("pause.minutes")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
  const [active, setActive] = (0, import_react.useState)("general");
  const prefix = (0, import_react.useId)();
  const group = groups.find((item) => item.id === active);
  if (!state2.available) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { className: "dshAcCard", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("header", { className: "dshAcHeaderFrame", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshAcIntroduction", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshAcTitleLine", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: t("card.title") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshAcStatus", children: t(state2.enabled ? "chrome.enabled" : "chrome.paused") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: t("card.description") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(RepositoryInvite, { t })
    ] }),
    !state2.writable && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dshAcReadOnly", role: "status", children: t("chrome.readOnly") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshAcLayout", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshAcNav", role: "tablist", "aria-label": t("chrome.categories"), children: groups.map((item, index) => {
        const invalid = item.fields.some((name) => state2[name].invalid);
        const title = t(`category.${item.id}.title`);
        return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "button",
          {
            type: "button",
            role: "tab",
            id: `${prefix}-tab-${item.id}`,
            "data-category": item.id,
            "aria-controls": `${prefix}-panel-${item.id}`,
            "aria-selected": active === item.id,
            tabIndex: active === item.id ? 0 : -1,
            "aria-label": invalid ? `${title}: ${t("chrome.invalidNumber")}` : title,
            onClick: () => setActive(item.id),
            onKeyDown: (event) => {
              const offset = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 0;
              if (!offset && event.key !== "Home" && event.key !== "End") return;
              event.preventDefault();
              const next = event.key === "Home" ? 0 : event.key === "End" ? groups.length - 1 : (index + offset + groups.length) % groups.length;
              setActive(groups[next].id);
              const button = event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[next];
              button?.focus();
              button?.scrollIntoView({ block: "nearest", inline: "nearest" });
            },
            children: [
              title,
              invalid && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshAcInvalidMark", "aria-hidden": "true", children: "!" })
            ]
          },
          item.id
        );
      }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "dshAcCategory", role: "tabpanel", id: `${prefix}-panel-${active}`, "aria-labelledby": `${prefix}-tab-${active}`, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshAcCategoryHeading", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { children: t(`category.${active}.title`) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: t(`category.${active}.description`) })
        ] }),
        group.fields.map((name) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SettingField, { name, id: `${prefix}-${name}`, state: state2[name], actions: props, disabled: !state2.writable, t }, name)),
        active === "status" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(LivePanels, { t })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("footer", { className: "dshAcFooter", "data-dirty": state2.dirty, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: state2.failed || state2.invalid ? "dshAcInvalid" : "dshAcHint", role: "status", children: t(state2.failed ? "chrome.saveFailed" : state2.invalid ? "chrome.invalidNumber" : state2.saving ? "chrome.saving" : state2.dirty ? "chrome.unsaved" : state2.notificationFeedback ?? "chrome.saved") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dshAcDiscard", disabled: !state2.dirty || state2.saving, onClick: props.discard, children: t("chrome.discard") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dshAcSave", disabled: !state2.dirty || state2.invalid || state2.saving || !state2.writable, onClick: props.save, children: t(state2.saving ? "chrome.saving" : "chrome.save") })
      ] })
    ] })
  ] });
}

// src/client/composer-toggle.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function AutoContinueComposerToggle(props) {
  const state2 = props.useAutoContinueComposer((snapshot) => snapshot);
  if (!state2.visible) return null;
  const title = props.t(!state2.writable ? "chrome.readOnly" : state2.saving ? "composer.saving" : "composer.scope");
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dshAcComposer", title, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dshAcComposerLabel", children: props.t("composer.label") }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dshAcSwitchTarget", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      NativeSwitch,
      {
        checked: state2.enabled,
        onChange: props.setEnabled,
        disabled: !state2.writable || state2.saving,
        label: props.t("composer.label"),
        title
      }
    ) }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dshAcComposerError", role: "status", children: state2.failed ? props.t("composer.saveFailed") : null })
  ] });
}

// src/client/index.ts
var NS = "auto-continue";
var SETTINGS_NS = "auto-continue";
var inject = ["slots", "locale"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "auto-continue: dictionaries");
  ctx.effect(() => startBridge(), "auto-continue: host bridge");
  ctx.inject(["settingsScope"], (settingsCtx) => {
    mountSettings(settingsCtx, settingsCtx.settingsScope.bind({ namespace: SETTINGS_NS }));
  });
  ctx.inject(["configForms"], (settingsCtx) => {
    const forms = settingsCtx.configForms;
    mountSettings(settingsCtx, forms.get(SETTINGS_NS));
  });
}
function mountSettings(ctx, scope) {
  const MAX_MIRROR_ATTEMPTS = 3;
  let mirroredLocale;
  let mirrorAttempts = 0;
  const syncLocale = () => {
    const active = ctx.locale.getLocale().active;
    const snapshot = scope.getSnapshot();
    if (snapshot.status !== "ready" || !snapshot.writable || snapshot.mode !== "host") return;
    if (mirroredLocale !== active) {
      mirroredLocale = active;
      mirrorAttempts = 0;
    }
    if (snapshot.value?.locale === active) return;
    if (mirrorAttempts >= MAX_MIRROR_ATTEMPTS) return;
    mirrorAttempts += 1;
    void scope.set("locale", active);
  };
  ctx.effect(() => scope.subscribe(syncLocale), "auto-continue: locale settings sync");
  ctx.on("locale/change", syncLocale);
  syncLocale();
  const controller = new AutoContinueSettingsCardController(scope, () => ctx.locale.getLocale().active);
  ctx.effect(() => () => controller.dispose(), "auto-continue: settings form");
  ctx.slots.inject(
    "conversation.input.left",
    () => ctx.slots.register(
      {
        name: "conversation.input.left",
        id: "auto-continue",
        locale: NS,
        inject: () => controller.injectComposer()
      },
      AutoContinueComposerToggle
    )
  );
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
  ctx.slots.inject(
    "plugins.bundle.config",
    () => ctx.slots.register(
      {
        name: "plugins.bundle.config",
        key: "dsh-client-auto-continue",
        locale: NS,
        inject: () => controller.inject()
      },
      AutoContinueSettingsPage
    )
  );
}
//# sourceMappingURL=client.js.map
		return module.exports;
	}
});
