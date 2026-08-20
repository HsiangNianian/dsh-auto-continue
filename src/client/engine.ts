/**
 * Auto-continue engine — browser half core.
 *
 * Watches the two live event streams of the dsh web GUI (mux + host):
 *   - turns ended for a non-human reason (`turn/end` reason ∈ error / interrupted / max-tokens)
 *   - host-reported agent failures with no turn position (`host/agent-error`)
 * After a grace period it sends a queued prompt (default 「继续」) to that
 * session — exactly equivalent to the user typing it manually.
 *
 * All behavior is driven by the `auto-continue` settings namespace (see the
 * plugin's settings card); every knob below is user-configurable there.
 */

import type {
  HostFrame,
  IApiClient,
  MuxFrame,
  SessionId,
  SessionSummary,
} from '@deepseek-ai/dsh-client-connection/client';
import type { SessionEvent } from '@deepseek-ai/dsh-session/types';

/** The `auto-continue` settings section (all fields optional on the wire; the host schema carries defaults). */
export interface AutoContinueSettings {
  /** Text automatically sent after an interruption. */
  continueText?: string;
  /** Text sent when the output token ceiling is reached (same placeholders as `continueText`). */
  continueTextMaxTokens?: string;
  /** Idempotency guard: inspect the last tool call before resuming and steer the model. */
  guardTools?: boolean;
  /** Guard text appended when the last tool call has no confirmed result (it may have partially executed). */
  guardPendingText?: string;
  /** Guard text appended when the last tool call completed successfully (don't rerun it). */
  guardDoneText?: string;
  /** Grace period after an interruption before auto-sending (ms). */
  graceMs?: number;
  /** Minimum interval between two auto-continues per session (ms). */
  cooldownMs?: number;
  /** Max consecutive auto-continues per session before stopping. */
  maxConsecutive?: number;
  /** Scan recently interrupted sessions on page load / reconnect. */
  scanOnBoot?: boolean;
  /** Max sessions the scan checks (most recently updated). */
  scanLimit?: number;
  /** Scan only considers interruptions inside this window (ms). */
  freshMs?: number;
  /** Delay before scanning after a reconnect (ms). */
  reconnectScanDelayMs?: number;
  /** SSE reconnect backoff (ms). */
  reconnectBackoffMs?: number;
  /** Log `[auto-continue]` lines to the browser console. */
  verbose?: boolean;
  /** Classify failures: auto-continue transient errors only; permanent ones (auth/balance/model) are skipped and notified. */
  classify?: boolean;
  /** Cooldown multiplier per consecutive failure (adaptive backoff). */
  backoffFactor?: number;
  /** Cap on the effective backoff interval (ms). */
  backoffMaxMs?: number;
  /** Show browser notifications for auto-continue events. */
  notify?: boolean;
  /** Globally pause auto-continue: no live or scan send, queued pending sends cancelled. */
  paused?: boolean;
  /** Loop guard: detect a running turn spinning in place (short talk without tools, or the same tool repeating) and restart it. */
  loopGuard?: boolean;
  /** A model message shorter than this many chars counts as a "short sentence" (loop signal). */
  loopShortChars?: number;
  /** Consecutive short sentences within this window (ms) with no tool call in between trip the loop guard. */
  loopWindowMs?: number;
  /** Consecutive short sentences trip the loop guard. */
  loopShortCount?: number;
  /** Consecutive identical tool calls with identical arguments AND identical results trip the loop guard. */
  loopToolRepeat?: number;
  /** Consecutive identical short sentences trip the loop guard (strongest spinning signal). */
  loopRepeatText?: number;
  /** Text sent after the loop guard cancels and restarts a turn (supports {tool}). */
  loopText?: string;
}

/** Fully resolved configuration (built-in defaults + user overrides). */
export type AutoContinueConfig = Required<AutoContinueSettings>;

/** Built-in defaults — must match the host schema defaults in src/index.ts. */
export const DEFAULT_CONFIG: AutoContinueConfig = {
  continueText: '继续',
  continueTextMaxTokens: '继续',
  guardTools: true,
  guardPendingText: '(上一步工具「{tool}」可能未完成, 先确认状态再继续, 不要重复执行)',
  guardDoneText: '(上一步工具「{tool}」已完成, 结果: {result}; 不要重复执行, 直接继续)',
  graceMs: 3000,
  cooldownMs: 20000,
  maxConsecutive: 3,
  scanOnBoot: true,
  scanLimit: 8,
  freshMs: 15 * 60 * 1000,
  reconnectScanDelayMs: 5000,
  reconnectBackoffMs: 3000,
  verbose: true,
  classify: true,
  backoffFactor: 2,
  backoffMaxMs: 300000,
  notify: false,
  paused: false,
  loopGuard: true,
  loopShortChars: 40,
  loopWindowMs: 30000,
  loopShortCount: 12,
  loopRepeatText: 4,
  loopToolRepeat: 5,
  loopText: '(检测到你可能陷入循环, 请停止重复刚才的动作, 换一种方式继续)',
};

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Resolve a (possibly partial / not-yet-loaded) settings section to a full config. */
export function resolveConfig(section: AutoContinueSettings | undefined): AutoContinueConfig {
  const value = section ?? {};
  const text =
    typeof value.continueText === 'string' && value.continueText.trim() !== ''
      ? value.continueText
      : DEFAULT_CONFIG.continueText;
  const maxTokensText =
    typeof value.continueTextMaxTokens === 'string' && value.continueTextMaxTokens.trim() !== ''
      ? value.continueTextMaxTokens
      : DEFAULT_CONFIG.continueTextMaxTokens;
  const guardPendingText =
    typeof value.guardPendingText === 'string' && value.guardPendingText.trim() !== ''
      ? value.guardPendingText
      : DEFAULT_CONFIG.guardPendingText;
  const guardDoneText =
    typeof value.guardDoneText === 'string' && value.guardDoneText.trim() !== ''
      ? value.guardDoneText
      : DEFAULT_CONFIG.guardDoneText;
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
    loopWindowMs: Math.max(1000, numberOr(value.loopWindowMs, DEFAULT_CONFIG.loopWindowMs)),
    loopShortCount: Math.max(2, numberOr(value.loopShortCount, DEFAULT_CONFIG.loopShortCount)),
    loopRepeatText: Math.max(2, numberOr(value.loopRepeatText, DEFAULT_CONFIG.loopRepeatText)),
    loopToolRepeat: Math.max(2, numberOr(value.loopToolRepeat, DEFAULT_CONFIG.loopToolRepeat)),
    loopText:
      typeof value.loopText === 'string' && value.loopText.trim() !== ''
        ? value.loopText
        : DEFAULT_CONFIG.loopText,
  };
}

/**
 * 视为「非人为中断」的回合结束原因, 用于启动/重连扫描。
 * - `interrupted` 只由崩溃修复在宿主重载时写入(loop 永不实时发出), 因此仅在扫描路径处理;
 * - 实时事件路径只对 `error` / `max-tokens` 自动续跑;
 * - `aborted`(用户停止)与 `blocked`(策略拒绝)永不自动继续。
 */
type NonHumanReason = 'error' | 'interrupted' | 'max-tokens';

function isNonHumanReason(kind: string): kind is NonHumanReason {
  return kind === 'error' || kind === 'interrupted' || kind === 'max-tokens';
}

/** 一次回合失败的机器可读事实(turn/end error 的 LlmFailure 载荷)。 */
export interface FailureFacts {
  /** 稳定机器路由码(如 UPSTREAM、RATE_LIMIT_EXCEEDED、INVALID_API_KEY)。 */
  code: string;
  /** 人类可读的失败描述。 */
  message: string;
  /** 供应商 HTTP 状态码(可用时)。 */
  status?: number;
}

/**
 * 错误分类: 该失败是否值得自动继续。
 * 永久性失败(认证/余额/模型不存在/上下文超限等)重试也不会成功, 应跳过并通知用户;
 * 其余(网络、超时、5xx、429 等)视为临时性失败, 允许自动恢复。
 */
export function isTransientFailure(failure: FailureFacts): boolean {
  const haystack = `${failure.code} ${failure.message}`.toLowerCase();
  const status = failure.status;
  if (status !== undefined && (status === 401 || status === 403)) return false;
  const permanent =
    /auth|unauthor|forbidden|credential|api[_-]?key|permission/i.test(haystack) ||
    /insufficient.*(balance|quota)|billing|payment|quota.*exceeded.*(?!retry)/i.test(haystack) ||
    /model.*not[_-]?found|unknown[_-]?model|model[_-]?not[_-]?found|not.*support.*model/i.test(haystack) ||
    /context.*(length|limit|overflow|exceed)|token.*limit|max.*context/i.test(haystack) ||
    /invalid[_-]?request|bad[_-]?request/i.test(haystack);
  return !permanent;
}

/**
 * host/agent-error 消息分类: 仅明确属于网络/传输类的临时错误才自动继续。
 * 其余(序列化失败、配置/宿主内部错误等)视为永久性——重试无益, 且用户停止导致的
 * 序列化失败(如 Windows 下 abort 的 DOMException reason)绝不能自动续跑。
 */
export function isTransientAgentError(message: string): boolean {
  return /network|timeout|timed ?out|econn|etimedout|socket|5\d\d|\b429\b|upstream|temporar/i.test(message);
}

/** 通知上的一个操作按钮(action 标识 + 显示文案)。 */
export interface NotifyAction {
  /** 稳定动作标识, 点击时经 onAction 回调传出。 */
  action: string;
  /** 按钮显示文案。 */
  title: string;
}

/** 通知的可选行为: 操作按钮列表与点击回调。 */
export interface NotifyOptions {
  actions?: NotifyAction[];
  onAction?: (action: string) => void;
}

/** 浏览器通知(不可用时静默跳过); 点击通知聚焦窗口, 操作按钮走 onAction。 */
function notify(title: string, body: string, options?: NotifyOptions): void {
  try {
    const N = (globalThis as { Notification?: unknown }).Notification as
      | (new (t: string, o: { body: string; actions?: NotifyAction[] }) => unknown)
      | undefined;
    if (typeof N === 'undefined') return;
    const permission = (N as unknown as { permission?: string }).permission;
    const create = (): void => {
      const instance = new N(title, {
        body,
        ...(options?.actions !== undefined && options.actions.length > 0
          ? { actions: options.actions }
          : {}),
      });
      const target = instance as {
        onclick?: (() => void) | null;
        onaction?: ((event: { action: string }) => void) | null;
      };
      target.onclick = () => {
        try {
          (globalThis as { focus?: () => void }).focus?.();
        } catch {
          /* ignore */
        }
      };
      if (options?.onAction !== undefined) {
        target.onaction = (event) => options.onAction?.(event.action);
      }
    };
    if (permission === 'granted') {
      create();
    } else if (permission === 'default') {
      // 首次使用时请求一次权限, 用户拒绝后不再打扰。
      void (N as unknown as { requestPermission?: () => Promise<string> }).requestPermission?.()
        .then((result) => {
          if (result === 'granted') create();
        })
        .catch(() => {});
    }
  } catch {
    /* 通知失败不影响核心逻辑 */
  }
}

/** 把毫秒格式化为人类可读的经过时长(如 65s → 1m5s)。 */
function formatElapsed(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${s % 60 > 0 ? `${s % 60}s` : ''}`;
}

/** 模板填充所需的上下文(全部可选, 缺失的占位符填为空串)。 */
export interface TemplateContext {
  /** 失败事实(错误码/消息/HTTP 状态), 对应 {code}/{message}/{status}。 */
  facts?: FailureFacts;
  /** 失败前最后一次工具调用的名称, 对应 {tool}。 */
  tool?: string;
  /** 失败回合的编号, 对应 {turn}。 */
  turn?: number;
  /** 连续失败次数(含本次), 对应 {errorCount}。 */
  errorCount?: number;
  /** 会话标题(来自 session.list 投影, 可用时), 对应 {sessionTitle}。 */
  sessionTitle?: string;
  /** 自失败发生以来的毫秒数, 对应 {elapsed}。 */
  elapsedMs?: number;
  /** 上一步工具结果摘要(截断), 对应 {result}(护栏模板用)。 */
  result?: string;
}

/** 用失败事实与回合信息填充 continueText 模板占位符({code}/{message}/{status}/{tool}/{turn}/{errorCount}/{sessionTitle}/{elapsed}/{result})。 */
export function fillTemplate(template: string, ctx: TemplateContext): string {
  return template
    .replace(/\{code\}/g, ctx.facts?.code ?? '')
    .replace(/\{message\}/g, ctx.facts?.message ?? '')
    .replace(/\{status\}/g, ctx.facts?.status !== undefined ? String(ctx.facts.status) : '')
    .replace(/\{tool\}/g, ctx.tool ?? '')
    .replace(/\{turn\}/g, ctx.turn !== undefined ? String(ctx.turn) : '')
    .replace(/\{errorCount\}/g, ctx.errorCount !== undefined ? String(ctx.errorCount) : '')
    .replace(/\{sessionTitle\}/g, ctx.sessionTitle ?? '')
    .replace(/\{elapsed\}/g, formatElapsed(ctx.elapsedMs))
    .replace(/\{result\}/g, ctx.result ?? '');
}

// ---------- 幂等护栏: 上一步工具调用的执行状态 ----------

/** 工具结果摘要的最大长度(护栏模板 {result} 用)。 */
const TOOL_RESULT_CAP = 160;

/** 从任意内容块里递归收集文本(结果为模型可见的工具输出)。 */
function extractText(blocks: unknown, cap: number): string {
  let out = '';
  const walk = (value: unknown): void => {
    if (out.length >= cap) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    const record = value as Record<string, unknown>;
    if (record['type'] === 'text' && typeof record['text'] === 'string') {
      out += record['text'];
      return;
    }
    for (const child of Object.values(record)) walk(child);
  };
  walk(blocks);
  return out.slice(0, cap);
}

/** 上一步工具调用的判定结果: 是否已确认完成, 以及文本摘要。 */
export interface ToolResultFacts {
  /** 工具是否成功完成(内部失败或 isError 视为未成功)。 */
  ok: boolean;
  /** 工具输出的文本摘要(截断)。 */
  excerpt: string;
}

/** 从 tool/result 事件载荷提取成功与否与文本摘要。 */
function toolResultFacts(data: {
  error?: { name?: string; code?: string };
  message?: { content?: Array<{ type?: string; content?: unknown; isError?: boolean }> };
}): ToolResultFacts {
  const failed = data.error !== undefined || data.message?.content?.[0]?.isError === true;
  return { ok: !failed, excerpt: extractText(data.message?.content?.[0]?.content, TOOL_RESULT_CAP) };
}

/** 自适应退避: 同一会话连续失败时的有效冷却间隔。 */
export function effectiveCooldown(
  consecutive: number,
  base: number,
  factor: number,
  max: number,
): number {
  // consecutive = 已连续自动继续的次数; 第 1 次后开始按 factor 递增
  const multiplier = Math.pow(factor, consecutive);
  return Math.min(Math.max(base, base * multiplier), Math.max(base, max));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 浏览器当前 IANA 时区; 不可用时省略(宿主允许省略)。 */
function clientTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** 跨标签页互斥与冷却记录(仅浏览器本地, 不落盘到宿主)。 */
const lockPrefix = 'dsh-auto-continue:';
const lockKey = (sessionId: SessionId) => `${lockPrefix}lock:${sessionId}`;
const stampKey = (sessionId: SessionId) => `${lockPrefix}last:${sessionId}`;

/** 尝试独占本次发送: 两个标签页同时触发时只有一个成功。 */
function claimSend(sessionId: SessionId): boolean {
  try {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(lockKey(sessionId), token);
    return localStorage.getItem(lockKey(sessionId)) === token;
  } catch {
    return true; // 存储不可用(隐私模式等)时放行
  }
}

function releaseSend(sessionId: SessionId): void {
  try {
    localStorage.removeItem(lockKey(sessionId));
  } catch {
    /* ignore */
  }
}

/** 读/写「上次自动发送」时间戳(跨标签页冷却)。 */
function readLastSend(sessionId: SessionId): number {
  try {
    return Number(localStorage.getItem(stampKey(sessionId)) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function writeLastSend(sessionId: SessionId, at: number): void {
  try {
    localStorage.setItem(stampKey(sessionId), String(at));
  } catch {
    /* ignore */
  }
}

// ---------- 会话级暂停(仅浏览器本地, 跨标签页共享) ----------

const pauseKey = (sessionId: SessionId) => `${lockPrefix}pause:${sessionId}`;

/** 暂停某会话: 到 `until` 之前, 引擎不会为该会话自动继续(通知按钮等调用)。 */
export function pauseSession(sessionId: SessionId, ms: number): void {
  try {
    localStorage.setItem(pauseKey(sessionId), String(Date.now() + ms));
  } catch {
    /* ignore */
  }
}

/** 解除某会话的暂停。 */
export function unpauseSession(sessionId: SessionId): void {
  try {
    localStorage.removeItem(pauseKey(sessionId));
  } catch {
    /* ignore */
  }
}

/** 会话暂停的截止时间戳; 0 表示未暂停。 */
export function sessionPauseUntil(sessionId: SessionId): number {
  try {
    return Number(localStorage.getItem(pauseKey(sessionId)) ?? 0) || 0;
  } catch {
    return 0;
  }
}

/** 当前生效(未过期)的暂停会话列表; 顺带清理过期条目。 */
export function pausedSessions(): { sessionId: SessionId; until: number }[] {
  const out: { sessionId: SessionId; until: number }[] = [];
  const now = Date.now();
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key === null || !key.startsWith(`${lockPrefix}pause:`)) continue;
      const sessionId = key.slice(lockPrefix.length + 'pause:'.length) as SessionId;
      const until = Number(localStorage.getItem(key) ?? 0) || 0;
      if (until > now) out.push({ sessionId, until });
      else localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
  return out;
}

// ---------- 统计(仅浏览器本地; 按本地日期分桶, 最多保留 90 天) ----------

/** 一天的自动继续统计。 */
export interface DayStats {
  /** 本地日期 YYYY-MM-DD。 */
  date: string;
  /** 自动发送次数。 */
  sent: number;
  /** 因永久性错误跳过的次数。 */
  skipped: number;
  /** 发送后回合成功完成(恢复成功)的次数。 */
  recovered: number;
  /** 发送后再次失败的次数。 */
  failed: number;
  /** 达到连续上限而停止的次数(按停止事件计)。 */
  gaveUp: number;
  /** loop guard 打断并重启回合的次数。 */
  looped: number;
  /** 按错误码计数的失败分布。 */
  byCode: Record<string, number>;
}

const statsKey = `${lockPrefix}stats`;
const STATS_MAX_DAYS = 90;

function todayKey(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function readStats(): DayStats[] {
  try {
    const raw = localStorage.getItem(statsKey);
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is DayStats =>
        typeof item === 'object' && item !== null && typeof item.date === 'string',
    );
  } catch {
    return [];
  }
}

function writeStats(list: DayStats[]): void {
  try {
    localStorage.setItem(statsKey, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/** 累加今日统计(引擎内部记账)。 */
function bumpStat(delta: {
  sent?: number;
  skipped?: number;
  recovered?: number;
  failed?: number;
  gaveUp?: number;
  looped?: number;
  code?: string;
}): void {
  const list = readStats();
  let day = list.find((item) => item.date === todayKey());
  if (day === undefined) {
    day = { date: todayKey(), sent: 0, skipped: 0, recovered: 0, failed: 0, gaveUp: 0, looped: 0, byCode: {} };
    list.unshift(day);
  }
  if (delta.sent !== undefined) day.sent += delta.sent;
  if (delta.skipped !== undefined) day.skipped += delta.skipped;
  if (delta.recovered !== undefined) day.recovered += delta.recovered;
  if (delta.failed !== undefined) day.failed += delta.failed;
  if (delta.gaveUp !== undefined) day.gaveUp += delta.gaveUp;
  if (delta.looped !== undefined) day.looped += delta.looped;
  if (delta.code !== undefined) day.byCode[delta.code] = (day.byCode[delta.code] ?? 0) + 1;
  writeStats(list.slice(0, STATS_MAX_DAYS));
}

/** 今日统计(设置卡片展示用)。 */
export function readTodayStats(): DayStats {
  const today = todayKey();
  const found = readStats().find((item) => item.date === today);
  return (
    found ?? { date: today, sent: 0, skipped: 0, recovered: 0, failed: 0, gaveUp: 0, looped: 0, byCode: {} }
  );
}

/** 清零今日统计。 */
export function resetTodayStats(): void {
  writeStats(readStats().filter((item) => item.date !== todayKey()));
}

/** 每会话运行时状态。 */
interface SessionState {
  /** 连续自动「继续」次数; 成功回合或用户手动介入后归零。 */
  consecutive: number;
  /** 上次自动「继续」时间戳。 */
  lastAutoAt: number;
  /** 上次自动「继续」尝试(成功或失败)时间戳; 防止失败场景下的快速重试循环。 */
  lastAttemptAt: number;
  /** 我们上次自动发送的文本(用于识别自己的回显)。 */
  lastSentText: string;
  /** 宽限期定时器(进行中的待发送)。 */
  pendingTimer: number | undefined;
  /** 宿主权威 running 位(来自 host/session-status 与回合事件)。 */
  running: boolean | undefined;
  /** 当前排队消息数(来自 session/queue 帧)。 */
  queued: number;
  /** 子代理会话(host/session-added 带 parentSessionId)。 */
  subagent: boolean;
  /** 最近一次回合失败的事实(用于分类与模板填充)。 */
  lastFailure: FailureFacts | undefined;
  /** 最近一次失败的发生时间(模板 {elapsed} 与恢复统计用)。 */
  lastFailureAt: number;
  /** 失败前最后一次工具调用的名称(模板 {tool} 与幂等护栏用)。 */
  lastTool: string | undefined;
  /** 上一步工具调用的结果状态: 'pending' = 已发起未见结果(可能已部分执行)。 */
  lastToolResult: 'pending' | ToolResultFacts | undefined;
  /** 失败回合的编号(模板 {turn})。 */
  lastTurn: number | undefined;
  /** 我们最近一次自动发送的时间戳; 0 = 没有待确认的恢复。 */
  pendingRecoveryAt: number;
  /** 当前连续短句数(loop guard 信号 1: 空转)。 */
  shortRun: number;
  /** 最后一条短句的时间(时间窗判定用)。 */
  lastShortAt: number;
  /** 最后一条模型消息的文本(相同文本重复判定用)。 */
  lastAssistantText: string;
  /** 连续相同文本消息数(最强空转信号, 不限长度)。 */
  sameTextRun: number;
  /**
   * 工具重复信号(loop guard 信号 2: 死循环)。
   * 只有「同工具 + 同参数 + 同结果」的连续调用才累计; 参数或结果有变化视为有进展, 计数重置。
   */
  toolRun:
    | {
        /** 工具名 + 参数(用于判定是否同一调用)。 */
        key: string;
        /** 连续相同调用数(结果确认后更新)。 */
        count: number;
        /** 上次该调用的结果摘要(比较用)。 */
        lastResult: string | undefined;
        /** 本次调用等待结果确认。 */
        waiting: boolean;
      }
    | undefined;
  /** 本回合已触发过 loop guard(防重复打断)。 */
  loopFired: boolean;
  /** 我们主动 cancel 过本回合(区分用户停止)。 */
  loopCancelled: boolean;
}

const freshState = (): SessionState => ({
  consecutive: 0,
  lastAutoAt: 0,
  lastAttemptAt: 0,
  lastSentText: '',
  pendingTimer: undefined,
  running: undefined,
  queued: 0,
  subagent: false,
  lastFailure: undefined,
  lastFailureAt: 0,
  lastTool: undefined,
  lastToolResult: undefined,
  lastTurn: undefined,
  pendingRecoveryAt: 0,
  shortRun: 0,
  lastShortAt: 0,
  lastAssistantText: '',
  sameTextRun: 0,
  toolRun: undefined,
  loopFired: false,
  loopCancelled: false,
});

/** 自动发送后, 在该窗口内出现的回合结束才计入恢复统计。 */
const RECOVERY_WINDOW_MS = 10 * 60 * 1000;

/** 判定一条 user/message 是否是我们自己自动发送的回显。 */
function isOurEcho(state: SessionState, event: SessionEvent): boolean {
  if (event.type !== 'user/message') return false;
  const message = event.data;
  if (message.source.kind !== 'user') return false;
  if (state.lastSentText === '') return false;
  if (Date.now() - state.lastAutoAt > 30000) return false;
  const text = message.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
  return text === state.lastSentText;
}

/** SSE 帧外壳: `{ rpcId, payload }`。 */
type FrameEnvelope<T> = { payload: T };

/**
 * 事件流泵: 带指数退避的 SSE 重连循环。
 * - 从未收到任何帧(宿主未就绪): 退避重试, 不触发扫描
 * - 曾连上后断开: 重连, 并通过 onReconnect 通知外层(宿主可能崩溃重启过)
 */
async function pumpStream<T>(
  open: (signal: AbortSignal) => AsyncIterable<FrameEnvelope<T>>,
  onFrame: (payload: T) => void,
  onReconnect: () => void,
  getBackoff: () => number,
  log: (message: string) => void,
  signal: AbortSignal,
): Promise<void> {
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
      // 从未连上(宿主未就绪): 指数退避重试
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 15000);
      continue;
    }
    // 曾连上后断开 → 重连并触发外层扫描
    backoff = getBackoff();
    onReconnect();
    await sleep(backoff);
  }
}

/** 插件主体: 一条 mux 流 + 一条 host 流 + 启动/重连扫描。 */
export class AutoContinueRunner {
  private readonly states = new Map<SessionId, SessionState>();
  private readonly muxAbort = new AbortController();
  private readonly hostAbort = new AbortController();
  private disposed = false;
  private reconnectScans = 0;

  /**
   * @param api - shared wire client (ctx.connection.api).
   * @param getConfig - read the current resolved configuration (settings scope).
   */
  constructor(
    private readonly api: IApiClient,
    private readonly getConfig: () => AutoContinueConfig,
  ) {
    const config = this.getConfig();
    void this.runMux();
    void this.runHost();
    if (config.scanOnBoot) {
      // 启动时连接可能尚未建立, 循环重试直到成功。
      void this.bootScanLoop();
    }
    this.log(
      `已启动(文本="${config.continueText}", 宽限 ${config.graceMs}ms, ` +
        `冷却 ${config.cooldownMs}ms, 最多连续 ${config.maxConsecutive} 次)`,
    );
  }

  private log(message: string): void {
    if (this.getConfig().verbose) console.info(`[auto-continue] ${message}`);
  }

  dispose(): void {
    this.disposed = true;
    this.muxAbort.abort();
    this.hostAbort.abort();
    for (const state of this.states.values()) {
      if (state.pendingTimer !== undefined) clearTimeout(state.pendingTimer);
    }
    this.states.clear();
  }

  private state(sessionId: SessionId): SessionState {
    let state = this.states.get(sessionId);
    if (state === undefined) {
      state = freshState();
      this.states.set(sessionId, state);
    }
    return state;
  }

  private runMux(): Promise<void> {
    return pumpStream<MuxFrame>(
      (signal) => this.api.events.mux({}, signal),
      (payload) => this.onMuxFrame(payload),
      () => this.scheduleReconnectScan(),
      () => this.getConfig().reconnectBackoffMs,
      (m) => this.log(m),
      this.muxAbort.signal,
    );
  }

  private runHost(): Promise<void> {
    return pumpStream<HostFrame>(
      (signal) => this.api.events.host({}, signal),
      (payload) => this.onHostFrame(payload),
      () => this.scheduleReconnectScan(),
      () => this.getConfig().reconnectBackoffMs,
      (m) => this.log(m),
      this.hostAbort.signal,
    );
  }

  // ---------- mux 帧 ----------

  private onMuxFrame(frame: MuxFrame): void {
    switch (frame.type) {
      case 'session/event':
        if (frame.event.type === 'tool/call') {
          const name = frame.event.data.name;
          if (typeof name === 'string') {
            const state = this.state(frame.sessionId);
            state.lastTool = name;
            state.lastToolResult = 'pending'; // 已发起, 尚未见结果
            // loop guard 信号 2: 同工具+同参数才可能是循环; 参数变化 = 有进展
            // (工具调用本身也重置短句信号)。计数在结果确认后才推进。
            state.shortRun = 0;
            const key = `${name}\n${frame.event.data.arguments}`;
            if (state.toolRun?.key === key) {
              state.toolRun.waiting = true; // 结果到达时与上次结果比较
            } else {
              state.toolRun = { key, count: 1, lastResult: undefined, waiting: false };
            }
          }
        } else if (frame.event.type === 'tool/result') {
          const state = this.state(frame.sessionId);
          if (state.lastToolResult === 'pending') {
            const facts = toolResultFacts(frame.event.data);
            state.lastToolResult = facts;
            // 结果确认: 与上次相同 → 计数推进; 不同 → 有进展, 重置
            const run = state.toolRun;
            if (run !== undefined && run.waiting) {
              run.waiting = false;
              if (run.lastResult !== undefined && run.lastResult === facts.excerpt) {
                run.count += 1;
                this.checkLoop(frame.sessionId, state);
              } else {
                run.lastResult = facts.excerpt;
                run.count = 1;
              }
            } else if (run !== undefined && !run.waiting) {
              run.lastResult = facts.excerpt;
            }
          }
        } else if (frame.event.type === 'assistant/message') {
          const state = this.state(frame.sessionId);
          this.onAssistantMessage(frame.sessionId, state, frame.event);
        }
        this.onSessionEvent(frame.sessionId, frame.event);
        break;
      case 'session/queue':
        this.state(frame.sessionId).queued = frame.items.length;
        if (frame.items.length > 0) this.cancelPending(frame.sessionId, '出现排队消息');
        break;
      case 'stream/error':
        this.log(`mux stream/error: ${frame.error.code} ${frame.error.message}`);
        break;
      default:
        break; // session/subscribed、approval/*、question/*、session/jobs、session/projection 与本插件无关
    }
  }

  /** 从 assistant/message 事件提取纯文本。 */
  private assistantText(event: SessionEvent<'assistant/message'>): string {
    const content = event.data.message.content;
    if (!Array.isArray(content)) return '';
    return content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('');
  }

  /**
   * loop guard 信号 1(空转): 时间窗内连续短句且期间无工具调用。
   * 短句 = 模型消息文本短于 loopShortChars; 长句、工具调用、或短句间隔超过
   * loopWindowMs(正常思考的短文本散布在长时间里)都会重置计数。
   */
  private onAssistantMessage(
    sessionId: SessionId,
    state: SessionState,
    event: SessionEvent<'assistant/message'>,
  ): void {
    if (!this.getConfig().loopGuard) return;
    const text = this.assistantText(event);
    const trimmed = text.trim();
    // 相同文本重复(不限长度): 模型反复输出完全相同的消息是最强的循环信号,
    // 例如 "Let me test variants of the regex..." 连续 7 遍
    if (trimmed !== '' && trimmed === state.lastAssistantText) {
      state.sameTextRun += 1;
    } else {
      state.lastAssistantText = trimmed;
      state.sameTextRun = 1;
    }
    // 短句计数(长度 < loopShortChars 且落在时间窗内): 空转信号
    if (trimmed.length < this.getConfig().loopShortChars) {
      const now = Date.now();
      if (now - state.lastShortAt > this.getConfig().loopWindowMs) {
        state.shortRun = 0; // 超过时间窗: 上一次短句太久远, 不算连续
      }
      state.shortRun += 1;
      state.lastShortAt = now;
    } else {
      state.shortRun = 0; // 长句 = 有实际输出, 重置
      state.lastShortAt = 0;
    }
    this.checkLoop(sessionId, state);
  }

  /** 两个循环信号的公共检查; 命中且本回合未打断过则打断。 */
  private checkLoop(sessionId: SessionId, state: SessionState): void {
    if (!this.getConfig().loopGuard) return;
    if (state.loopFired) return;
    if (!state.running) return; // 只干预运行中的回合
    const config = this.getConfig();
    if (state.sameTextRun >= config.loopRepeatText) {
      this.log(`检测到空转循环 ${sessionId}: 连续 ${state.sameTextRun} 条相同消息`);
      void this.interruptLoop(sessionId, state);
    } else if (state.shortRun >= config.loopShortCount) {
      this.log(`检测到空转循环 ${sessionId}: 连续 ${state.shortRun} 条短句且无工具调用`);
      void this.interruptLoop(sessionId, state);
    } else if (state.toolRun !== undefined && state.toolRun.count >= config.loopToolRepeat) {
      const toolName = state.toolRun.key.split('\n')[0] ?? '?';
      this.log(`检测到工具死循环 ${sessionId}: 「${toolName}」连续 ${state.toolRun.count} 次(同参数同结果)`);
      void this.interruptLoop(sessionId, state);
    }
  }

  /**
   * 打断运行中的回合: cancel(带来源标记)+ 进冷却。
   * 随后的 turn/end aborted 会因 loopCancelled 走「可恢复中断」路径,
   * 用 loopText 重启回合——不会与用户手动停止混淆。
   */
  private async interruptLoop(sessionId: SessionId, state: SessionState): Promise<void> {
    if (state.loopFired) return;
    // 打断本身受冷却约束: 距上次打断/发送太近时不再打断, 防止反复打断刷屏
    if (Date.now() - state.lastAttemptAt < this.cooldownFor(state)) {
      this.log(`跳过循环打断 ${sessionId}: 处于冷却期`);
      return;
    }
    state.loopFired = true;
    state.loopCancelled = true;
    state.lastAttemptAt = Date.now(); // 打断计入冷却, 防反复打断
    bumpStat({ looped: 1 });
    try {
      const response = await this.api.sessions.cancel({ sessionId });
      this.log(
        `已打断循环 ${sessionId}: ${response.result.ok ? 'cancel 已受理' : 'cancel 被拒绝'}`,
      );
    } catch (error) {
      this.log(`打断循环失败 ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
      state.loopCancelled = false;
    }
  }

  private onSessionEvent(sessionId: SessionId, event: SessionEvent): void {
    const state = this.state(sessionId);
    switch (event.type) {
      case 'turn/start':
        state.running = true;
        // 新回合开始: 清空上一步工具调用状态, 避免跨回合误用护栏
        state.lastTool = undefined;
        state.lastToolResult = undefined;
        // loop guard 状态按回合重置
        state.shortRun = 0;
        state.lastShortAt = 0;
        state.lastAssistantText = '';
        state.sameTextRun = 0;
        state.toolRun = undefined;
        state.loopFired = false;
        state.loopCancelled = false;
        this.cancelPending(sessionId, '宿主自行开启新回合');
        break;
      case 'turn/end': {
        state.running = false;
        this.cancelPending(sessionId, '收到新的 turn/end');
        const reason = event.data.reason;
        if (reason.kind === 'completed') {
          // 成功回合: 恢复健康状态, 并确认上一次自动发送的效果
          state.consecutive = 0;
          state.lastFailure = undefined;
          this.noteRecovery(sessionId, 'completed');
        } else if (reason.kind === 'aborted') {
          if (state.loopCancelled) {
            // 我们自己的 loop guard 打断: 视为可恢复中断, 用循环提示文本重启回合。
            // 重启不受冷却限制(冷却约束的是"再次打断")。
            state.loopCancelled = false;
            state.loopFired = false;
            state.consecutive = 0;
            state.pendingRecoveryAt = 0;
            state.shortRun = 0;
            state.lastShortAt = 0;
            state.lastAssistantText = '';
            state.sameTextRun = 0;
            state.toolRun = undefined;
            state.lastAttemptAt = 0;
            this.schedule(sessionId, 'loop:aborted');
          } else {
            // 用户主动停止: 不自动继续, 视为用户介入
            state.consecutive = 0;
            state.pendingRecoveryAt = 0;
          }
        } else if (reason.kind === 'blocked') {
          // 策略拒绝: 不自动继续
        } else if (reason.kind === 'interrupted') {
          // 实时路径的 interrupted 仅来自崩溃修复重载(loop 从不实时发出);
          // 用户手动停止在 DSH 中标记为 aborted, 不走到这里。实时流里出现
          // interrupted 视为异常中断, 不自动继续——宿主崩溃孤儿回合由扫描恢复。
          state.consecutive = 0;
          state.pendingRecoveryAt = 0;
        } else if (reason.kind === 'error') {
          // 记录失败事实(分类与模板填充用), 然后按类型处理
          const error = reason.error;
          state.lastFailure = {
            code: typeof error.code === 'string' ? error.code : 'UNKNOWN',
            message: typeof error.message === 'string' ? error.message : String(error),
            ...(typeof error.status === 'number' ? { status: error.status } : {}),
          };
          state.lastTurn = event.data.turn;
          state.lastFailureAt = Date.now();
          this.noteRecovery(sessionId, 'error');
          this.onTurnFailure(sessionId, 'turn/end:error', state.lastFailure);
        } else if (reason.kind === 'max-tokens') {
          state.lastFailureAt = Date.now();
          this.noteRecovery(sessionId, 'error');
          this.schedule(sessionId, 'turn/end:max-tokens');
        }
        break;
      }
      case 'user/message':
        if (isOurEcho(state, event)) break; // 我们自己的回显
        if (event.data.source.kind === 'user') {
          // 用户手动介入
          state.consecutive = 0;
          this.cancelPending(sessionId, '用户手动发送消息');
        }
        break;
      default:
        break;
    }
  }

  // ---------- host 帧 ----------

  private onHostFrame(frame: HostFrame): void {
    switch (frame.type) {
      case 'host/session-status':
        this.state(frame.sessionId).running = frame.running;
        if (frame.running) this.cancelPending(frame.sessionId, '宿主报告会话开始运行');
        break;
      case 'host/session-added':
        this.state(frame.sessionId).subagent = frame.parentSessionId !== undefined;
        break;
      case 'host/agent-error':
        if (this.state(frame.sessionId).subagent) break;
        this.log(`host/agent-error(${frame.sessionId}): ${frame.message}`);
        // agent-error 的「仅网络/超时类自动续跑」是无条件安全承诺(与 classify 开关无关):
        // 序列化失败等永久性 agent 错误(包括用户停止的连带 DOMException)绝不能自动续跑,
        // 否则会退回「用户停止被误续跑」的场景(issue #2)。
        if (!isTransientAgentError(frame.message)) {
          // 永久性 agent 错误(序列化失败/配置错误等): 跳过并通知, 避免把用户停止等
          // 场景误判为可恢复中断后自动续跑。
          this.log(`跳过 ${frame.sessionId}: 永久性 agent 错误 — ${frame.message}`);
          bumpStat({ skipped: 1 });
          if (this.getConfig().notify) {
            notify(
              'dsh-auto-continue: 未自动继续',
              `${frame.sessionId}: 永久性 agent 错误 ${frame.message.slice(0, 120)}`,
              this.notifyOptions(frame.sessionId),
            );
          }
          break;
        }
        this.schedule(frame.sessionId, 'host/agent-error');
        break;
      case 'host/session-removed':
        this.cancelPending(frame.sessionId, '会话已移除');
        this.states.delete(frame.sessionId);
        break;
      default:
        break;
    }
  }

  // ---------- 调度 ----------

  /** 回合失败入口: 先做错误分类, 永久性失败跳过并通知, 临时性失败走正常调度。 */
  private onTurnFailure(sessionId: SessionId, reason: string, failure: FailureFacts): void {
    const config = this.getConfig();
    if (config.classify && !isTransientFailure(failure)) {
      const summary = `${failure.code}${failure.status !== undefined ? ` (HTTP ${failure.status})` : ''}`;
      this.log(`跳过 ${sessionId}(${reason}): 永久性失败 ${summary} — ${failure.message}`);
      bumpStat({ skipped: 1, code: failure.code });
      if (config.notify) {
        notify(
          'dsh-auto-continue: 未自动继续',
          `${sessionId}: 永久性错误 ${summary}，需要人工处理`,
          this.notifyOptions(sessionId),
        );
      }
      return;
    }
    this.schedule(sessionId, reason);
  }

  /** 通知操作按钮与回调(「立即续跑」/「暂停该会话 1 小时」)。 */
  private notifyOptions(sessionId: SessionId): NotifyOptions {
    return {
      actions: [
        { action: 'resume', title: '立即续跑' },
        { action: 'pause1h', title: '暂停该会话 1 小时' },
      ],
      onAction: (action) => this.onNotifyAction(sessionId, action),
    };
  }

  private onNotifyAction(sessionId: SessionId, action: string): void {
    if (action === 'resume') {
      this.log(`通知按钮: 立即续跑 ${sessionId}`);
      void this.resumeNow(sessionId);
    } else if (action === 'pause1h') {
      this.log(`通知按钮: 暂停 ${sessionId} 1 小时`);
      pauseSession(sessionId, 60 * 60 * 1000);
      this.cancelPending(sessionId, '通知按钮暂停该会话');
    }
  }

  /** 恢复结果记账: 自动发送后窗口内的回合结束, 判定恢复成功或失败。 */
  private noteRecovery(sessionId: SessionId, outcome: 'completed' | 'error'): void {
    const state = this.state(sessionId);
    if (state.pendingRecoveryAt === 0) return;
    if (Date.now() - state.pendingRecoveryAt > RECOVERY_WINDOW_MS) {
      state.pendingRecoveryAt = 0; // 窗口过期, 不再归属这次发送
      return;
    }
    state.pendingRecoveryAt = 0;
    bumpStat(outcome === 'completed' ? { recovered: 1 } : { failed: 1 });
    this.log(`恢复结果(${sessionId}): ${outcome === 'completed' ? '成功' : '失败'}`);
  }

  /** 立即为该会话发送一次自动继续(无视冷却与连续上限; 由通知按钮触发)。 */
  async resumeNow(sessionId: SessionId): Promise<void> {
    if (this.disposed) return;
    const state = this.state(sessionId);
    if (state.subagent) return;
    if (state.pendingTimer !== undefined) {
      clearTimeout(state.pendingTimer);
      state.pendingTimer = undefined;
    }
    await this.fire(sessionId, 'manual:notification', true);
  }

  /** 本会话当前生效的冷却间隔(自适应退避)。 */
  private cooldownFor(state: SessionState): number {
    const config = this.getConfig();
    return effectiveCooldown(
      state.consecutive,
      config.cooldownMs,
      config.backoffFactor,
      config.backoffMaxMs,
    );
  }

  private schedule(sessionId: SessionId, reason: string): void {
    const state = this.state(sessionId);
    const config = this.getConfig();
    if (state.subagent) return; // 子代理会话由父代理处理, 不抢跑
    if (config.paused) {
      this.log(`跳过 ${sessionId}(${reason}): 全局暂停中`);
      return;
    }
    if (Date.now() < sessionPauseUntil(sessionId)) {
      this.log(`跳过 ${sessionId}(${reason}): 会话暂停中`);
      return;
    }
    if (state.pendingTimer !== undefined) return; // 已有待发送
    if (Date.now() - state.lastAttemptAt < this.cooldownFor(state)) return; // 冷却期(含失败尝试, 自适应退避)
    if (state.consecutive >= config.maxConsecutive) {
      this.log(
        `跳过 ${sessionId}(${reason}): 已连续自动继续 ${state.consecutive} 次, 等待用户介入或成功回合`,
      );
      return;
    }
    if (state.queued > 0) return; // 已有排队消息, 宿主会自行唤醒
    const timer = setTimeout(() => {
      if (state.pendingTimer !== timer) return;
      state.pendingTimer = undefined;
      void this.fire(sessionId, reason);
    }, config.graceMs);
    state.pendingTimer = timer;
    const template = reason.startsWith('loop:')
      ? config.loopText
      : reason.includes('max-tokens')
        ? config.continueTextMaxTokens
        : config.continueText;
    this.log(
      `检测到非人为中断 ${sessionId}(${reason}), ${config.graceMs}ms 后自动发送「${template}」`,
    );
  }

  private cancelPending(sessionId: SessionId, why: string): void {
    const state = this.state(sessionId);
    if (state.pendingTimer === undefined) return;
    clearTimeout(state.pendingTimer);
    state.pendingTimer = undefined;
    this.log(`取消 ${sessionId} 的自动继续(${why})`);
  }

  private async fire(sessionId: SessionId, reason: string, force = false): Promise<void> {
    if (this.disposed) return;
    const state = this.state(sessionId);
    const config = this.getConfig();
    // 权威 running 检查: 优先用 host 帧, 未知时回退到 session.list
    if (state.running === undefined) {
      const running = await this.runningViaList(sessionId);
      if (running === undefined || running) {
        this.log(`跳过 ${sessionId}: 无法确认空闲(${running === undefined ? '未知' : '运行中'})`);
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
    // 跨标签页冷却(自适应退避); 通知按钮的强制续跑不受冷却约束
    if (!force && Date.now() - readLastSend(sessionId) < this.cooldownFor(state)) {
      this.log(`跳过 ${sessionId}: 其他标签页刚发送过`);
      return;
    }
    if (!claimSend(sessionId)) {
      this.log(`跳过 ${sessionId}: 其他标签页正在发送`);
      return;
    }
    // 模板填充: continueText 可含 {code}/{message}/{status}/{tool}/{turn}/{errorCount}/{sessionTitle}/{elapsed} 占位符
    const template = reason.startsWith('loop:')
      ? config.loopText
      : reason.includes('max-tokens')
        ? config.continueTextMaxTokens
        : config.continueText;
    let sessionTitle: string | undefined;
    if (template.includes('{sessionTitle}')) {
      sessionTitle = this.titles.get(sessionId);
      if (sessionTitle === undefined) {
        const info = await this.fetchSessionInfo(sessionId);
        sessionTitle = info?.title;
      }
    }
    const text = this.buildContinueText(config, state, template, sessionTitle);
    const zone = clientTimeZone();
    state.lastAttemptAt = Date.now(); // 先记账: 无论成败, 本次尝试都进入冷却
    try {
      const response = await this.api.sessions.prompt({
        sessionId,
        mode: 'queue',
        content: [{ type: 'text', text }],
        ...(zone === undefined ? {} : { clientTimeZone: zone }),
      });
      if (response.result.ok) {
        const now = Date.now();
        state.consecutive += 1;
        state.lastAutoAt = now;
        state.lastSentText = text;
        state.pendingRecoveryAt = now; // 等待窗口内的下一个回合结束来判定恢复结果
        writeLastSend(sessionId, now);
        bumpStat({ sent: 1, ...(state.lastFailure !== undefined ? { code: state.lastFailure.code } : {}) });
        this.log(`已自动发送「${text}」到 ${sessionId}(${reason}), 第 ${state.consecutive} 次连续`);
        if (config.notify) {
          notify(
            'dsh-auto-continue: 已自动继续',
            `${sessionId}: 已发送「${text}」(第 ${state.consecutive} 次连续)`,
            this.notifyOptions(sessionId),
          );
        }
        if (state.consecutive >= config.maxConsecutive) {
          bumpStat({ gaveUp: 1 });
          this.log(`达到连续上限 ${config.maxConsecutive} 次, 停止自动继续 ${sessionId}`);
          if (config.notify) {
            notify(
              'dsh-auto-continue: 已停止自动继续',
              `${sessionId}: 连续失败 ${state.consecutive} 次, 需要人工介入`,
              this.notifyOptions(sessionId),
            );
          }
        }
      } else {
        this.log(
          `发送失败 ${sessionId}: ${response.result.error.code} ${response.result.error.message}`,
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
  private buildContinueText(
    config: AutoContinueConfig,
    state: SessionState,
    template: string,
    sessionTitle: string | undefined,
  ): string {
    let text = fillTemplate(template, {
      facts: state.lastFailure,
      tool: state.lastTool,
      turn: state.lastTurn,
      errorCount: state.consecutive + 1,
      sessionTitle,
      elapsedMs: state.lastFailureAt > 0 ? Date.now() - state.lastFailureAt : undefined,
    });
    if (!config.guardTools) return text;
    const guard = this.currentGuard(state);
    if (guard.kind === 'pending') {
      text += ` ${fillTemplate(config.guardPendingText, { tool: guard.tool, result: guard.result })}`;
    } else if (guard.kind === 'done') {
      text += ` ${fillTemplate(config.guardDoneText, { tool: guard.tool, result: guard.result })}`;
    }
    return text;
  }

  /** 上一步工具调用的护栏状态(实时路径, 由 mux 帧维护)。 */
  private currentGuard(state: SessionState): {
    kind: 'none' | 'pending' | 'done' | 'failed';
    tool?: string;
    result?: string;
  } {
    if (state.lastTool === undefined || state.lastToolResult === undefined) return { kind: 'none' };
    if (state.lastToolResult === 'pending') return { kind: 'pending', tool: state.lastTool };
    if (state.lastToolResult.ok) {
      return { kind: 'done', tool: state.lastTool, result: state.lastToolResult.excerpt };
    }
    return { kind: 'failed', tool: state.lastTool };
  }

  /** 会话标题缓存(来自 session.list 投影, {sessionTitle} 占位符用)。 */
  private readonly titles = new Map<SessionId, string>();

  /** 查一次 session.list, 顺带缓存该会话的标题。 */
  private async fetchSessionInfo(
    sessionId: SessionId,
  ): Promise<{ running: boolean | undefined; title: string | undefined } | undefined> {
    try {
      const response = await this.api.sessions.list({});
      if (!response.result.ok) return undefined;
      const item = response.result.value.items.find(
        (summary: SessionSummary) => summary.sessionId === sessionId,
      );
      if (item === undefined) return undefined;
      // `title` 投影由 @deepseek-ai/dsh-session-title 声明; 此处用局部断言避免引入额外依赖。
      const title = (item.projections?.values as { title?: string | null } | undefined)?.title;
      if (typeof title === 'string' && title !== '') this.titles.set(sessionId, title);
      return { running: item.running, title: typeof title === 'string' ? title : undefined };
    } catch {
      return undefined;
    }
  }

  private async runningViaList(sessionId: SessionId): Promise<boolean | undefined> {
    const info = await this.fetchSessionInfo(sessionId);
    return info?.running;
  }

  // ---------- 启动/重连扫描 ----------

  private scheduleReconnectScan(): void {
    this.reconnectScans += 1;
    const scan = this.reconnectScans;
    setTimeout(() => {
      if (scan !== this.reconnectScans || this.disposed) return;
      void this.scanLoop(6, this.getConfig().reconnectScanDelayMs);
    }, this.getConfig().reconnectScanDelayMs);
  }

  private async bootScanLoop(): Promise<void> {
    await this.scanLoop(Infinity, 3000);
  }

  /** 反复尝试扫描, 直到成功(宿主就绪)或达到次数上限。 */
  private async scanLoop(attempts: number, delayMs: number): Promise<void> {
    for (let attempt = 0; attempt < attempts && !this.disposed; attempt += 1) {
      try {
        if (await this.scanInterrupted()) return;
      } catch (error) {
        if (this.disposed) return;
        // 宿主未就绪时每 3s 重试; 只节流记录日志, 避免刷屏。
        if (attempt % 10 === 0) {
          this.log(
            `扫描失败(${attempt + 1}/${attempts === Infinity ? '∞' : attempts}): ${
              error instanceof Error ? error.message : String(error)
            }`,
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
  private async scanInterrupted(): Promise<boolean> {
    const config = this.getConfig();
    if (config.paused) return true; // 全局暂停: 不做任何扫描
    const response = await this.api.sessions.list({});
    if (!response.result.ok) return false;
    const items = response.result.value.items;
    for (const summary of items) {
      const title = (summary.projections?.values as { title?: string | null } | undefined)?.title;
      if (typeof title === 'string' && title !== '') this.titles.set(summary.sessionId, title);
    }
    const candidates = items
      .filter((summary) => !summary.running && summary.parentSessionId === undefined)
      .slice(0, config.scanLimit);
    const now = Date.now();
    for (const summary of candidates) {
      if (this.disposed) return true;
      const state = this.state(summary.sessionId);
      if (state.pendingTimer !== undefined) continue;
      if (state.consecutive >= config.maxConsecutive) continue;
      if (now - state.lastAttemptAt < this.cooldownFor(state)) continue;
      if (now < sessionPauseUntil(summary.sessionId)) continue; // 会话暂停中
      let events;
      try {
        const page = await this.api.sessions.history({
          sessionId: summary.sessionId,
          maxMessages: 30,
        });
        if (!page.result.ok) continue;
        events = page.result.value.events;
      } catch {
        continue; // 会话可能刚被移除
      }
      // 从尾部找最后一个 turn/end(在分支内完成收窄)
      let lastEnd: SessionEvent<'turn/end'> | undefined;
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const event = events[i]?.event;
        if (event !== undefined && event.type === 'turn/end') {
          lastEnd = event;
          break;
        }
      }
      if (lastEnd === undefined) continue;
      const reason = lastEnd.data.reason;
      if (!isNonHumanReason(reason.kind)) continue;
      if (lastEnd.time < now - config.freshMs) continue; // 太久远, 不翻旧账
      // 该 turn/end 之后不能有新回合或用户消息(说明已被处理)
      let superseded = false;
      for (const entry of events) {
        const event = entry.event;
        if (event.seq <= lastEnd.seq) continue;
        if (event.type === 'turn/start') superseded = true;
        if (event.type === 'user/message' && event.data.source.kind === 'user') superseded = true;
        if (superseded) break;
      }
      if (superseded) continue;
      // 幂等护栏: 从历史事件里重建上一步工具调用的执行状态
      this.applyGuardFromEvents(state, events, lastEnd.seq);
      this.log(`扫描发现中断 ${summary.sessionId}(turn/end:${reason.kind}), 安排自动继续`);
      this.schedule(summary.sessionId, `scan:turn/end:${reason.kind}`);
    }
    return true;
  }

  /** 从历史事件恢复上一步工具调用状态(扫描路径的幂等护栏)。 */
  private applyGuardFromEvents(
    state: SessionState,
    events: { event: SessionEvent }[],
    untilSeq: number,
  ): void {
    state.lastTool = undefined;
    state.lastToolResult = undefined;
    let call: SessionEvent<'tool/call'> | undefined;
    for (const entry of events) {
      const event = entry.event;
      if (event.seq >= untilSeq) continue;
      if (event.type === 'tool/call') call = event;
    }
    if (call === undefined) return;
    state.lastTool = call.data.name;
    state.lastToolResult = 'pending';
    for (const entry of events) {
      const event = entry.event;
      if (event.seq <= call.seq || event.seq >= untilSeq) continue;
      if (event.type === 'tool/result') {
        state.lastToolResult = toolResultFacts(event.data);
        break;
      }
    }
  }
}
