/** 共享核心: 平台无关的纯逻辑与类型。
 *
 * 被 host 引擎(src/host/engine.ts)与浏览器半侧共用: 配置解析、错误分类、
 * 模板填充、自适应退避、幂等护栏的工具结果提取、循环守卫的会话状态机,
 * 以及回显识别。引擎迁入 host 后(0.8.0), 浏览器半侧只 re-export 本模块。
 */
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session/types';

/** Supported UI/config locales. Any unknown browser locale falls back to Chinese. */
export type AutoContinueLocale = 'en' | 'zh';

/** Locale-owned defaults for the user-editable text fields. */
export const LOCALIZED_TEXT_DEFAULTS = {
  zh: {
    continueText: '继续',
    continueTextMaxTokens: '继续',
    guardPendingText: '(上一步工具「{tool}」可能未完成, 先确认状态再继续, 不要重复执行)',
    guardDoneText: '(上一步工具「{tool}」已完成, 结果: {result}; 不要重复执行, 直接继续)',
    loopText: '(检测到你可能陷入循环, 请停止重复刚才的动作, 换一种方式继续)',
  },
  en: {
    continueText: 'Continue',
    continueTextMaxTokens: 'Continue',
    guardPendingText:
      '(The previous tool "{tool}" may not have completed. Check its state before continuing and do not run it again.)',
    guardDoneText:
      '(The previous tool "{tool}" completed successfully. Result: {result}; do not run it again. Continue from there.)',
    loopText:
      '(You may be stuck in a loop. Stop repeating the last action and continue with a different approach.)',
  },
} as const satisfies Record<AutoContinueLocale, Record<string, string>>;

/** The `auto-continue` settings section (all fields optional on the wire; the host schema carries defaults). */
export interface AutoContinueSettings {
  /** Active browser/UI locale mirrored by the client. */
  locale?: AutoContinueLocale;
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
  /** Log `[auto-continue]` lines to the browser console. */
  verbose?: boolean;
  /** Classify failures: auto-continue transient errors only; permanent ones (auth/balance/model) are skipped and notified. */
  classify?: boolean;
  /** Provider-specific message/code/status fragments that explicitly count as retryable, one literal per line. */
  retryableErrorPatterns?: string;
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

/** Effective built-in defaults; localized text fields use Chinese until a browser locale is mirrored. */
export const DEFAULT_CONFIG: AutoContinueConfig = {
  locale: 'zh',
  ...LOCALIZED_TEXT_DEFAULTS.zh,
  guardTools: true,
  graceMs: 3000,
  cooldownMs: 20000,
  maxConsecutive: 3,
  scanOnBoot: true,
  scanLimit: 8,
  freshMs: 15 * 60 * 1000,
  verbose: true,
  classify: true,
  retryableErrorPatterns: '',
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
  const locale: AutoContinueLocale = value.locale === 'en' ? 'en' : 'zh';
  const localized = LOCALIZED_TEXT_DEFAULTS[locale];
  const text =
    typeof value.continueText === 'string' && value.continueText.trim() !== ''
      ? value.continueText
      : localized.continueText;
  const maxTokensText =
    typeof value.continueTextMaxTokens === 'string' && value.continueTextMaxTokens.trim() !== ''
      ? value.continueTextMaxTokens
      : localized.continueTextMaxTokens;
  const guardPendingText =
    typeof value.guardPendingText === 'string' && value.guardPendingText.trim() !== ''
      ? value.guardPendingText
      : localized.guardPendingText;
  const guardDoneText =
    typeof value.guardDoneText === 'string' && value.guardDoneText.trim() !== ''
      ? value.guardDoneText
      : localized.guardDoneText;
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
    retryableErrorPatterns:
      typeof value.retryableErrorPatterns === 'string'
        ? value.retryableErrorPatterns.trim()
        : DEFAULT_CONFIG.retryableErrorPatterns,
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
        : localized.loopText,
  };
}

/**
 * 视为「非人为中断」的回合结束原因, 用于启动/重连扫描。
 * - `interrupted` 只由崩溃修复在宿主重载时写入(loop 永不实时发出), 因此仅在扫描路径处理;
 * - 实时事件路径只对 `error` / `max-tokens` 自动续跑;
 * - `aborted`(用户停止)与 `blocked`(策略拒绝)永不自动继续。
 */
type NonHumanReason = 'error' | 'interrupted' | 'max-tokens';

export function isNonHumanReason(kind: string): kind is NonHumanReason {
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
 * 用户填写的 provider 专属文本片段优先覆盖内置结果; 未命中时,
 * 永久性失败(认证/余额/模型不存在/上下文超限等)重试也不会成功, 应跳过并通知用户;
 * 其余(网络、超时、5xx、429 等)视为临时性失败, 允许自动恢复。
 */
export function isTransientFailure(failure: FailureFacts, retryableErrorPatterns = ''): boolean {
  const haystack = `${failure.code} ${failure.status ?? ''} ${failure.message}`.toLowerCase();
  const explicitlyRetryable = retryableErrorPatterns
    .split(/\r?\n/)
    .map((pattern) => pattern.trim().toLowerCase())
    .filter((pattern) => pattern !== '')
    .some((pattern) => haystack.includes(pattern));
  if (explicitlyRetryable) return true;
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

/**
 * 给 JSON 值生成定长且键顺序无关的稳定指纹。
 *
 * 这里不保存可能很大的工具输出原文；每个字符都会进入两个独立的
 * 32-bit 累加器，再附上字符数，供 loop guard 比较完整的模型可见结果。
 */
function stableFingerprint(value: unknown): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  let length = 0;
  const feed = (text: string): void => {
    length += text.length;
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      first = Math.imul(first ^ code, 0x01000193) >>> 0;
      second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
      second = (second ^ (second >>> 13)) >>> 0;
    }
  };
  const walk = (part: unknown): void => {
    if (part === null) {
      feed('null');
    } else if (Array.isArray(part)) {
      feed('[');
      for (const item of part) {
        walk(item);
        feed(',');
      }
      feed(']');
    } else if (typeof part === 'object') {
      feed('{');
      const record = part as Record<string, unknown>;
      for (const key of Object.keys(record).sort()) {
        feed(JSON.stringify(key));
        feed(':');
        walk(record[key]);
        feed(',');
      }
      feed('}');
    } else {
      feed(`${typeof part}:${JSON.stringify(part) ?? String(part)}`);
    }
  };
  walk(value);
  return `${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}:${length}`;
}

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
  /** 完整模型可见内容 + 错误状态的定长稳定指纹(loop guard 比较用)。 */
  identity: string;
}

interface ToolResultData {
  turn?: unknown;
  step?: unknown;
  error?: { name?: string; code?: string };
  message?: {
    source?: { kind?: string; callId?: unknown };
    content?: Array<{ type?: string; toolCallId?: unknown; content?: unknown; isError?: boolean }>;
  };
}

function toolCorrelationKey(
  data: { turn?: unknown; step?: unknown },
  callId: string | undefined,
): string | undefined {
  if (callId === undefined || typeof data.turn !== 'number' || typeof data.step !== 'number') {
    return undefined;
  }
  return JSON.stringify([data.turn, data.step, callId]);
}

function resultBlock(data: ToolResultData) {
  return data.message?.content?.find((part) => part.type === 'tool-result');
}

/**
 * 取工具结果的关联 id。新版 DSH 的权威位置是 message.source.callId，
 * 同时接受模型可见 block 上的 toolCallId；两者冲突时宁可忽略，不猜测配对。
 */
export function toolResultCallId(data: ToolResultData): string | undefined {
  if (resultBlock(data) === undefined) return undefined;
  const sourceId = data.message?.source?.kind === 'tool' ? data.message.source.callId : undefined;
  const blockId = resultBlock(data)?.toolCallId;
  const source = typeof sourceId === 'string' && sourceId !== '' ? sourceId : undefined;
  const block = typeof blockId === 'string' && blockId !== '' ? blockId : undefined;
  if (source !== undefined && block !== undefined && source !== block) return undefined;
  return source ?? block;
}

/** 从 tool/result 事件载荷提取成功与否与文本摘要。 */
export function toolResultFacts(data: ToolResultData): ToolResultFacts {
  const result = resultBlock(data);
  const failed = data.error !== undefined || result?.isError === true;
  return {
    ok: !failed,
    excerpt: extractText(result?.content, TOOL_RESULT_CAP),
    identity: stableFingerprint({ content: result?.content ?? [], isError: failed }),
  };
}

/** loop guard 在后续 step 边界确认的连续重复信号。 */
export interface ToolRepeatSignal {
  tool: string;
  count: number;
}

export type ToolGuardState =
  | { kind: 'none' }
  | { kind: 'pending'; tool: string }
  | { kind: 'done'; tool: string; result: string }
  | { kind: 'failed'; tool: string };

interface TrackedToolCall {
  id: string | undefined;
  name: string;
  key: string;
  result: ToolResultFacts | undefined;
  resultSeq: number | undefined;
}

const MAX_PENDING_TOOL_CALLS = 64;
const MAX_SEEN_TOOL_CALL_IDS = 256;

/**
 * 每个会话的工具调用关联器。
 *
 * 集中封装事件关联、step 边界确认、护栏读取与重置。内部按 callId 配对，
 * 乱序结果先缓存、再按调用顺序推进 loop 计数。队列和去重 id 都有硬上限；
 * 超限或载荷无法关联时会打断重复计数，宁可漏报也不误杀健康回合。
 */
export class ToolInvocationTracker {
  private readonly pendingById = new Map<string, TrackedToolCall>();
  private readonly pendingInOrder: TrackedToolCall[] = [];
  private readonly seenCalls = new Map<string, TrackedToolCall>();
  private readonly seenInOrder: string[] = [];
  private latest: TrackedToolCall | undefined;
  private run: { key: string; tool: string; identity: string; count: number } | undefined;
  private repeatSignal: ToolRepeatSignal | undefined;
  private lastEventSeq = -1;

  reset(): void {
    this.pendingById.clear();
    this.pendingInOrder.length = 0;
    this.seenCalls.clear();
    this.seenInOrder.length = 0;
    this.latest = undefined;
    this.run = undefined;
    this.repeatSignal = undefined;
    this.lastEventSeq = -1;
  }

  /** 新回合边界：清空工具态，同时把重放水位推进到 turn/start。 */
  startTurn(seq: number): void {
    if (!Number.isSafeInteger(seq) || seq < 0 || seq <= this.lastEventSeq) return;
    this.reset();
    this.lastEventSeq = seq;
  }

  /** 回合已结束：保留最后一次调用的护栏，丢弃不再可用的 loop 关联态。 */
  resetRepeat(): void {
    this.pendingById.clear();
    this.pendingInOrder.length = 0;
    this.seenCalls.clear();
    this.seenInOrder.length = 0;
    this.run = undefined;
    this.repeatSignal = undefined;
  }

  recordCall(event: SessionEvent<'tool/call'>): boolean {
    if (!this.acceptEventSeq(event.seq)) return false;
    this.repeatSignal = undefined;
    const data = event.data;
    if (typeof data.name !== 'string') {
      this.breakCorrelation();
      return true;
    }
    const key = `${data.name}\n${typeof data.arguments === 'string' ? data.arguments : ''}`;
    const callId = typeof data.callId === 'string' && data.callId !== '' ? data.callId : undefined;
    const id = toolCorrelationKey(data, callId);
    if (id === undefined) {
      this.breakCorrelation({
        id: undefined,
        name: data.name,
        key,
        result: undefined,
        resultSeq: undefined,
      });
      return true;
    }

    const seen = this.seenCalls.get(id);
    if (seen !== undefined) {
      // 同 seq 重放已被水位拒绝；更高 seq 复用复合 identity 时不猜测。
      this.breakCorrelation({
        id: undefined,
        name: data.name,
        key,
        result: undefined,
        resultSeq: undefined,
      });
      return true;
    }

    const call: TrackedToolCall = {
      id,
      name: data.name,
      key,
      result: undefined,
      resultSeq: undefined,
    };
    this.latest = call;
    this.pendingById.set(id, call);
    this.pendingInOrder.push(call);
    this.seenCalls.set(id, call);
    this.seenInOrder.push(id);
    this.trim(call);
    return true;
  }

  recordResult(event: SessionEvent<'tool/result'>): ToolRepeatSignal | undefined {
    if (!this.acceptEventSeq(event.seq)) return undefined;
    const data = event.data;
    const id = toolCorrelationKey(data, toolResultCallId(data));
    if (id === undefined) {
      this.breakCorrelation(this.latest);
      return undefined;
    }
    const surfaceOp = event.surfaceOp;
    if (typeof surfaceOp === 'object' && surfaceOp !== null) {
      const call = this.seenCalls.get(id);
      if (
        surfaceOp.start !== surfaceOp.end ||
        call === undefined ||
        call.result === undefined ||
        call.resultSeq !== surfaceOp.start
      ) {
        this.breakCorrelation(this.latest);
        return undefined;
      }
      call.result = toolResultFacts(data);
      call.resultSeq = event.seq;
      // replacement 可由 lossy pruner 产生：更新护栏，但绝不据此创建/增强重复。
      this.breakCorrelation(this.latest);
      return undefined;
    }
    const call = this.pendingById.get(id);
    if (call === undefined) {
      const seen = this.seenCalls.get(id);
      const duplicate = seen?.result;
      const incoming = toolResultFacts(data);
      if (
        seen !== undefined &&
        duplicate !== undefined &&
        seen.resultSeq === event.seq &&
        duplicate.identity === incoming.identity
      ) {
        return undefined;
      }
      if (seen !== undefined && duplicate !== undefined) {
        // 已完成调用又出现非 replacement 冲突时，旧完成事实也不再可信。
        seen.result = undefined;
        seen.resultSeq = undefined;
      }
      this.breakCorrelation(this.latest);
      return undefined;
    }
    if (call.result !== undefined) {
      const incoming = toolResultFacts(data);
      if (call.resultSeq === event.seq && call.result.identity === incoming.identity) {
        return undefined;
      }
      // 没有 surface replacement 语义却出现第二个冲突结果：关联已不可信。
      call.result = undefined;
      call.resultSeq = undefined;
      this.breakCorrelation(this.latest);
      return undefined;
    }
    call.result = toolResultFacts(data);
    call.resultSeq = event.seq;
    return this.drainCompleted();
  }

  guard(): ToolGuardState {
    const latest = this.latest;
    if (latest === undefined) return { kind: 'none' };
    if (latest.result === undefined) return { kind: 'pending', tool: latest.name };
    if (latest.result.ok) {
      return { kind: 'done', tool: latest.name, result: latest.result.excerpt };
    }
    return { kind: 'failed', tool: latest.name };
  }

  lastTool(): string | undefined {
    return this.latest?.name;
  }

  /** 下一模型 step 是稳定边界；此前 replacement/新调用会先清除候选。 */
  confirmRepeatAtStep(seq: number): ToolRepeatSignal | undefined {
    if (!this.acceptEventSeq(seq)) return undefined;
    const signal = this.pendingInOrder.length === 0 ? this.repeatSignal : undefined;
    this.repeatSignal = undefined;
    return signal;
  }

  /** 非工具 surface range replacement（如 compaction summary）同样终止旧工具证据。 */
  recordSurfaceReplacement(seq: number): void {
    if (!this.acceptEventSeq(seq)) return;
    this.breakCorrelation(this.latest);
  }

  restore(events: readonly SessionEvent[], untilSeq: number): void {
    this.reset();
    for (const event of events) {
      if (event.seq >= untilSeq) continue;
      if (event.type === 'turn/start') this.startTurn(event.seq);
      else if (event.type === 'step/start') this.confirmRepeatAtStep(event.seq);
      else if (event.type === 'tool/call') this.recordCall(event);
      else if (event.type === 'tool/result') this.recordResult(event);
      else if (
        (event.type === 'user/message' || event.type === 'assistant/message') &&
        typeof event.surfaceOp === 'object' &&
        event.surfaceOp !== null
      ) {
        this.recordSurfaceReplacement(event.seq);
      }
    }
  }

  private acceptEventSeq(seq: number): boolean {
    if (!Number.isSafeInteger(seq) || seq < 0) {
      this.breakCorrelation(this.latest);
      return false;
    }
    // session/event 与持久日志都按 seq 单调投递；旧 seq 只能是重放帧。
    if (seq <= this.lastEventSeq) return false;
    this.lastEventSeq = seq;
    return true;
  }

  private breakCorrelation(latest?: TrackedToolCall, preserve?: TrackedToolCall): void {
    this.pendingById.clear();
    this.pendingInOrder.length = 0;
    this.invalidateRunHistory();
    this.latest = latest;
    if (
      preserve?.id !== undefined &&
      preserve.result === undefined &&
      this.seenCalls.get(preserve.id) === preserve
    ) {
      this.pendingById.set(preserve.id, preserve);
      this.pendingInOrder.push(preserve);
    }
  }

  private invalidateRunHistory(): void {
    this.run = undefined;
    this.repeatSignal = undefined;
  }

  private trim(current: TrackedToolCall): void {
    while (this.pendingInOrder.length > MAX_PENDING_TOOL_CALLS) {
      // 只淘汰一个 call 会让其后的乱序结果跨过未知缺口重新拼成 streak。
      this.breakCorrelation(current, current);
    }
    while (this.seenInOrder.length > MAX_SEEN_TOOL_CALL_IDS) {
      const id = this.seenInOrder.shift();
      if (id !== undefined) {
        this.seenCalls.delete(id);
        // 丢失去重证据后不保留旧缓存；单调 seq 会拒绝淘汰项的旧帧重放。
        this.breakCorrelation(current, current);
      }
    }
  }

  private drainCompleted(): ToolRepeatSignal | undefined {
    let advanced = false;
    while (this.pendingInOrder[0]?.result !== undefined) {
      const call = this.pendingInOrder.shift();
      if (call === undefined || call.result === undefined) break;
      advanced = true;
      if (call.id !== undefined) this.pendingById.delete(call.id);
      this.advanceRun(call);
    }
    // 已知并发批次尚未收齐时不提前发信号；末尾结果可能展示真实进展。
    if (!advanced) return undefined;
    return this.refreshRepeatSignal();
  }

  private advanceRun(call: TrackedToolCall): void {
    if (call.result === undefined) return;
    if (this.run?.key === call.key && this.run.identity === call.result.identity) {
      this.run.count += 1;
    } else {
      this.run = { key: call.key, tool: call.name, identity: call.result.identity, count: 1 };
    }
  }

  private refreshRepeatSignal(): ToolRepeatSignal | undefined {
    this.repeatSignal =
      this.pendingInOrder.length === 0 && this.run !== undefined
        ? { tool: this.run.tool, count: this.run.count }
        : undefined;
    return this.repeatSignal;
  }
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

export function sleep(ms: number): Promise<void> {
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

/** 一天的自动继续统计(host 单实例内存态)。 */
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

export function todayKey(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** 空统计桶。 */
export function emptyDayStats(): DayStats {
  return { date: todayKey(), sent: 0, skipped: 0, recovered: 0, failed: 0, gaveUp: 0, looped: 0, byCode: {} };
}

/** 每会话运行时状态。 */
export interface SessionState {
  /** 连续自动「继续」次数; 成功回合或用户手动介入后归零。 */
  consecutive: number;
  /** 上次自动「继续」尝试(成功或失败)时间戳; 防止失败场景下的快速重试循环。 */
  lastAttemptAt: number;
  /** 尚未回显到会话事件流的自动发送消息 ID。 */
  pendingEchoMessageIds: Map<string, number>;
  /** 宽限期定时器(进行中的待发送)。 */
  pendingTimer: ReturnType<typeof setTimeout> | undefined;
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
  /** callId 精确配对的工具调用、幂等护栏与 loop 重复态。 */
  tools: ToolInvocationTracker;
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
  /** 本回合已触发过 loop guard(防重复打断)。 */
  loopFired: boolean;
  /** loop 重启的延迟定时器(冷却结束后再 schedule)。 */
  loopRetryTimer: ReturnType<typeof setTimeout> | undefined;
}

export const freshState = (): SessionState => ({
  consecutive: 0,
  lastAttemptAt: 0,
  pendingEchoMessageIds: new Map(),
  pendingTimer: undefined,
  running: undefined,
  queued: 0,
  subagent: false,
  lastFailure: undefined,
  lastFailureAt: 0,
  tools: new ToolInvocationTracker(),
  lastTurn: undefined,
  pendingRecoveryAt: 0,
  shortRun: 0,
  lastShortAt: 0,
  lastAssistantText: '',
  sameTextRun: 0,
  loopFired: false,
  loopRetryTimer: undefined,
});


export const RECOVERY_WINDOW_MS = 10 * 60 * 1000;

export const ECHO_WINDOW_MS = 10 * 60 * 1000;
const MAX_PENDING_ECHO_MESSAGE_IDS = 64;

function prunePendingEchoMessageIds(state: SessionState, now: number): void {
  for (const [messageId, queuedAt] of state.pendingEchoMessageIds) {
    if (now - queuedAt > ECHO_WINDOW_MS) state.pendingEchoMessageIds.delete(messageId);
  }
}

/** Track an identified plugin message before handing it to the host queue. */
export function trackPendingEcho(state: SessionState, messageId: string): void {
  const now = Date.now();
  prunePendingEchoMessageIds(state, now);
  state.pendingEchoMessageIds.set(messageId, now);
  while (state.pendingEchoMessageIds.size > MAX_PENDING_ECHO_MESSAGE_IDS) {
    const oldest = state.pendingEchoMessageIds.keys().next();
    if (oldest.done) break;
    state.pendingEchoMessageIds.delete(oldest.value);
  }
}

/** Roll back tracking when the host rejects a queued message. */
export function forgetPendingEcho(state: SessionState, messageId: string): void {
  state.pendingEchoMessageIds.delete(messageId);
}

/** Match and consume one plugin-owned `user/message` event by stable message ID. */
export function isOurEcho(state: SessionState, event: SessionEvent): boolean {
  if (event.type !== 'user/message') return false;
  const message = event.data;
  if (message.source.kind !== 'user') return false;
  if (state.pendingEchoMessageIds.size === 0) return false;
  const now = Date.now();
  prunePendingEchoMessageIds(state, now);
  return state.pendingEchoMessageIds.delete(message.id);
}
