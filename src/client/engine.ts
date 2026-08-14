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
}

/** Fully resolved configuration (built-in defaults + user overrides). */
export type AutoContinueConfig = Required<AutoContinueSettings>;

/** Built-in defaults — must match the host schema defaults in src/index.ts. */
export const DEFAULT_CONFIG: AutoContinueConfig = {
  continueText: '继续',
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
    notify: booleanOr(value.notify, DEFAULT_CONFIG.notify),
  };
}

/** 视为「非人为中断」的回合结束原因。aborted(用户停止)与 blocked(策略拒绝)不在其中。 */
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

/** 浏览器通知(不可用时静默跳过)。 */
function notify(title: string, body: string): void {
  try {
    const N = (globalThis as { Notification?: unknown }).Notification as
      | (new (t: string, o: { body: string }) => unknown)
      | undefined;
    if (typeof N === 'undefined') return;
    const permission = (N as unknown as { permission?: string }).permission;
    if (permission === 'granted') {
      new N(title, { body });
    } else if (permission === 'default') {
      // 首次使用时请求一次权限, 用户拒绝后不再打扰。
      void (N as unknown as { requestPermission?: () => Promise<string> }).requestPermission?.()
        .then((result) => {
          if (result === 'granted') new N(title, { body });
        })
        .catch(() => {});
    }
  } catch {
    /* 通知失败不影响核心逻辑 */
  }
}

/** 用失败事实与回合信息填充 continueText 模板占位符({code}/{message}/{status}/{tool}/{turn})。 */
export function fillTemplate(
  template: string,
  facts: FailureFacts | undefined,
  tool: string | undefined,
  turn: number | undefined,
): string {
  return template
    .replace(/\{code\}/g, facts?.code ?? '')
    .replace(/\{message\}/g, facts?.message ?? '')
    .replace(/\{status\}/g, facts?.status !== undefined ? String(facts.status) : '')
    .replace(/\{tool\}/g, tool ?? '')
    .replace(/\{turn\}/g, turn !== undefined ? String(turn) : '');
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
  /** 失败前最后一次工具调用的名称(模板 {tool})。 */
  lastTool: string | undefined;
  /** 失败回合的编号(模板 {turn})。 */
  lastTurn: number | undefined;
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
  lastTool: undefined,
  lastTurn: undefined,
});

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
          if (typeof name === 'string') this.state(frame.sessionId).lastTool = name;
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

  private onSessionEvent(sessionId: SessionId, event: SessionEvent): void {
    const state = this.state(sessionId);
    switch (event.type) {
      case 'turn/start':
        state.running = true;
        this.cancelPending(sessionId, '宿主自行开启新回合');
        break;
      case 'turn/end': {
        state.running = false;
        this.cancelPending(sessionId, '收到新的 turn/end');
        const reason = event.data.reason;
        if (reason.kind === 'completed') {
          // 成功回合: 恢复健康状态
          state.consecutive = 0;
          state.lastFailure = undefined;
        } else if (reason.kind === 'aborted') {
          // 用户主动停止: 不自动继续, 视为用户介入
          state.consecutive = 0;
        } else if (reason.kind === 'blocked') {
          // 策略拒绝: 不自动继续
        } else if (reason.kind === 'error') {
          // 记录失败事实(分类与模板填充用), 然后按类型处理
          const error = reason.error;
          state.lastFailure = {
            code: typeof error.code === 'string' ? error.code : 'UNKNOWN',
            message: typeof error.message === 'string' ? error.message : String(error),
            ...(typeof error.status === 'number' ? { status: error.status } : {}),
          };
          state.lastTurn = event.data.turn;
          this.onTurnFailure(sessionId, 'turn/end:error', state.lastFailure);
        } else if (isNonHumanReason(reason.kind)) {
          this.schedule(sessionId, `turn/end:${reason.kind}`);
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
      if (config.notify) {
        notify('dsh-auto-continue: 未自动继续', `${sessionId}: 永久性错误 ${summary}，需要人工处理`);
      }
      return;
    }
    this.schedule(sessionId, reason);
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
    this.log(
      `检测到非人为中断 ${sessionId}(${reason}), ${config.graceMs}ms 后自动发送「${config.continueText}」`,
    );
  }

  private cancelPending(sessionId: SessionId, why: string): void {
    const state = this.state(sessionId);
    if (state.pendingTimer === undefined) return;
    clearTimeout(state.pendingTimer);
    state.pendingTimer = undefined;
    this.log(`取消 ${sessionId} 的自动继续(${why})`);
  }

  private async fire(sessionId: SessionId, reason: string): Promise<void> {
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
    // 跨标签页冷却(自适应退避)
    if (Date.now() - readLastSend(sessionId) < this.cooldownFor(state)) {
      this.log(`跳过 ${sessionId}: 其他标签页刚发送过`);
      return;
    }
    if (!claimSend(sessionId)) {
      this.log(`跳过 ${sessionId}: 其他标签页正在发送`);
      return;
    }
    // 模板填充: continueText 可含 {code}/{message}/{status}/{tool}/{turn} 占位符
    const text = fillTemplate(config.continueText, state.lastFailure, state.lastTool, state.lastTurn);
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
        writeLastSend(sessionId, now);
        this.log(`已自动发送「${text}」到 ${sessionId}(${reason}), 第 ${state.consecutive} 次连续`);
        if (config.notify) {
          notify('dsh-auto-continue: 已自动继续', `${sessionId}: 已发送「${text}」(第 ${state.consecutive} 次连续)`);
        }
        if (state.consecutive >= config.maxConsecutive) {
          this.log(`达到连续上限 ${config.maxConsecutive} 次, 停止自动继续 ${sessionId}`);
          if (config.notify) {
            notify('dsh-auto-continue: 已停止自动继续', `${sessionId}: 连续失败 ${state.consecutive} 次, 需要人工介入`);
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

  private async runningViaList(sessionId: SessionId): Promise<boolean | undefined> {
    try {
      const response = await this.api.sessions.list({});
      if (!response.result.ok) return undefined;
      const item = response.result.value.items.find(
        (summary: SessionSummary) => summary.sessionId === sessionId,
      );
      return item === undefined ? undefined : item.running;
    } catch {
      return undefined;
    }
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
    const response = await this.api.sessions.list({});
    if (!response.result.ok) return false;
    const items = response.result.value.items;
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
      this.log(`扫描发现中断 ${summary.sessionId}(turn/end:${reason.kind}), 安排自动继续`);
      this.schedule(summary.sessionId, `scan:turn/end:${reason.kind}`);
    }
    return true;
  }
}
