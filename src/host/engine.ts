/**
 * Auto-continue engine — host half core (single instance).
 *
 * Runs inside the dsh host process, so there is exactly ONE engine regardless
 * of how many browser tabs are open — the multi-tab duplicate-send class of
 * bugs (issue #13) cannot exist by construction. Listens to the session event
 * firehose (`session/event`), sends through the agent registry
 * (`agent.followup`), cancels through `agent.cancel`, and reads configuration
 * injected by the entry (`apply`'s config argument, merged with schema
 * defaults by `resolveConfig`).
 *
 * All behavior is driven by the `auto-continue` entry config; every knob below
 * is user-configurable there.
 */

import type { Context } from '@deepseek-ai/cordis';
import { randomUUID } from 'node:crypto';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session/types';
import { foldRequestHeader, type Session } from '@deepseek-ai/dsh-session';
import {
  AUTO_CONTINUE_SOURCE_KIND,
  DEFAULT_CONFIG,
  RECOVERY_WINDOW_MS,
  effectiveCooldown,
  emptyDayStats,
  fillTemplate,
  forgetPendingEcho,
  freshState,
  isNonHumanReason,
  isOurEcho,
  isNetworkFailure,
  isSessionMode,
  isTransientAgentError,
  isTransientFailure,
  resolveConfig,
  sessionMode,
  sleep,
  todayKey,
  trackPendingEcho,
  type AutoContinueConfig,
  type AutoContinueLocale,
  type DayStats,
  type RecoveryAttempt,
  type FailureFacts,
  type SessionMode,
  type SessionState,
  type NotifyAction,
  type NotifyOptions,
  type TemplateContext,
  type ToolRepeatSignal,
} from '../shared/core.ts';
import { probeConnectivity, type ConnectivityProbe } from './connectivity.ts';

const NOTICE_COPY = {
  zh: {
    notContinuedTitle: 'dsh-auto-continue: 请处理会话错误',
    permanentErrorBody: (sessionId: SessionId, summary: string) =>
      `${sessionId}: ${summary}。请处理此错误后再继续。`,
    resumeAction: '立即续跑',
    pauseAction: '暂停该会话 1 小时',
    continuedTitle: 'dsh-auto-continue: 已发送继续消息',
    continuedBody: (sessionId: SessionId, text: string, count: number) =>
      `${sessionId}: 已发送「${text}」（连续尝试 ${count} 次）`,
    stoppedTitle: 'dsh-auto-continue: 已达到重试上限',
    stoppedBody: (sessionId: SessionId, count: number) =>
      `${sessionId}: 已连续尝试恢复 ${count} 次。请检查会话后再继续。`,
    loopCapTitle: 'dsh-auto-continue: 自主循环已到上限',
    loopCapBody: (sessionId: SessionId, count: number) =>
      `${sessionId}: 已自主续跑 ${count} 轮, 循环暂停; 发一条消息或重新开启循环即可继续`,
  },
  en: {
    notContinuedTitle: 'dsh-auto-continue: Review session error',
    permanentErrorBody: (sessionId: SessionId, summary: string) =>
      `${sessionId}: ${summary}. Resolve this error before continuing.`,
    resumeAction: 'Resume now',
    pauseAction: 'Pause this session for 1 hour',
    continuedTitle: 'dsh-auto-continue: Continue message sent',
    continuedBody: (sessionId: SessionId, text: string, count: number) =>
      `${sessionId}: Sent "${text}" (consecutive attempts: ${count})`,
    stoppedTitle: 'dsh-auto-continue: Retry limit reached',
    stoppedBody: (sessionId: SessionId, count: number) =>
      `${sessionId}: Consecutive recovery attempts: ${count}. Review the conversation before continuing.`,
    loopCapTitle: 'dsh-auto-continue: Autonomous loop limit reached',
    loopCapBody: (sessionId: SessionId, count: number) =>
      `${sessionId}: Stopped after ${count} autonomous rounds; send a message or turn the loop back on to keep going`,
  },
  ru: {
    notContinuedTitle: 'dsh-auto-continue: продолжение не выполнено',
    permanentErrorBody: (sessionId: SessionId, summary: string) =>
      `${sessionId}: постоянная ошибка ${summary}; нужно вмешательство вручную`,
    resumeAction: 'Продолжить сейчас',
    pauseAction: 'Приостановить сессию на 1 час',
    continuedTitle: 'dsh-auto-continue: продолжено автоматически',
    continuedBody: (sessionId: SessionId, text: string, count: number) =>
      `${sessionId}: отправлено «${text}» (попытка подряд: ${count})`,
    stoppedTitle: 'dsh-auto-continue: авто-продолжение остановлено',
    stoppedBody: (sessionId: SessionId, count: number) =>
      `${sessionId}: сбоев подряд: ${count}; нужно вмешательство вручную`,
    loopCapTitle: 'dsh-auto-continue: достигнут лимит автономного цикла',
    loopCapBody: (sessionId: SessionId, count: number) =>
      `${sessionId}: остановлено после ${count} автономных раундов; отправьте сообщение или включите цикл снова, чтобы продолжить`,
  },
} as const satisfies Record<AutoContinueLocale, Record<string, unknown>>;

/** Durable cancel identity reserved for this plugin's loop guard. */
const LOOP_GUARD_CANCEL_CAUSE = {
  kind: 'hook',
  reason: 'dsh-auto-continue:loop-guard',
} as const;

/**
 * Autonomous-loop resume reasons.
 * - `turn/end:completed` is a *successful* visible completion: the loop hands
 *   the thread back and the send is exempt from the failure budget.
 * - `turn/end:loop-silent` is a loop-covered turn with no visible output. The
 *   loop still continues it, but it is a failure: it must consume the retry
 *   budget and obey backoff, or a stuck model retries forever.
 * The silent reason must not end in `:silent` — `fire()` skips those when
 * silent-turn resume is off, which would stall the loop (27j).
 */
const LOOP_COMPLETED_REASON = 'turn/end:completed';
const LOOP_SILENT_REASON = 'turn/end:loop-silent';
const MANUAL_NOTIFICATION_REASON = 'manual:notification';

/** Yield between storage batches without spending a live-scan polling interval. */
const SWEEP_OBSERVE_BATCH = 16;
const STORED_READ_TIMEOUT_MS = 5000;
/** 单个存储会话连续观察/物化失败达此数后放弃, 避免坏日志反复占满每轮观察配额。 */
const SWEEP_MAX_FAILURES = 3;

/** Why a child session needs its root session woken after a restart. */
type ChildInterruptCause = 'open-turn' | 'disposed' | 'interrupted' | 'max-tokens' | 'error';

/** One interrupted child session, grouped under the root session that owns it. */
interface ChildInterrupt {
  readonly id: SessionId;
  readonly title: string | undefined;
  readonly preset: string | undefined;
  readonly cause: ChildInterruptCause;
  readonly at: number;
}

/** A header-shaped record good enough to resolve a parent chain. */
interface SessionHeaderLike {
  readonly id: SessionId;
  readonly parentSession?: SessionId;
}

/** Cancel causes a host shutdown or a restart produces; only these justify a wake-up. */
const RESTART_CANCEL_CAUSES: ReadonlySet<string> = new Set(['disposed', 'legacy']);
/** Cancel causes that record an explicit human or parent decision; never recover these. */
const DECISION_CANCEL_CAUSES: ReadonlySet<string> = new Set(['user', 'parent', 'hook']);
/** Bound child observations per sweep round: child logs are as large as root logs. */
const CHILD_SWEEP_LIMIT = 8;
/** Bound how many ancestor hops a dirty parent chain may cost before giving up. */
const CHILD_ROOT_MAX_DEPTH = 8;
/** Do not hand the same child failure to its main conversation more often than this. */
const HANDOFF_COOLDOWN_MS = 5 * 60 * 1000;
/** Stay silent while the main conversation recovers itself: any message would cancel it. */
const HANDOFF_PARENT_QUIET_MS = 2 * 60 * 1000;

/** Copy for the live hand-off that replaces an impossible child resume, keyed by UI locale. */
const HANDOFF_COPY = {
  zh: (child: string, code: string) =>
    `子代理会话 ${child} 因 ${code} 中断, 已无法直接续跑。请检查它的状态, 然后继续或收尾。`,
  en: (child: string, code: string) =>
    `Child session ${child} was interrupted by ${code} and can no longer be resumed directly. Check its state, then continue it or wrap it up.`,
  ru: (child: string, code: string) =>
    `Дочерняя сессия ${child} прервалась из-за ${code} и больше не может быть продолжена напрямую. Проверь её состояние и продолжи или заверши.`,
} as const satisfies Record<AutoContinueLocale, (child: string, code: string) => string>;

/** Host service key for goals (0.2.x); older hosts simply do not register it. */
const GOALS_SERVICE_KEY = 'goals';

/** Copy for each child interruption cause, keyed by UI locale. */
const CHILD_CAUSE_COPY = {
  zh: {
    'open-turn': '回合开始后中断',
    disposed: '宿主销毁',
    interrupted: '崩溃恢复标记',
    'max-tokens': '输出长度耗尽',
    error: '可重试错误',
  },
  en: {
    'open-turn': 'turn cut off after start',
    disposed: 'host disposed the agent',
    interrupted: 'closed by crash recovery',
    'max-tokens': 'output ceiling reached',
    error: 'retryable error',
  },
  ru: {
    'open-turn': 'ход прерван после начала',
    disposed: 'хост уничтожил агента',
    interrupted: 'закрыт восстановлением после сбоя',
    'max-tokens': 'достигнут лимит вывода',
    error: 'повторяемая ошибка',
  },
} as const satisfies Record<AutoContinueLocale, Record<ChildInterruptCause, string>>;

/** Structural view of `ctx.goals`; declared locally because devDeps target an older host. */
interface GoalRefLike {
  readonly id: string;
  /** Mutations are CAS-checked against this revision; omitting it raises GOAL_STALE_REVISION. */
  readonly revision: number;
}

interface GoalViewLike {
  readonly id: string;
  /** The host's `view()` exposes no `ref`; callers build `{ id, revision }` from the view. */
  readonly ref?: GoalRefLike;
  readonly phase?: string;
  readonly activation?: string;
  readonly revision?: number;
}

interface GoalServiceLike {
  get(agent: Agent): GoalViewLike | undefined;
  resume(agent: Agent, ref: GoalRefLike): unknown;
}

/**
 * 存储扫描消费的宿主服务结构类型。这些服务(sessionQuery 等)随 dsh
 * 版本整组演进, 直接引类型包会拖动 devDependency 时代; 按消费面声明,
 * 缺服务的宿主在运行时禁用存储扫描即可。
 */
interface StoredObservation {
  readonly events: readonly SessionEvent[];
  readonly header: { readonly id?: SessionId; readonly origin?: string; readonly agentPreset?: string };
  readonly projections?: { readonly values: { readonly agentPreset?: string } };
  [Symbol.dispose]?: () => void;
}

const isLoopReason = (reason: string): boolean =>
  reason === LOOP_COMPLETED_REASON || reason === LOOP_SILENT_REASON;

/** Keep fuzzy matching off the unbounded host event path; exact repeats remain unlimited. */
const STREAM_NEAR_DUPLICATE_MAX_CHARS = 2_048;
/** Bound unfinished text copied between token chunks when a provider emits no paragraph break. */
const STREAM_TAIL_MAX_CHARS = 4_096;

/** Ignore invisible formatting only for detection, never rewrite the stored message. */
const visibleText = (text: string): string => text.replace(/\p{Cf}/gu, '').trim();

/** 通知桥事件: host 引擎产生, browser 侧订阅展示(Notification / 动作按钮)。 */
export interface HostNotice {
  /** 稳定标识(供 browser 去重)。 */
  id: string;
  title: string;
  body: string;
  /** 会话 id(通知按钮「立即续跑 / 暂停该会话」作用于它)。 */
  sessionId: SessionId;
  actions: NotifyAction[];
  /** 产生时间。 */
  at: number;
}

/** 自动发送后, 在该窗口内出现的回合结束才计入恢复统计。 */

/** SSE 帧外壳: `{ rpcId, payload }`。 */
type FrameEnvelope<T> = { payload: T };

/** Session history APIs across the supported DSH host releases. */
type CompatibleSession = Session & {
  readonly events?: readonly SessionEvent[];
  snapshotEvents?: () => readonly SessionEvent[];
};

/** Read one stable event-log snapshot on both legacy and DSH 0.1.2 hosts. */
function snapshotSessionEvents(session: Session): readonly SessionEvent[] {
  const compatible = session as CompatibleSession;
  const snapshot = compatible.snapshotEvents;
  const events = typeof snapshot === 'function' ? snapshot.call(session) : compatible.events;
  return validateSessionEvents(events);
}

function validateSessionEvents(events: unknown): readonly SessionEvent[] {
  if (!Array.isArray(events)) throw new TypeError('session history is not an event array');
  // Do not filter damaged entries: one could have been a manual stop, newer turn,
  // or tool result. An incomplete history is not safe evidence for a continuation.
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event === null || typeof event !== 'object' || Array.isArray(event) ||
        typeof event.type !== 'string' || event.type === '' ||
        !Number.isSafeInteger(event.seq) || event.seq < 0 ||
        !Number.isFinite(event.time) || event.time < 0) {
      throw new TypeError(`invalid session event envelope at index ${index}`);
    }
  }
  return events;
}

function latestTurnStart(events: readonly SessionEvent[]): SessionEvent<'turn/start'> | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.type === 'turn/start') return event;
  }
  return undefined;
}

function isMaintenanceTurnStart(event: SessionEvent<'turn/start'> | undefined): boolean {
  // shortcut: only message-ops defines this marker; extend when another producer has a verified contract.
  return (event?.data as { reason?: unknown } | undefined)?.reason === 'message-ops';
}

/** Interpret host failure payloads without trusting persisted or plugin-provided event shapes. */
function parseFailureFacts(value: unknown): FailureFacts | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const failure = value as { code?: unknown; message?: unknown; status?: unknown };
  const code = typeof failure.code === 'string' && failure.code.trim() !== ''
    ? failure.code
    : undefined;
  const message = typeof failure.message === 'string' && failure.message.trim() !== ''
    ? failure.message
    : undefined;
  const status = typeof failure.status === 'number' && Number.isFinite(failure.status)
    ? failure.status
    : undefined;
  if (code === undefined && message === undefined && status === undefined) return undefined;
  return {
    code: code ?? 'UNKNOWN',
    message: message ?? code ?? `HTTP ${status}`,
    ...(status !== undefined ? { status } : {}),
  };
}

/** Read a reason discriminator defensively because session history can outlive its schema. */
function readReasonKind(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const kind = (value as { kind?: unknown }).kind;
  return typeof kind === 'string' && kind.trim() !== '' ? kind : undefined;
}

/** Read the nested cancel cause of an `aborted` turn/end (`reason.reason.kind`). */
function readCancelCause(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const reason = value as { kind?: unknown; reason?: unknown };
  if (reason.kind !== 'aborted') return undefined;
  return readReasonKind(reason.reason);
}

/** Whether the host closed an `aborted` turn (restart, reload, teardown) rather than the user. */
function isHostCancel(value: unknown): boolean {
  const cause = readCancelCause(value);
  return cause !== undefined && RESTART_CANCEL_CAUSES.has(cause);
}

/**
 * Decide whether a child session's tail is a restart interruption worth waking
 * its root session for. Returns `undefined` when the child finished normally,
 * was stopped by a human or by its parent, or was superseded by a later user
 * message — i.e. whenever a wake-up would be a ghost turn.
 */
function classifyChildInterruption(
  events: readonly SessionEvent[],
  config: AutoContinueConfig,
): ChildInterruptCause | undefined {
  let lastEnd: SessionEvent<'turn/end'> | undefined;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.type === 'turn/end') { lastEnd = event; break; }
  }
  const lastStart = latestTurnStart(events);
  if (lastStart !== undefined && (lastEnd === undefined || lastStart.seq > lastEnd.seq)) {
    if (isMaintenanceTurnStart(lastStart)) return undefined;
    // 与主扫描同口径: 过了 freshMs 的中断不是这次重启造成的, 唤醒只会复活陈年父会话。
    if ((events[events.length - 1]?.time ?? 0) < Date.now() - config.freshMs) return undefined;
    return 'open-turn';
  }
  const end = lastEnd;
  if (end === undefined) return undefined;
  if (end.time < Date.now() - config.freshMs) return undefined;
  // A message written after the closing turn means someone already took over.
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event === undefined || event.seq <= end.seq) break;
    if (event.type === 'user/message') return undefined;
  }
  const reason = end.data.reason;
  const kind = readReasonKind(reason);
  if (kind === undefined) return undefined;
  if (kind === 'aborted') {
    const cause = readCancelCause(reason);
    if (cause === undefined || DECISION_CANCEL_CAUSES.has(cause)) return undefined;
    return RESTART_CANCEL_CAUSES.has(cause) ? 'disposed' : undefined;
  }
  if (kind === 'interrupted') return 'interrupted';
  if (kind === 'max-tokens') return 'max-tokens';
  if (kind === 'error') {
    const failure = parseFailureFacts((reason as { error?: unknown }).error);
    if (failure === undefined) return undefined;
    if (config.classify && !isTransientFailure(failure, config.retryableErrorPatterns)) return undefined;
    return 'error';
  }
  return undefined;
}

/** Walk `parentSession` up to a root session; `undefined` when the chain is dirty. */
function resolveRootHeader(
  header: SessionHeaderLike,
  byId: ReadonlyMap<string, SessionHeaderLike>,
): SessionId | undefined {
  let current: SessionHeaderLike = header;
  for (let depth = 0; depth <= CHILD_ROOT_MAX_DEPTH; depth += 1) {
    const parentId = current.parentSession;
    if (parentId === undefined || parentId === '') return current.id;
    const parent = byId.get(parentId);
    if (parent === undefined) return undefined;
    current = parent;
  }
  return undefined;
}

function isLoopGuardCancelReason(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const cause = value as { kind?: unknown; reason?: unknown };
  return cause.kind === LOOP_GUARD_CANCEL_CAUSE.kind && cause.reason === LOOP_GUARD_CANCEL_CAUSE.reason;
}

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
/** Soft cap on cached subagent lineage entries before stale ones are pruned. */
const LINEAGE_CACHE_LIMIT = 2000;

export class AutoContinueRunner {
  private readonly states = new Map<SessionId, SessionState>();
  /** Cached subagent lineage: session id -> direct parent id (undefined when the header has none). */
  private readonly parents = new Map<SessionId, SessionId | undefined>();
  /** Sessions already identified as subagents, including event views without header metadata. */
  private readonly subagentSessions = new Set<SessionId>();
  private readonly pauseUntil = new Map<SessionId, number>();
  private dayStats: DayStats = emptyDayStats();
  private readonly recoveryAttempts: RecoveryAttempt[] = [];
  private readonly notices: HostNotice[] = [];
  private readonly noticeListeners = new Set<() => void>();
  private readonly stateListeners = new Set<() => void>();
  private readonly prioritizedFollowups = new Set<string>();
  private readonly disposeSessionEvents: () => void;
  private readonly disposeInboxEvents: () => void;
  private disposed = false;
  private readonly bootScannedSessions = new WeakSet<Session>();
  /** Also bound diagnostics when even an agent's session getter is unavailable. */
  private readonly bootScanErrors = new WeakSet<object>();
  /** 存储扫描已裁决的会话 id, 避免每轮重复冷读大日志。 */
  private readonly storedSwept = new Set<SessionId>();
  /** 子会话裁决独立记账: storedSwept 在 origin 判断之前就已标记, 不能复用。 */
  private readonly childSwept = new Set<SessionId>();
  /** 本轮已花掉的子会话观察配额(每轮重置, 子会话日志与主会话同等昂贵)。 */
  private childScanned = 0;
  /** 本轮收集到的子会话中断, 按 root 主会话 id 归组。 */
  private readonly childInterrupts = new Map<SessionId, ChildInterrupt[]>();
  /** 已唤醒过的 root 会话 → 上次唤醒覆盖的子会话签名, 防止每轮重复催同一批。 */
  private readonly childWoken = new Map<SessionId, string>();
  /** 已打印过「父链不可解析」的子会话, 避免 15 分钟扫描窗口内每轮重扫把日志刷爆。 */
  private readonly childDirtyLogged = new Set<SessionId>();
  /** 存储会话的连续观察/物化失败次数, 触达 SWEEP_MAX_FAILURES 后不再重试。 */
  private readonly storedSweepFailures = new Map<SessionId, number>();
  private storedSweepAnnounced = false;
  private bootScanTimer: ReturnType<typeof setTimeout> | undefined;
  private wakeBootScan: (() => void) | undefined;
  private storedSweep: Promise<void> | undefined;
  private readonly stopStoredSweep = new AbortController();
  /** 并发的断网挂起共用同一次连通性检测。 */
  private connectivityCheck: Promise<boolean> | undefined;

  /**
   * @param ctx - host plugin context (agents registry, session events).
   * @param getConfig - read the current resolved configuration (entry config).
   */
  constructor(
    private readonly ctx: Context,
    private readonly getConfig: () => AutoContinueConfig,
    private readonly probe: ConnectivityProbe = probeConnectivity,
  ) {
    // 单实例事件源: 宿主进程内的会话事件 firehose, 天然覆盖所有会话。
    this.disposeSessionEvents = ctx.on('session/event', (session, event) => {
      try {
        this.onHostEvent(session, event);
      } catch (error) {
        console.error(
          `[auto-continue] 会话事件处理异常 ${session.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    });
    // followup() appends before it wakes the driver. Move only this plugin's marked
    // message during the synchronous insertion event, while the driver still cannot claim it.
    this.disposeInboxEvents = ctx.on('agent/inbox/inserted', ({ agent, message }) => {
      if (!this.prioritizedFollowups.delete(message.id)) return;
      let removed = false;
      try {
        const index = agent.inbox.nextTurn.findIndex(pending => pending.id === message.id);
        if (index <= 0) return;
        removed = agent.inbox.remove(message.id);
        if (!removed) return;
        agent.inbox.prepend('next-turn', message);
      } catch (error) {
        // Preserve the continuation even if a host-side queue mutation rejects the move.
        if (removed) {
          try {
            agent.inbox.append('next-turn', message);
          } catch (rollbackError) {
            console.error(
              `[auto-continue] 恢复续跑消息失败 ${agent.id}: ${
                rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
              }`,
            );
          }
        }
        console.error(
          `[auto-continue] 调整续跑消息顺序失败 ${agent.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    });
    const config = this.getConfig();
    if (config.scanOnBoot) {
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

  /** 对外(状态桥): 今日统计快照。 */
  todayStats(): DayStats {
    const today = todayKey();
    if (this.dayStats.date !== today) this.dayStats = emptyDayStats();
    return { ...this.dayStats, byCode: { ...this.dayStats.byCode } };
  }

  recentRecoveryAttempts(): RecoveryAttempt[] {
    return this.recoveryAttempts.map(attempt => ({ ...attempt }));
  }

  /** 对外(状态桥): 当前生效的会话级暂停列表。 */
  activePauses(): { sessionId: SessionId; until: number }[] {
    const now = Date.now();
    const out: { sessionId: SessionId; until: number }[] = [];
    for (const [sessionId, until] of this.pauseUntil) {
      if (until > now) out.push({ sessionId, until });
    }
    return out;
  }

  /** 对外(状态桥): 订阅通知事件(SSE 端点推送)。 */
  subscribeNotices(listener: () => void): () => void {
    this.noticeListeners.add(listener);
    return () => {
      this.noticeListeners.delete(listener);
    };
  }

  /** 对外(状态桥): 订阅运行时状态变化(统计/暂停列表)。 */
  subscribeState(listener: () => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private emitState(): void {
    for (const listener of this.stateListeners) listener();
  }

  private sessionConfig(sessionId: SessionId): AutoContinueConfig {
    const config = this.getConfig();
    if (this.isSubagentSession(sessionId)) {
      // A subagent inherits only the enabled/off decision of its main
      // conversation (an explicit mode stored for the child wins). It never runs
      // the autonomous loop or the loop guard, and the startup scan keeps leaving
      // it to its parent: those three stay parent-only.
      const enabled = this.subagentRecoveryEnabled(sessionId);
      return {
        ...config,
        paused: config.paused || !enabled,
        resumeCompletedTurns: false,
        loopGuard: false,
      };
    }
    return this.ownSessionConfig(sessionId);
  }

  /**
   * The session's own mode, ignoring subagent inheritance. The stored-session
   * sweep and the restart hand-off (`resumeInterruptedChildren`) use this, so
   * turning live subagent recovery off never silently disables them.
   */
  private ownSessionConfig(sessionId: SessionId): AutoContinueConfig {
    const config = this.getConfig();
    const mode = sessionMode(config.sessionModes, sessionId);
    return {
      ...config,
      paused: config.paused || mode === 'off',
      resumeCompletedTurns: mode === 'default' ? config.resumeCompletedTurns : mode === 'loop',
      loopGuard: config.loopGuard && mode !== 'off',
    };
  }

  configurationChanged(): void {
    if (this.disposed) return;
    for (const [sessionId, state] of this.states) {
      const config = this.sessionConfig(sessionId);
      // 循环由关到开视为一次新的授权: 轮数上限重新计数。
      if (config.resumeCompletedTurns && state.loopEnabled === false) this.resetLoopIterations(state);
      state.loopEnabled = config.resumeCompletedTurns;
      if (config.paused || (isLoopReason(state.pendingReason ?? '') && !config.resumeCompletedTurns)) {
        this.cancelPending(sessionId, '会话模式或全局设置已更改');
      }
    }
    this.emitState();
  }

  /** 对外(状态桥): 消费待展示的通知。 */
  drainNotices(): HostNotice[] {
    return this.notices.splice(0, this.notices.length);
  }

  /** 通知动作(browser 通知按钮回传): 立即续跑 / 暂停该会话 / 解除暂停 / 清零统计。 */
  handleNoticeAction(sessionId: SessionId | undefined, action: string): void {
    if (action === 'unpause') {
      if (sessionId !== undefined) this.pauseUntil.delete(sessionId);
      this.log(`解除暂停 ${sessionId ?? '?'}`);
    } else if (action === 'reset-stats') {
      this.dayStats = emptyDayStats();
      this.log('清零今日统计');
    } else if (sessionId !== undefined) {
      this.onNotifyAction(sessionId, action);
    }
    this.emitState();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopStoredSweep.abort();
    if (this.bootScanTimer !== undefined) clearTimeout(this.bootScanTimer);
    this.bootScanTimer = undefined;
    this.wakeBootScan?.();
    this.wakeBootScan = undefined;
    this.disposeSessionEvents();
    this.disposeInboxEvents();
    this.prioritizedFollowups.clear();
    for (const state of this.states.values()) {
      if (state.pendingTimer !== undefined) clearTimeout(state.pendingTimer);
      if (state.loopRetryTimer !== undefined) clearTimeout(state.loopRetryTimer);
      if (state.cooldownRetryTimer !== undefined) clearTimeout(state.cooldownRetryTimer);
      if (state.offlineTimer !== undefined) clearTimeout(state.offlineTimer);
      state.offlineWait = undefined;
    }
    this.states.clear();
    this.parents.clear();
    this.subagentSessions.clear();
  }

  private state(sessionId: SessionId): SessionState {
    let state = this.states.get(sessionId);
    if (state === undefined) {
      state = freshState();
      this.states.set(sessionId, state);
    }
    return state;
  }

  /** Record a subagent session's lineage and its parent id when the header carries one. */
  private noteSubagent(sessionId: SessionId, parentSession?: SessionId): void {
    this.subagentSessions.add(sessionId);
    if (parentSession !== undefined && parentSession !== '') {
      this.parents.set(sessionId, parentSession);
    } else if (!this.parents.has(sessionId)) {
      this.parents.set(sessionId, undefined);
    }
  }

  /** Read durable origin from the live agent for direct action paths as well. */
  private isSubagent(sessionId: SessionId, state: SessionState): boolean {
    if (state.subagent) return true;
    const header = this.ctx.agents.get(sessionId)?.session?.header;
    if (header?.origin !== 'subagent') return false;
    state.subagent = true;
    this.noteSubagent(sessionId, header.parentSession);
    return true;
  }

  /** Header origin, cached set or state flag; for paths that only have the session id. */
  private isSubagentSession(sessionId: SessionId): boolean {
    if (this.subagentSessions.has(sessionId)) return true;
    const state = this.states.get(sessionId);
    if (state?.subagent === true) return true;
    const header = this.ctx.agents.get(sessionId)?.session?.header;
    if (header?.origin !== 'subagent') return false;
    this.noteSubagent(sessionId, header.parentSession);
    return true;
  }

  /**
   * Direct subagent parent id. DSH stores fork lineage in the same
   * `header.parentSession` field, so only a session whose header origin is
   * `subagent` may be followed upward: an ordinary ancestor (the visible main
   * conversation, even a forked one) is the top of the recovery lineage.
   */
  private parentOf(sessionId: SessionId): SessionId | undefined {
    if (this.parents.has(sessionId)) return this.parents.get(sessionId);
    const header = this.ctx.agents.get(sessionId)?.session?.header;
    // No live header yet: leave the lineage unresolved so a later live agent
    // with the same id can still provide it instead of caching "no parent".
    if (header === undefined) return undefined;
    if (header.origin !== 'subagent') {
      this.parents.set(sessionId, undefined); // known ordinary: top of the lineage
      return undefined;
    }
    const parent = header.parentSession;
    this.noteSubagent(sessionId, parent);
    return parent;
  }

  /** Explicit session mode stored for this exact id, if the user gave one. */
  private explicitMode(sessionId: SessionId): SessionMode | undefined {
    const modes = this.getConfig().sessionModes;
    const mode = modes[sessionId];
    return Object.prototype.hasOwnProperty.call(modes, sessionId) && isSessionMode(mode) ? mode : undefined;
  }

  /**
   * A subagent's effective mode, or `undefined` when the lineage cannot be
   * verified. An intermediate parent that is no longer live (and was never seen
   * here) used to stop the walk early, fall back to the profile default and
   * resume a child whose main conversation is Off; refusing the send is safe.
   */
  private resolveSubagentMode(sessionId: SessionId): SessionMode | undefined {
    const own = this.explicitMode(sessionId);
    if (own !== undefined) return own;
    const seen = new Set<SessionId>([sessionId]);
    let current: SessionId = sessionId;
    for (let depth = 0; depth < 32; depth += 1) {
      const known = this.parents.has(current);
      const header = this.ctx.agents.get(current)?.session?.header;
      // The chain is not visible yet (an intermediate parent never live here), so
      // neither its mode nor its pause can be verified. Refuse the send and
      // re-resolve on the next event once that ancestor appears.
      if (!known && header === undefined) return undefined;
      const parent = known
        ? this.parents.get(current)
        : header?.origin === 'subagent' ? header.parentSession : undefined;
      if (parent === undefined || parent === '') {
        // A subagent without `parentSession` is unlinked: nothing to inherit. Check the
        // cached flag too, so this still holds once the child's header is gone.
        if (header?.origin === 'subagent' || this.subagentSessions.has(current)) return undefined;
        return this.explicitMode(current) ?? 'default';
      }
      if (seen.has(parent)) return undefined;
      seen.add(parent);
      current = parent;
    }
    return undefined;
  }

  /** Whether the setting and the inherited main-chat mode allow live recovery for this child. */
  private subagentRecoveryEnabled(sessionId: SessionId): boolean {
    if (!this.getConfig().resumeSubagentSessions) return false;
    const mode = this.resolveSubagentMode(sessionId);
    return mode !== undefined && mode !== 'off';
  }

  /** Modes children inherit from their main conversation, for the composer's display. */
  inheritedSubagentModes(): Record<string, SessionMode> {
    this.pruneLineage();
    const inherited: Record<string, SessionMode> = {};
    for (const sessionId of this.parents.keys()) {
      // Only children that are still loaded can show a composer; skip the rest.
      if (this.ctx.agents.get(sessionId) === undefined) continue;
      if (!this.isSubagentSession(sessionId)) continue;
      if (this.explicitMode(sessionId) !== undefined) continue;
      const mode = this.resolveSubagentMode(sessionId);
      // Children never run the autonomous loop, so a loop parent means recovery for them.
      if (mode !== undefined) inherited[sessionId] = mode === 'loop' ? 'recover' : mode;
    }
    return inherited;
  }

  /**
   * Keep the lineage caches bounded on long-lived hosts. Once the cache grows,
   * entries for sessions that are no longer loaded are dropped; they are re-read
   * from the live header if the session comes back.
   */
  private pruneLineage(): void {
    if (this.parents.size + this.subagentSessions.size <= LINEAGE_CACHE_LIMIT) return;
    // `states` keeps its own `subagent` flag, so dropping a non-loaded child here loses nothing.
    const keep = (sessionId: SessionId) => this.ctx.agents.get(sessionId) !== undefined;
    const needed = new Set<SessionId>();
    for (const sessionId of this.parents.keys()) {
      if (!keep(sessionId)) continue;
      // Keep the chain above a loaded child so its inherited mode still resolves.
      let current: SessionId | undefined = sessionId;
      for (let depth = 0; depth < 32 && current !== undefined && !needed.has(current); depth += 1) {
        needed.add(current);
        current = this.parents.get(current);
      }
    }
    for (const sessionId of [...this.parents.keys()]) if (!needed.has(sessionId)) this.parents.delete(sessionId);
    for (const sessionId of [...this.subagentSessions]) if (!needed.has(sessionId) && !keep(sessionId)) this.subagentSessions.delete(sessionId);
  }

  /** Mark a child session; drop only queued sends that its effective policy no longer allows. */
  private markSubagent(sessionId: SessionId, state: SessionState, parentSession?: SessionId): void {
    const first = !state.subagent;
    state.subagent = true;
    this.noteSubagent(sessionId, parentSession);
    if (first && !this.subagentRecoveryEnabled(sessionId)) this.cancelPending(sessionId, '子代理会话');
  }

  /** Pause deadline, including the parents' "pause this session 1h" for subagents. */
  private effectivePauseUntil(sessionId: SessionId): number {
    let until = this.pauseUntil.get(sessionId) ?? 0;
    if (!this.isSubagentSession(sessionId)) return until;
    // parentOf() only follows subagent-origin sessions, so fork lineage of the
    // main conversation is never treated as a parent for pause purposes.
    const seen = new Set<SessionId>([sessionId]);
    let current: SessionId | undefined = sessionId;
    for (let depth = 0; depth < 32; depth += 1) {
      current = this.parentOf(current);
      if (current === undefined || current === '' || seen.has(current)) break;
      seen.add(current);
      until = Math.max(until, this.pauseUntil.get(current) ?? 0);
    }
    return until;
  }

  /** Whether this session sits below `ancestorId` in the subagent lineage (never fork lineage). */
  private isDescendantOf(sessionId: SessionId, ancestorId: SessionId): boolean {
    const seen = new Set<SessionId>([sessionId]);
    let current: SessionId | undefined = sessionId;
    for (let depth = 0; depth < 32; depth += 1) {
      current = this.parentOf(current);
      if (current === undefined || current === '') return false;
      if (current === ancestorId) return true;
      if (seen.has(current)) return false;
      seen.add(current);
    }
    return false;
  }

  /**
   * 事件入口(host 单实例): 预处理工具调用/结果/模型消息(护栏与循环信号),
   * 然后交给回合状态机。
   */
  private onHostEvent(session: Session, event: SessionEvent): void {
    const sessionId = session.id;
    const sessionState = this.states.get(sessionId);
    if (session.header?.origin === 'subagent') {
      this.markSubagent(sessionId, sessionState ?? this.state(sessionId), session.header.parentSession);
    } else if (sessionState?.subagent) {
      // Origin known from an earlier frame; keep the lineage fresh and process the
      // event normally instead of ignoring a subagent's live turn.
      this.noteSubagent(sessionId, session.header?.parentSession ?? this.parentOf(sessionId));
    }
    if (sessionState?.maintenanceTurn !== undefined &&
        sessionState.maintenanceTurn === (event.data as { turn?: number }).turn &&
        event.type !== 'turn/start' && event.type !== 'turn/end') return;
    if (
      (event.type === 'user/message' || event.type === 'assistant/message') &&
      typeof event.surfaceOp === 'object' &&
      event.surfaceOp !== null
    ) {
      // Compaction replacement 不是新消息，也可能 shadow 整段工具结果。
      this.state(sessionId).tools.recordSurfaceReplacement(event.seq);
      return;
    }
    if (event.type === 'tool/call') {
      const state = this.state(sessionId);
      // 任何新鲜调用都代表进展（即使缺关联 id）；旧帧重放不能清短句 streak。
      if (state.tools.recordCall(event)) {
        state.shortRun = 0;
        state.sameTextRun = 0;
        state.lastAssistantText = '';
        if (this.tracksOutput(state, event)) state.turnOutput = 'visible';
      }
    } else if (event.type === 'tool/result') {
      const state = this.state(sessionId);
      state.tools.recordResult(event);
    } else if (event.type === 'step/start') {
      const state = this.state(sessionId);
      if (this.tracksOutput(state, event) && state.turnOutput === 'empty') state.turnOutput = 'silent';
      const repeat = state.tools.confirmRepeatAtStep(event.seq);
      if (repeat !== undefined) this.checkLoop(sessionId, state, repeat);
    } else if (event.type === 'assistant/chunk') {
      const state = this.state(sessionId);
      if (this.tracksOutput(state, event)) {
        const chunk = event.data.chunk;
        const visible = (chunk.type === 'text-delta' && visibleText(chunk.text) !== '') ||
          chunk.type === 'tool-call-delta' ||
          (chunk.type === 'block-end' && this.hasVisibleContent([chunk.block])) ||
          (chunk.type === 'block-start' && chunk.blockType !== 'reasoning' && chunk.blockType !== 'text');
        if (visible) state.turnOutput = 'visible';
        else if (state.turnOutput === 'empty' && chunk.type !== 'usage' && chunk.type !== 'finish') state.turnOutput = 'silent';
      }
      this.onAssistantChunk(sessionId, state, event);
    } else if (event.type === 'assistant/message') {
      const state = this.state(sessionId);
      if (this.tracksOutput(state, event)) {
        if (this.hasVisibleContent(event.data.message.content)) state.turnOutput = 'visible';
        else if (state.turnOutput === 'empty') state.turnOutput = 'silent';
      }
      this.onAssistantMessage(sessionId, state, event);
    }
    this.onSessionEvent(sessionId, event);
  }

  private tracksOutput(state: SessionState, event: SessionEvent): boolean {
    return state.running === true && state.outputTurn === (event.data as { turn?: number }).turn &&
      event.seq > state.outputStartSeq;
  }

  /** Treat unknown block kinds conservatively: only reasoning and blank text are silent. */
  private hasVisibleContent(content: unknown): boolean {
    if (!Array.isArray(content)) return false;
    return content.some((part: unknown) => {
      if (part === null || typeof part !== 'object') return true;
      const block = part as { type?: unknown; text?: unknown };
      if (block.type === 'reasoning') return false;
      if (block.type === 'text') return typeof block.text !== 'string' || visibleText(block.text) !== '';
      return true;
    });
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

  private assistantChunkText(event: SessionEvent<'assistant/chunk'>): string {
    return event.data.chunk.type === 'text-delta' ? event.data.chunk.text : '';
  }

  private normalizedSegment(text: string): string {
    return visibleText(text).replace(/\s+/g, ' ');
  }

  private isNearDuplicateSegment(left: string, right: string): boolean {
    if (left === right) return true;
    const leftLen = left.length;
    const rightLen = right.length;
    const longer = Math.max(leftLen, rightLen);
    const shorter = Math.min(leftLen, rightLen);
    if (shorter === 0 || shorter / longer < 0.85) return false;
    if (longer > STREAM_NEAR_DUPLICATE_MAX_CHARS) return false;
    const maxDistance = Math.max(6, Math.floor(longer * 0.08));
    if (Math.abs(leftLen - rightLen) > maxDistance) return false;
    return this.withinEditDistance(left, right, maxDistance);
  }

  private withinEditDistance(left: string, right: string, maxDistance: number): boolean {
    if (left === right) return true;
    if (maxDistance < 0) return false;
    const leftLen = left.length;
    const rightLen = right.length;
    if (Math.abs(leftLen - rightLen) > maxDistance) return false;
    if (leftLen === 0 || rightLen === 0) return Math.max(leftLen, rightLen) <= maxDistance;
    const unreachable = maxDistance + 1;
    let previous = new Int32Array(rightLen + 1);
    let current = new Int32Array(rightLen + 1);
    previous.fill(unreachable);
    for (let col = 0; col <= Math.min(rightLen, maxDistance); col += 1) {
      previous[col] = col;
    }
    for (let row = 1; row <= leftLen; row += 1) {
      current.fill(unreachable);
      if (row <= maxDistance) current[0] = row;
      const firstCol = Math.max(1, row - maxDistance);
      const lastCol = Math.min(rightLen, row + maxDistance);
      let minInRow = unreachable;
      for (let col = firstCol; col <= lastCol; col += 1) {
        const insertion = (current[col - 1] ?? unreachable) + 1;
        const deletion = (previous[col] ?? unreachable) + 1;
        const substitution =
          (previous[col - 1] ?? unreachable) +
          (left.charCodeAt(row - 1) === right.charCodeAt(col - 1) ? 0 : 1);
        const score = Math.min(insertion, deletion, substitution, unreachable);
        current[col] = score;
        if (score < minInRow) minInRow = score;
      }
      if (minInRow > maxDistance) return false;
      [previous, current] = [current, previous];
    }
    return (previous[rightLen] ?? unreachable) <= maxDistance;
  }

  private noteStreamSegment(sessionId: SessionId, state: SessionState, segment: string): void {
    const normalized = this.normalizedSegment(segment);
    const config = this.getConfig();
    if (normalized === '') return;
    if (normalized.length < config.loopShortChars) {
      state.streamLastSegment = '';
      state.streamRepeatRun = 0;
      return;
    }
    if (
      state.streamLastSegment !== '' &&
      this.isNearDuplicateSegment(normalized, state.streamLastSegment)
    ) {
      state.streamRepeatRun += 1;
      state.streamLastSegment = normalized;
    } else {
      state.streamLastSegment = normalized;
      state.streamRepeatRun = 1;
    }
    if (state.streamRepeatRun >= config.loopRepeatText) {
      this.log(
        `检测到流式消息内复读 ${sessionId}: 连续 ${state.streamRepeatRun} 段近似重复文本`,
      );
      this.interruptLoop(sessionId, state);
    }
  }

  private onAssistantChunk(
    sessionId: SessionId,
    state: SessionState,
    event: SessionEvent<'assistant/chunk'>,
  ): void {
    if (!this.sessionConfig(sessionId).loopGuard || !state.running || state.loopFired) return;
    const chunk = this.assistantChunkText(event);
    if (chunk === '') return;
    const merged = `${state.streamTail}${chunk}`.replace(/\r/g, '');
    const pieces = merged.split(/\n(?:[ \t]*\n)+/u);
    const tail = pieces.pop() ?? '';
    for (const piece of pieces) this.noteStreamSegment(sessionId, state, piece);
    if (tail.length <= STREAM_TAIL_MAX_CHARS) {
      state.streamTail = tail;
      return;
    }
    state.streamTail = tail.slice(-STREAM_TAIL_MAX_CHARS);
    if (/\S/u.test(tail)) {
      state.streamLastSegment = '';
      state.streamRepeatRun = 0;
    }
  }

  private onAssistantMessage(
    sessionId: SessionId,
    state: SessionState,
    event: SessionEvent<'assistant/message'>,
  ): void {
    if (!this.sessionConfig(sessionId).loopGuard) return;
    const text = this.assistantText(event);
    const trimmed = visibleText(text);
    // 相同文本重复(不限长度): 模型反复输出完全相同的消息是最强的循环信号,
    // 例如 "Let me test variants of the regex..." 连续 7 遍
    if (trimmed !== '' && trimmed === state.lastAssistantText) {
      state.sameTextRun += 1;
    } else {
      state.lastAssistantText = trimmed;
      state.sameTextRun = trimmed === '' ? 0 : 1;
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
    const streamTail = state.streamTail;
    state.streamTail = '';
    if (streamTail !== '') this.noteStreamSegment(sessionId, state, streamTail);
    state.streamLastSegment = '';
    state.streamRepeatRun = 0;
    this.checkLoop(sessionId, state);
  }

  /** 两个循环信号的公共检查; 命中且本回合未打断过则打断。 */
  private checkLoop(
    sessionId: SessionId,
    state: SessionState,
    toolRepeat?: ToolRepeatSignal,
  ): void {
    if (!this.sessionConfig(sessionId).loopGuard) return;
    if (state.loopFired) return;
    if (!state.running) return; // 只干预运行中的回合
    const config = this.getConfig();
    if (state.sameTextRun >= config.loopRepeatText) {
      this.log(`检测到空转循环 ${sessionId}: 连续 ${state.sameTextRun} 条相同消息`);
      this.interruptLoop(sessionId, state);
    } else if (state.shortRun >= config.loopShortCount) {
      this.log(`检测到空转循环 ${sessionId}: 连续 ${state.shortRun} 条短句且无工具调用`);
      this.interruptLoop(sessionId, state);
    } else if (toolRepeat !== undefined && toolRepeat.count >= config.loopToolRepeat) {
      this.log(`检测到工具死循环 ${sessionId}: 「${toolRepeat.tool}」连续 ${toolRepeat.count} 次(同参数同结果)`);
      this.interruptLoop(sessionId, state);
    }
  }

  /**
   * 打断运行中的回合: cancel(带来源标记)+ 进冷却。
   * 只有随后持久化的 turn/end 精确携带专属 hook cause 时,
   * 才会用 loopText 重启回合——DSH 的 first-cause 语义保证用户 Stop 优先。
   */
  private interruptLoop(sessionId: SessionId, state: SessionState): void {
    if (this.isSubagent(sessionId, state)) return;
    if (state.loopFired) return;
    // 打断本身受冷却约束: 距上次打断/发送太近时不再打断, 防止反复打断刷屏
    if (Date.now() - state.lastAttemptAt < this.cooldownFor(state)) {
      this.log(`跳过循环打断 ${sessionId}: 处于冷却期`);
      return;
    }
    state.loopFired = true;
    state.lastAttemptAt = Date.now(); // 打断计入冷却, 防反复打断
    try {
      const agent = this.ctx.agents.get(sessionId);
      if (agent === undefined) {
        this.log(`打断循环失败 ${sessionId}: 无 live agent`);
        state.loopFired = false;
        return;
      }
      agent.cancel(LOOP_GUARD_CANCEL_CAUSE, { keepInbox: true });
      this.log(`已打断循环 ${sessionId}: cancel 已受理`);
    } catch (error) {
      this.log(`打断循环失败 ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
      state.loopFired = false;
    }
  }

  private onSessionEvent(sessionId: SessionId, event: SessionEvent): void {
    const state = this.state(sessionId);
    switch (event.type) {
      case 'turn/start':
        state.running = true;
        state.maintenanceTurn = isMaintenanceTurnStart(event) ? event.data.turn : undefined;
        if (state.maintenanceTurn !== undefined) state.pendingRecoveryAt = 0;
        // 新回合开始: 清空上一步工具调用状态, 避免跨回合误用护栏
        state.tools.startTurn(event.seq);
        // loop guard 状态按回合重置
        state.shortRun = 0;
        state.lastShortAt = 0;
        state.lastAssistantText = '';
        state.sameTextRun = 0;
        state.streamTail = '';
        state.streamLastSegment = '';
        state.streamRepeatRun = 0;
        state.loopFired = false;
        state.turnOutput = 'empty';
        state.outputTurn = event.data.turn;
        state.outputStartSeq = event.seq;
        if (state.loopRetryTimer !== undefined) {
          clearTimeout(state.loopRetryTimer);
          state.loopRetryTimer = undefined;
        }
        this.cancelPending(sessionId, '宿主自行开启新回合');
        break;
      case 'turn/end': {
        state.running = false;
        const loopCancelPending = state.loopFired;
        state.loopFired = false;
        this.cancelPending(sessionId, '收到新的 turn/end');
        const turnOutput = state.outputTurn === event.data.turn ? state.turnOutput : 'unknown';
        state.turnOutput = 'unknown';
        state.outputTurn = undefined;
        const maintenance = state.maintenanceTurn !== undefined && state.maintenanceTurn === event.data.turn;
        state.maintenanceTurn = undefined;
        if (maintenance) {
          this.log(`跳过维护回合 ${sessionId}(message-ops): 不触发自动继续`);
          break;
        }
        const reason = event.data.reason;
        const reasonKind = readReasonKind(reason);
        if (reasonKind === undefined) {
          console.error(`[auto-continue] 忽略畸形 turn/end ${sessionId}: reason 无法解释`);
          break;
        }
        if (reasonKind === 'no-visible-output' || (reasonKind === 'completed' && turnOutput === 'silent')) {
          // 已观察到模型活动但没有可见输出; 没有模型活动的空回合不属于此类。
          // 不清零 consecutive: 每轮都卡住的模型仍受冷却与连续上限约束。
          // `no-visible-output` 是 DSH 为同一种回合提议的结束原因, 按同样方式处理。
          state.lastFailure = undefined;
          state.lastTurn = event.data.turn;
          state.lastFailureAt = Date.now();
          this.noteRecovery(sessionId, 'error');
          if (this.sessionConfig(sessionId).resumeCompletedTurns) {
            // 自主循环覆盖无可见输出的回合, 但这类回合是「失败」而非成功:
            // 不 force, 否则会绕过连续上限与冷却, 让卡住的模型无限重试。
            this.schedule(sessionId, LOOP_SILENT_REASON);
          } else if (this.sessionConfig(sessionId).resumeSilentTurns) {
            this.schedule(sessionId, `turn/end:${reasonKind}:silent`);
          }
          break;
        }
        if (reasonKind === 'completed') {
          // Only observed visible output proves recovery; no-op and unknown
          // turns must not erase the retry budget or count as successful.
          // 自主循环的例外只在于「是否续跑」, 不在于「是否清零预算」: 循环对每个
          // completed 回合都强制续跑, 但失败预算依旧只在可见输出时清零, 否则
          // 空回合/未观察到的回合会不断抹掉连续计数, 令连续上限永远无法生效。
          if (this.sessionConfig(sessionId).resumeCompletedTurns) {
            if (turnOutput === 'visible') {
              state.consecutive = 0;
              state.lastFailure = undefined;
              this.noteRecovery(sessionId, 'completed');
            }
            this.schedule(sessionId, LOOP_COMPLETED_REASON, true);
          } else if (turnOutput === 'visible') {
            state.consecutive = 0;
            state.lastFailure = undefined;
            this.noteRecovery(sessionId, 'completed');
          }
        } else if (reasonKind === 'aborted') {
          if (isLoopGuardCancelReason((reason as { reason?: unknown }).reason)) {
            if (this.sessionConfig(sessionId).paused) break;
            // 我们自己的 loop guard 打断: 视为可恢复中断, 用循环提示文本重启回合。
            // 不清 consecutive / lastAttemptAt: 冷却与连续上限在 loop 路径同样生效,
            // 防止无限打断重发(issue #13); 打断本身受冷却约束, 重启也要等冷却。
            if (loopCancelPending) this.bumpStat({ looped: 1 });
            state.pendingRecoveryAt = 0;
            state.shortRun = 0;
            state.lastShortAt = 0;
            state.lastAssistantText = '';
            state.sameTextRun = 0;
            state.streamTail = '';
            state.streamLastSegment = '';
            state.streamRepeatRun = 0;
            state.tools.resetRepeat();
            // 重启受冷却约束(防紧密打断循环): 等剩余冷却结束后再调度
            const cooldown = this.cooldownFor(state);
            const remaining = cooldown - (Date.now() - state.lastAttemptAt);
            if (remaining > 0) {
              if (state.loopRetryTimer !== undefined) clearTimeout(state.loopRetryTimer);
              state.loopRetryTimer = setTimeout(() => {
                state.loopRetryTimer = undefined;
                try {
                  this.schedule(sessionId, 'loop:aborted');
                } catch (error) {
                  console.error(`[auto-continue] loop 重启异常 ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
                }
              }, remaining + 10); // +10ms: the schedule re-check compares Date.now() against the cooldown; a 1ms wall-clock step can otherwise make it read just under, silently dropping the restart
              this.log(`loop 重启延迟 ${remaining}ms(冷却期) ${sessionId}`);
            } else {
              this.schedule(sessionId, 'loop:aborted');
            }
          } else {
            // 用户主动停止: 不自动继续, 视为用户介入
            state.consecutive = 0;
            state.pendingRecoveryAt = 0;
          }
        } else if (reasonKind === 'blocked') {
          // 策略拒绝: 不自动继续
        } else if (reasonKind === 'interrupted') {
          // 实时路径的 interrupted 仅来自崩溃修复重载(loop 从不实时发出);
          // 用户手动停止在 DSH 中标记为 aborted, 不走到这里。实时流里出现
          // interrupted 视为异常中断, 不自动继续——宿主崩溃孤儿回合由扫描恢复。
          state.consecutive = 0;
          state.pendingRecoveryAt = 0;
        } else if (reasonKind === 'error') {
          // 记录失败事实(分类与模板填充用), 然后按类型处理
          const failure = parseFailureFacts((reason as { error?: unknown }).error);
          if (failure === undefined) {
            console.error(`[auto-continue] 忽略畸形 turn/end ${sessionId}: error details 无法解释`);
            break;
          }
          state.lastFailure = failure;
          state.lastTurn = event.data.turn;
          state.lastFailureAt = Date.now();
          this.noteRecovery(sessionId, 'error');
          this.onTurnFailure(sessionId, 'turn/end:error', state.lastFailure);
        } else if (reasonKind === 'max-tokens') {
          state.lastFailureAt = Date.now();
          this.noteRecovery(sessionId, 'error');
          this.schedule(sessionId, 'turn/end:max-tokens');
        }
        break;
      }
      case 'user/message':
        if (isOurEcho(state, event)) break; // 我们自己的回显(跨标签页识别)
        if (event.data.source.kind === 'user') {
          // 用户手动介入: 清零上限与跨标签页发送计数
          state.consecutive = 0;
          this.resetLoopIterations(state);
          this.cancelPending(sessionId, '用户手动发送消息');
        }
        break;
      default:
        break;
    }
  }

  // ---------- host 帧 ----------

  private onTurnFailure(sessionId: SessionId, reason: string, failure: FailureFacts): void {
    const config = this.getConfig();
    if (this.isSubagentSession(sessionId)) {
      // Subagents inherit only the main conversation's enabled/off decision; an
      // Off parent or the disabled setting means no live recovery at all. The
      // global pause is not checked here, so diagnostics for permanent errors
      // match ordinary sessions while paused.
      if (!this.subagentRecoveryEnabled(sessionId)) return;
    } else if (sessionMode(config.sessionModes, sessionId) === 'off') return;
    if (config.classify && !isTransientFailure(failure, config.retryableErrorPatterns)) {
      const copy = NOTICE_COPY[config.locale];
      const summary = `${failure.code}${failure.status !== undefined ? ` (HTTP ${failure.status})` : ''}`;
      this.log(`跳过 ${sessionId}(${reason}): 永久性失败 ${summary} — ${failure.message}`);
      this.bumpStat({ skipped: 1, code: failure.code });
      if (config.notify) {
        this.notify(
          sessionId,
          copy.notContinuedTitle,
          copy.permanentErrorBody(sessionId, summary),
          this.notifyOptions(sessionId, config.locale),
        );
      }
      return;
    }
    this.schedule(sessionId, reason);
  }

  /** 通知操作按钮与回调(「立即续跑」/「暂停该会话 1 小时」)。 */
  private notifyOptions(sessionId: SessionId, locale: AutoContinueLocale): NotifyOptions {
    const copy = NOTICE_COPY[locale];
    // 未物化的存储会话没有 live agent, 「立即续跑」只会空转; 只保留暂停。
    const actions: NotifyAction[] = this.ctx.agents.get(sessionId) === undefined
      ? [{ action: 'pause1h', title: copy.pauseAction }]
      : [
        { action: 'resume', title: copy.resumeAction },
        { action: 'pause1h', title: copy.pauseAction },
      ];
    return { actions, onAction: (action) => this.onNotifyAction(sessionId, action) };
  }

  private onNotifyAction(sessionId: SessionId, action: string): void {
    if (action === 'resume') {
      this.log(`通知按钮: 立即续跑 ${sessionId}`);
      void this.resumeNow(sessionId);
    } else if (action === 'pause1h') {
      this.log(`通知按钮: 暂停 ${sessionId} 1 小时`);
      this.pauseUntil.set(sessionId, Date.now() + 60 * 60 * 1000);
      this.cancelPending(sessionId, '通知按钮暂停该会话');
      // A paused main conversation also suspends the subagents it owns.
      for (const candidate of this.states.keys()) {
        if (candidate !== sessionId && this.isDescendantOf(candidate, sessionId)) {
          this.cancelPending(candidate, '父会话已暂停');
        }
      }
    }
  }


  /** 内存统计(host 单实例): 按今日桶累计。 */
  private bumpStat(delta: {
    sent?: number;
    skipped?: number;
    recovered?: number;
    failed?: number;
    gaveUp?: number;
    looped?: number;
    code?: string;
  }): void {
    const today = todayKey();
    if (this.dayStats.date !== today) this.dayStats = emptyDayStats();
    if (delta.sent !== undefined) this.dayStats.sent += delta.sent;
    if (delta.skipped !== undefined) this.dayStats.skipped += delta.skipped;
    if (delta.recovered !== undefined) this.dayStats.recovered += delta.recovered;
    if (delta.failed !== undefined) this.dayStats.failed += delta.failed;
    if (delta.gaveUp !== undefined) this.dayStats.gaveUp += delta.gaveUp;
    if (delta.looped !== undefined) this.dayStats.looped += delta.looped;
    if (delta.code !== undefined) {
      this.dayStats.byCode[delta.code] = (this.dayStats.byCode[delta.code] ?? 0) + 1;
    }
    // Stats are only observable through the status bridge, so every bump must
    // publish. Previously the panel only moved when a notification happened to
    // fire (notify=false by default), leaving "Auto-continued" frozen at 0.
    this.emitState();
  }

  /** 通知桥: 产生一条通知事件, SSE 端点推给 browser 侧展示。 */
  private notify(
    sessionId: SessionId,
    title: string,
    body: string,
    options?: NotifyOptions,
  ): void {
    const notice: HostNotice = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title,
      body,
      sessionId,
      ...(options?.actions !== undefined && options.actions.length > 0
        ? { actions: options.actions }
        : { actions: [] }),
      at: Date.now(),
    };
    this.notices.push(notice);
    for (const listener of this.noticeListeners) listener();
    this.emitState();
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
    this.bumpStat(outcome === 'completed' ? { recovered: 1 } : { failed: 1 });
    this.log(`恢复结果(${sessionId}): ${outcome === 'completed' ? '成功' : '失败'}`);
  }

  /** 立即为该会话发送一次自动继续(无视冷却与连续上限; 由通知按钮触发)。 */
  async resumeNow(sessionId: SessionId): Promise<void> {
    if (this.disposed) return;
    // Subagent recovery is opt-out and inherits the main conversation's mode: an
    // Off child must not receive a send through the explicit button either, even
    // though a manual send bypasses the paused flag.
    if (this.isSubagentSession(sessionId) && !this.subagentRecoveryEnabled(sessionId)) return;
    // A manual send replaces every queued one: leave a pending cooldown or
    // offline retry armed and the reader receives the continuation twice.
    this.cancelPending(sessionId, '手动续跑');
    try {
      await this.fire(sessionId, MANUAL_NOTIFICATION_REASON, true);
    } catch (error) {
      console.error(`[auto-continue] 手动续跑异常 ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
    }
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

  private schedule(sessionId: SessionId, reason: string, force = false): void {
    const state = this.state(sessionId);
    const config = this.sessionConfig(sessionId);
    if (isLoopReason(reason) && !config.resumeCompletedTurns) return;
    if (config.paused) {
      this.log(`跳过 ${sessionId}(${reason}): 自动继续已暂停`);
      return;
    }
    if (Date.now() < this.effectivePauseUntil(sessionId)) {
      this.log(`跳过 ${sessionId}(${reason}): 会话暂停中`);
      return;
    }
    if (state.pendingTimer !== undefined) return; // 已有待发送
    if (state.offlineWait !== undefined || state.offlineTimer !== undefined) return; // 断网挂起中, 恢复后自会续跑
    if (isLoopReason(reason) && this.loopCapReached(sessionId, state, config)) return;
    // 连续上限优先于冷却: 已经放弃的会话不该再安排冷却后的重试。
    // 自主循环的完成续跑(force)不受二者约束。
    if (!force && state.consecutive >= config.maxConsecutive) {
      this.log(
        `跳过 ${sessionId}(${reason}): 已连续自动继续 ${state.consecutive} 次, 等待用户介入或成功回合`,
      );
      return;
    }
    // 冷却(含失败尝试, 自适应退避): 不能直接丢弃这次恢复, 否则一次瞬时失败
    // 会把会话搁置到用户手动介入为止。
    if (!force) {
      const remaining = this.cooldownFor(state) - (Date.now() - state.lastAttemptAt);
      if (remaining > 0) {
        this.deferCooldownRetry(sessionId, reason, remaining);
        return;
      }
    }
    const timer = setTimeout(() => {
      if (state.pendingTimer !== timer) return;
      state.pendingTimer = undefined;
      state.pendingReason = undefined;
      // 保险丝: 定时器回调内任何异常(含 inactive context)都不得成为未捕获异常炸掉进程。
      try {
        this.fireWhenOnline(sessionId, reason, force);
      } catch (error) {
        console.error(`[auto-continue] 定时发送异常 ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, config.graceMs);
    state.pendingTimer = timer;
    state.pendingReason = reason;
    const template = this.templateFor(config, reason);
    this.log(
      `检测到非人为中断 ${sessionId}(${reason}), ${config.graceMs}ms 后自动发送「${template}」`,
    );
  }

  /**
   * 冷却期内的恢复: 等到冷却结束再重新调度。
   * 直接丢弃会让一次瞬时失败把会话搁置, 直到用户手动发消息才恢复。
   */
  private deferCooldownRetry(sessionId: SessionId, reason: string, remaining: number): void {
    const state = this.state(sessionId);
    if (state.cooldownRetryTimer !== undefined) clearTimeout(state.cooldownRetryTimer);
    state.pendingReason = reason;
    state.cooldownRetryTimer = setTimeout(() => {
      state.cooldownRetryTimer = undefined;
      state.pendingReason = undefined;
      try {
        this.schedule(sessionId, reason);
      } catch (error) {
        console.error(`[auto-continue] 冷却后重试异常 ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, remaining + 10); // +10ms: 同 loop 重启; 否则 1ms 抖动可能让重检仍判为冷却期而再次丢弃
    this.log(`冷却中 ${sessionId}(${reason}), ${remaining}ms 后重试`);
  }

  /** 按调度原因选择续跑模板: loop 重启、无输出回合、max-tokens、自主循环, 其余用通用继续文本。 */
  private templateFor(config: AutoContinueConfig, reason: string): string {
    if (reason.startsWith('loop:')) return config.loopText;
    // 自主循环的两种原因都用循环文本(顺序在 `:silent` 之前: 循环模式决定文本)。
    if (isLoopReason(reason)) return config.continueTextLoop;
    if (reason.endsWith(':silent')) return config.continueTextSilent;
    if (reason.includes('max-tokens')) return config.continueTextMaxTokens;
    if (reason.includes('interrupted')) return config.continueTextInterrupted;
    return config.continueText;
  }

  private cancelPending(sessionId: SessionId, why: string): void {
    const state = this.state(sessionId);
    state.pendingReason = undefined;
    let cancelled = false;
    if (state.pendingTimer !== undefined) {
      clearTimeout(state.pendingTimer);
      state.pendingTimer = undefined;
      cancelled = true;
    }
    // 冷却后的重试同样属于「待发送」: 新回合或用户介入必须让它作废。
    if (state.cooldownRetryTimer !== undefined) {
      clearTimeout(state.cooldownRetryTimer);
      state.cooldownRetryTimer = undefined;
      cancelled = true;
    }
    if (state.loopRetryTimer !== undefined) {
      clearTimeout(state.loopRetryTimer);
      state.loopRetryTimer = undefined;
      cancelled = true;
    }
    if (state.offlineWait !== undefined || state.offlineTimer !== undefined) {
      if (state.offlineTimer !== undefined) clearTimeout(state.offlineTimer);
      state.offlineTimer = undefined;
      state.offlineWait = undefined;
      state.offlineSince = 0;
      cancelled = true;
    }
    if (cancelled) this.log(`取消 ${sessionId} 的自动继续(${why})`);
  }

  /** Host-service facade used to cold-resume a disposed direct child. */
  private subagentPromptProvider: (() => unknown) | undefined;

  /** Attach the loader-provided subagent service; it may load after this plugin. */
  setSubagentPromptProvider(provider: (() => unknown) | undefined): void {
    this.subagentPromptProvider = provider;
  }

  private subagentPrompts(): {
    prompt?: (
      request: {
        parentSessionId: string;
        childSessionId: string;
        mode: 'continuable';
        requestId: string;
        content: readonly { type: 'text'; text: string }[];
        delivery: 'queue' | 'steer';
      },
      signal: AbortSignal,
    ) => Promise<{ messageId?: string }>
  } | undefined {
    const provided = this.subagentPromptProvider?.();
    if (provided !== undefined && provided !== null) return provided as ReturnType<typeof this.subagentPrompts>;
    try {
      return this.ctx.get('subagents') as ReturnType<typeof this.subagentPrompts>;
    } catch {
      return undefined;
    }
  }

  /**
   * Revive a disposed child through the host's cold resume and deliver the
   * continuation to it. Falls back to the main-conversation hand-off when the
   * host cannot resume (no persistence, no live parent, not a direct child).
   */
  private async reviveChild(sessionId: SessionId, reason: string, text: string): Promise<void> {
    if (this.disposed || this.getConfig().paused) return;
    const parent = this.parentOf(sessionId);
    if (parent === undefined || parent === '' || this.explicitMode(parent) === 'off') return;
    const parentAgent = this.ctx.agents.get(parent);
    const prompts = this.subagentPrompts();
    this.log(`恢复尝试 ${sessionId}: parent=${parent} parentLive=${parentAgent !== undefined} prompt=${typeof prompts?.prompt}`);
    if (parentAgent === undefined || typeof prompts?.prompt !== 'function') {
      this.handOffToParent(sessionId, reason);
      return;
    }
    try {
      await prompts.prompt(
        {
          parentSessionId: parent,
          childSessionId: sessionId,
          mode: 'continuable',
          requestId: randomUUID(),
          content: [{ type: 'text', text }],
          delivery: 'queue',
        },
        new AbortController().signal,
      );
      this.log(`已冷恢复子代理 ${sessionId}`);
    } catch (error) {
      this.log(`冷恢复 ${sessionId} 失败: ${error instanceof Error ? error.message : String(error)}`);
      this.handOffToParent(sessionId, reason);
    }
  }

  /** Existing state of a session, without materializing one just to read it. */
  private parentState(sessionId: SessionId): SessionState | undefined {
    return this.states.get(sessionId);
  }

  /** Whether this session already has a continuation on the way. */
  private hasPendingSend(state: SessionState): boolean {
    return state.pendingTimer !== undefined
      || state.cooldownRetryTimer !== undefined
      || state.loopRetryTimer !== undefined
      || state.offlineWait !== undefined
      || state.offlineTimer !== undefined;
  }

  /**
   * Ask the child's main conversation to take over a failure the plugin cannot
   * repair itself: the child handle is gone, so only the root can continue it.
   */
  private handOffToParent(sessionId: SessionId, reason: string): void {
    if (this.disposed || this.getConfig().paused) return;
    const parent = this.parentOf(sessionId);
    if (parent === undefined || parent === '') return;
    if (this.explicitMode(parent) === 'off') return;
    const parentAgent = this.ctx.agents.get(parent);
    if (parentAgent === undefined) {
      this.log(`移交跳过 ${sessionId}: 主会话 ${parent} 无 live agent`);
      return;
    }
    const state = this.state(sessionId);
    const now = Date.now();
    if (state.handedOffAt !== undefined && now - state.handedOffAt < HANDOFF_COOLDOWN_MS) return;
    // Any user message into the main conversation cancels its queued continuation,
    // and DSH already tells it which child failed. Stay silent while it recovers
    // itself, or the hand-off would suppress that recovery.
    const parentState = this.parentState(parent);
    if (parentState !== undefined && (this.hasPendingSend(parentState) || now - parentState.lastFailureAt < HANDOFF_PARENT_QUIET_MS)) {
      this.log(`移交跳过 ${sessionId}: 主会话 ${parent} 正在自行恢复`);
      return;
    }
    const code = state.lastFailure?.code ?? reason;
    const text = HANDOFF_COPY[this.sessionConfig(sessionId).locale](sessionId, code);
    try {
      parentAgent.followup(createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'user' },
      }));
      state.handedOffAt = now;
      this.log(`已将子代理 ${sessionId} 的失败移交主会话 ${parent}(${code})`);
    } catch (error) {
      this.log(`移交 ${sessionId} 失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private fire(sessionId: SessionId, reason: string, force = false): void {
    if (this.disposed) return;
    const state = this.state(sessionId);
    const config = this.sessionConfig(sessionId);
    const manualResume = force && reason === MANUAL_NOTIFICATION_REASON;
    if (reason.endsWith(':silent') && !config.resumeSilentTurns) return;
    // 宽限期内循环被关闭: 发送前必须重新检查开关, 与 :silent 恢复同样处理。
    // 否则「关掉循环」后仍会多发出一次续跑。
    if (isLoopReason(reason) && !config.resumeCompletedTurns) return;
    // Direct sends (notifications) must respect the setting and the inherited
    // mode even though they bypass the paused flag below.
    if (this.isSubagentSession(sessionId) && !this.subagentRecoveryEnabled(sessionId)) return;
    if (config.paused && !manualResume) {
      this.log(`跳过 ${sessionId}(${reason}): 自动继续已暂停`);
      return;
    }
    if (!manualResume && Date.now() < this.effectivePauseUntil(sessionId)) {
      this.log(`跳过 ${sessionId}(${reason}): 会话暂停中`);
      return;
    }
    // 冷却(自适应退避)与连续上限; 通知按钮的强制续跑不受约束
    if (!force && Date.now() - state.lastAttemptAt < this.cooldownFor(state)) {
      this.log(`跳过 ${sessionId}(${reason}): 处于冷却期`);
      return;
    }
    if (!force && state.consecutive >= config.maxConsecutive) {
      this.log(`跳过 ${sessionId}(${reason}): 已连续自动继续 ${state.consecutive} 次, 等待用户介入或成功回合`);
      return;
    }
    // 模板填充: continueText 可含 {code}/{message}/{status}/{tool}/{turn}/{errorCount}/{sessionTitle}/{elapsed} 占位符
    const template = this.templateFor(config, reason);
    const text = this.buildContinueText(config, state, template);
    // 发送: followup 负责唤醒; 同步 inbox 插入事件会在唤醒前把本消息移到已有队列之前。
    const agent = this.ctx.agents.get(sessionId);
    if (agent === undefined) {
      // A failed child is settled and disposed by the subagent runtime before the
      // send window opens, so a direct resume cannot reach it. Ask the host to
      // cold-resume it from persistence; when that is unavailable, hand the
      // failure to its main conversation instead.
      if (!manualResume && this.isSubagentSession(sessionId) && this.subagentRecoveryEnabled(sessionId)) {
        void this.reviveChild(sessionId, reason, text);
      }
      this.log(`跳过 ${sessionId}(${reason}): 无 live agent; subagent=${this.isSubagentSession(sessionId)} enabled=${this.subagentRecoveryEnabled(sessionId)} manual=${manualResume}`);
      return;
    }
    state.lastAttemptAt = Date.now(); // 先记账: 无论成败, 本次尝试都进入冷却
    try {
      const message = createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: config.usePluginSource ? AUTO_CONTINUE_SOURCE_KIND : 'user' },
      });
      // `followup` may publish the matching session event synchronously.
      trackPendingEcho(state, message.id);
      if (agent.inbox.nextTurn.length > 0) this.prioritizedFollowups.add(message.id);
      try {
        agent.followup(message);
      } catch (error) {
        forgetPendingEcho(state, message.id);
        throw error;
      } finally {
        this.prioritizedFollowups.delete(message.id);
      }
      const now = Date.now();
      // 续跑已发出: 被重启失活的 goal 需要在这里重新武装, 否则续跑消息会跑但
      // goal 的自动继续轮不会转起来(disarm 是宿主卸载驱动的正常动作)。
      this.rearmGoal(sessionId, config);
      // 自主循环的成功续跑不计入连续上限: 上限只约束失败(网络中断等)。
      if (reason !== LOOP_COMPLETED_REASON) state.consecutive += 1;
      if (isLoopReason(reason)) state.loopIterations += 1;
      state.pendingRecoveryAt = now; // 等待窗口内的下一个回合结束来判定恢复结果
      if (reason !== LOOP_COMPLETED_REASON) {
        this.recoveryAttempts.unshift({
          sessionId, at: now, consecutive: state.consecutive,
          reason: manualResume ? 'manual'
            : reason === 'loop:aborted' ? 'loop-guard'
            : reason.endsWith(':silent') || reason === LOOP_SILENT_REASON ? 'silent'
            : reason.endsWith(':interrupted') ? 'interrupted'
            : reason.endsWith(':max-tokens') ? 'max-tokens' : 'error',
        });
        this.recoveryAttempts.length = Math.min(this.recoveryAttempts.length, 20);
      }
      this.bumpStat({ sent: 1, ...(state.lastFailure !== undefined ? { code: state.lastFailure.code } : {}) });
      this.log(`已自动发送「${text}」到 ${sessionId}(${reason}), 第 ${state.consecutive} 次连续`);
      if (config.notify) {
        const copy = NOTICE_COPY[config.locale];
        this.notify(
          sessionId,
          copy.continuedTitle,
          copy.continuedBody(sessionId, text, state.consecutive),
          this.notifyOptions(sessionId, config.locale),
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
            this.notifyOptions(sessionId, config.locale),
          );
        }
      }
    } catch (error) {
      this.log(`发送异常 ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private resetLoopIterations(state: SessionState): void {
    state.loopIterations = 0;
    state.loopCapNotified = false;
  }

  /** 自主循环轮数上限: 触顶后静默停下, 每次触顶只提示一次。 */
  private loopCapReached(sessionId: SessionId, state: SessionState, config: AutoContinueConfig): boolean {
    const cap = config.loopMaxIterations;
    if (cap <= 0 || state.loopIterations < cap) return false;
    if (!state.loopCapNotified) {
      state.loopCapNotified = true;
      this.log(`自主循环已续跑 ${state.loopIterations} 轮, 达到上限 ${cap}, 停止 ${sessionId}; 用户发消息或重新开启循环后重新计数`);
      if (config.notify) {
        const copy = NOTICE_COPY[config.locale];
        this.notify(
          sessionId,
          copy.loopCapTitle,
          copy.loopCapBody(sessionId, state.loopIterations),
          this.notifyOptions(sessionId, config.locale),
        );
      }
    }
    return true;
  }

  private checkConnectivity(): Promise<boolean> {
    if (this.connectivityCheck === undefined) {
      const check = this.probe()
        .catch(() => true) // 检测本身出错时放行, 不因探测失败卡住恢复
        .finally(() => {
          if (this.connectivityCheck === check) this.connectivityCheck = undefined;
        });
      this.connectivityCheck = check;
    }
    return this.connectivityCheck;
  }

  /**
   * 网络类失败的续跑先过连通性检测: 断网时发出去必然再失败一次, 白白吃掉连续上限,
   * 等网络恢复时预算已耗尽。挂起期间不计次数, 每 offlineCheckMs 复检一次, 恢复后
   * 重新走 schedule(宽限、冷却照常)。手动续跑和非网络原因不受影响。
   */
  private fireWhenOnline(sessionId: SessionId, reason: string, force: boolean): void {
    const state = this.state(sessionId);
    const config = this.sessionConfig(sessionId);
    const gated = config.pauseWhenOffline &&
      reason !== MANUAL_NOTIFICATION_REASON &&
      !isLoopReason(reason) &&
      state.lastFailure !== undefined &&
      isNetworkFailure(state.lastFailure);
    if (!gated) {
      this.fire(sessionId, reason, force);
      return;
    }
    const token = {};
    state.offlineWait = token;
    state.pendingReason = reason;
    void this.checkConnectivity().then((online) => {
      if (this.disposed || state.offlineWait !== token) return; // 已被取消或被新的检测取代
      if (online) {
        state.offlineWait = undefined;
        state.pendingReason = undefined;
        if (state.offlineSince !== 0) {
          this.log(`网络已恢复 ${sessionId}, 断网挂起 ${Math.round((Date.now() - state.offlineSince) / 1000)}s 后继续(${reason})`);
          state.offlineSince = 0;
          this.schedule(sessionId, reason, force);
          return;
        }
        this.fire(sessionId, reason, force);
        return;
      }
      if (state.offlineSince === 0) {
        state.offlineSince = Date.now();
        this.log(`网络不可用, 挂起 ${sessionId} 的自动继续(${reason}), 每 ${config.offlineCheckMs}ms 复检, 不消耗重试次数`);
      }
      state.offlineTimer = setTimeout(() => {
        state.offlineTimer = undefined;
        if (state.offlineWait !== token) return;
        try {
          this.fireWhenOnline(sessionId, reason, force);
        } catch (error) {
          console.error(`[auto-continue] 断网复检异常 ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }, config.offlineCheckMs);
    });
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
  ): string {
    let text = fillTemplate(template, {
      facts: state.lastFailure,
      tool: state.tools.lastTool(),
      turn: state.lastTurn,
      errorCount: state.consecutive + 1,
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
    return state.tools.guard();
  }

  private async bootScanLoop(): Promise<void> {
    // Sessions restored after this window are too old for startup recovery.
    // Keep polling only within that window, including while globally paused.
    const deadline = Date.now() + this.getConfig().freshMs;
    for (let attempt = 0; !this.disposed; attempt += 1) {
      if (attempt > 0 && Date.now() >= deadline) return;
      try {
        if (await this.scanInterrupted()) return;
        const config = this.getConfig();
        if (!config.paused && config.scanOnBoot && this.storedSweep === undefined) {
          this.childScanned = 0; // 每轮重置子会话观察配额
          this.storedSweep = this.sweepStoredSessions(config, deadline)
            .then(() => this.wakeInterruptedChildren(config, deadline))
            .catch(error => {
              if (!this.disposed) this.ctx.logger.error(`Stored session scan failed: ${String(error)}`);
            })
            .finally(() => { this.storedSweep = undefined; });
        }
      } catch (error) {
        if (this.disposed) return;
        // 宿主未就绪时每 3s 重试; 只节流记录日志, 避免刷屏。
        if (attempt % 10 === 0) {
          this.log(
            `扫描失败(${attempt + 1}): ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      const remaining = deadline - Date.now();
      if (this.disposed || remaining <= 0) return;
      await new Promise<void>((resolve) => {
        this.wakeBootScan = () => {
          if (this.bootScanTimer !== undefined) clearTimeout(this.bootScanTimer);
          this.bootScanTimer = undefined;
          this.wakeBootScan = undefined;
          resolve();
        };
        this.bootScanTimer = setTimeout(this.wakeBootScan, Math.min(3000, remaining));
      });
    }
  }

  /** Inspect newly available sessions; process each settled startup history once. */
  private async scanInterrupted(): Promise<boolean> {
    const config = this.getConfig();
    if (config.paused || !config.scanOnBoot) return false;
    const now = Date.now();
    const candidates: {
      session: Session;
      sessionId: SessionId;
      events: readonly SessionEvent[];
      lastEnd: SessionEvent<'turn/end'>;
      reasonKind: string;
      failure?: FailureFacts;
      lastActivityAt: number;
      listIndex: number;
    }[] = [];
    for (const agent of this.ctx.agents.list()) {
      let session: Session | undefined;
      let sessionId: SessionId | undefined;
      try {
        session = agent.session;
        // Check quarantine before reading metadata that may have failed previously.
        if (this.bootScannedSessions.has(session) || session.header?.origin === 'subagent') continue;
        sessionId = session.id;
        if (typeof sessionId !== 'string' || sessionId === '') throw new TypeError('session id is unavailable');
        if (this.sessionConfig(sessionId).paused) continue;
        const state = this.state(sessionId);
        if (state.pendingTimer !== undefined || state.consecutive >= config.maxConsecutive) continue;
        if (now - state.lastAttemptAt < this.cooldownFor(state)) continue;
        if (now < (this.pauseUntil.get(sessionId) ?? 0)) continue;
        const events = snapshotSessionEvents(session);
        // An empty, valid snapshot may still be waiting for history hydration.
        if (events.length === 0) continue;
        let lastEnd: SessionEvent<'turn/end'> | undefined;
        for (let i = events.length - 1; i >= 0; i -= 1) {
          const event = events[i];
          if (event?.type === 'turn/end') { lastEnd = event; break; }
        }
        let reasonKind = readReasonKind(lastEnd?.data.reason);
        // A host-closed tail (`disposed`/`legacy`) is a restart signature, not a user stop.
        if (reasonKind === 'aborted' && isHostCancel(lastEnd?.data.reason)) reasonKind = 'interrupted';
        const lastStart = latestTurnStart(events);
        const maintenance = lastStart?.data.turn === lastEnd?.data.turn && isMaintenanceTurnStart(lastStart);
        const silent = reasonKind === 'no-visible-output' && config.resumeSilentTurns;
        const superseded = lastEnd !== undefined && events.some((event) =>
          event.seq > lastEnd!.seq && (event.type === 'turn/start' ||
            (event.type === 'user/message' && event.data.source.kind === 'user')),
        );
        if (lastEnd === undefined || maintenance || reasonKind === undefined || (!isNonHumanReason(reasonKind) && !silent) ||
            lastEnd.time < now - config.freshMs || superseded) {
          this.bootScannedSessions.add(session);
          continue;
        }
        let failure: FailureFacts | undefined;
        if (reasonKind === 'error') {
          failure = parseFailureFacts((lastEnd.data.reason as { error?: unknown }).error);
          if (failure === undefined) {
            this.bootScannedSessions.add(session);
            console.error(`[auto-continue] 忽略畸形扫描 turn/end ${sessionId}: error details 无法解释`);
            continue;
          }
          if (config.classify && !isTransientFailure(failure, config.retryableErrorPatterns)) {
            this.bootScannedSessions.add(session);
            this.onTurnFailure(sessionId, 'scan:turn/end:error', failure);
            continue;
          }
        }
        candidates.push({
          session, sessionId, events, lastEnd, reasonKind, failure,
          lastActivityAt: events.reduce((latest, event) => Math.max(latest, event.time), 0),
          listIndex: candidates.length,
        });
      } catch (error) {
        if (session !== null && typeof session === 'object') this.bootScannedSessions.add(session);
        const identity = session ?? agent;
        if (identity !== null && typeof identity === 'object') {
          if (this.bootScanErrors.has(identity)) continue;
          this.bootScanErrors.add(identity);
        }
        this.logBootScanFailure(sessionId, error);
      }
    }
    // Limit recoveries, not healthy/permanent histories that cannot be resumed.
    candidates.sort((left, right) => right.lastActivityAt - left.lastActivityAt || left.listIndex - right.listIndex);
    let recoveries = 0;
    for (const candidate of candidates) {
      if (recoveries >= config.scanLimit) break;
      if (this.disposed) return true;
      const { session, sessionId, events, lastEnd, reasonKind, failure } = candidate;
      this.bootScannedSessions.add(session);
      const state = this.state(sessionId);
      try {
        this.applyGuardFromEvents(state, events, lastEnd.seq);
        const scanReason = `scan:turn/end:${reasonKind}${reasonKind === 'no-visible-output' ? ':silent' : ''}`;
        this.log(`扫描发现中断 ${sessionId}(turn/end:${reasonKind}), 交给恢复策略处理`);
        if (failure !== undefined) {
          state.lastFailure = failure;
          state.lastTurn = lastEnd.data.turn;
          state.lastFailureAt = lastEnd.time;
          this.onTurnFailure(sessionId, scanReason, failure);
        } else {
          if (reasonKind === 'no-visible-output') state.lastFailure = undefined;
          // 没有失败事实的恢复(如 interrupted)也要填 {turn}/{elapsed}, README 对所有继续文本承诺这些占位符。
          state.lastTurn = lastEnd.data.turn;
          state.lastFailureAt = lastEnd.time;
          this.schedule(sessionId, scanReason);
        }
        recoveries += 1;
      } catch (error) {
        state.tools.reset();
        this.cancelPending(sessionId, '启动扫描失败');
        this.logBootScanFailure(sessionId, error);
      }
    }
    return false;
  }

  /** Bound cold reads even if a backend ignores cancellation; release late leases. */
  private async readStored<T extends object>(read: (signal: AbortSignal) => Promise<T>, deadline: number): Promise<T> {
    const timeout = new AbortController();
    const signal = AbortSignal.any([this.stopStoredSweep.signal, timeout.signal]);
    const timer = setTimeout(() => timeout.abort(new Error('Stored session read timed out')), Math.max(0, Math.min(STORED_READ_TIMEOUT_MS, deadline - Date.now())));
    let onAbort: () => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    const pending = Promise.resolve().then(() => { signal.throwIfAborted(); return read(signal); });
    void pending.then(value => {
      if (signal.aborted) (value as { [Symbol.dispose]?: () => void })[Symbol.dispose]?.();
    }).catch(() => {});
    try {
      return await Promise.race([pending, cancelled]);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort!);
    }
  }

  /**
   * 存储扫描: 枚举持久化会话, 把尾部命中恢复谓词的未加载会话物化为
   * live agent。宿主重启后 agent 仅在客户端打开会话时才懒加载, 不物化
   * 则启动扫描永远看不到它们; 谓词与上方扫描一致, 仅失败类原因。
   */
  private async sweepStoredSessions(config: AutoContinueConfig, deadline: number): Promise<void> {
    const query = this.ctx.get('sessionQuery');
    if (query === undefined) return;
    const records = await this.readStored(signal => query.listSessions(signal), deadline);
    if (!Array.isArray(records)) throw new TypeError('stored session listing is not an array');
    if (!this.storedSweepAnnounced) {
      this.storedSweepAnnounced = true;
      // 诊断口径: 宿主返回的 header 是否携带 origin, 决定子会话分支能否进入。
      let children = 0;
      let otherOrigins = 0;
      let originMissing = 0;
      for (const record of records) {
        const origin = (record?.header as { origin?: string } | undefined)?.origin;
        if (origin === 'subagent') children += 1;
        else if (origin === undefined) originMissing += 1;
        else otherOrigins += 1;
      }
      this.ctx.logger.info(
        `存储扫描就绪: ${records.length} 个会话记录 (subagent ${children} / 无 origin ${originMissing} / 其它 origin ${otherOrigins})`,
      );
    }
    // 父子链解析只依赖 header: 一次建成索引, 子会话不必各自再读父日志。
    const headersById = new Map<string, SessionHeaderLike>();
    for (const record of records) {
      const header = record?.header as SessionHeaderLike | undefined;
      if (header !== undefined && typeof header.id === 'string' && header.id !== '') {
        headersById.set(header.id, header);
      }
    }
    let observed = 0;
    for (const record of records) {
      if (this.disposed || Date.now() >= deadline || this.getConfig().paused || !this.getConfig().scanOnBoot) return;
      if (typeof record?.header?.id !== 'string' || record.header.id === '') {
        this.logBootScanFailure(undefined, new TypeError('stored session record has no id'));
        continue;
      }
      const sessionId = record.header.id;
      if (this.ownSessionConfig(sessionId).paused || Date.now() < (this.pauseUntil.get(sessionId) ?? 0)) continue;
      if (record.header.origin === 'subagent') {
        // 子会话的记账完全交给 childSwept。若沿用 storedSwept(它在下面为 root 记账),
        // 配额用尽的那一批会被永久标成"已裁决": 之后每轮都在这里被挡掉, 775 个子会话
        // 只判 8 个, 而配额本意只是限制单轮的冷读成本。
        if (config.resumeInterruptedChildren) {
          await this.sweepChild(record, headersById, config, deadline);
        }
        continue;
      }
      if (record.live || this.storedSwept.has(sessionId)) continue;
      this.storedSwept.add(sessionId);
      observed += 1;
      let observation: StoredObservation | undefined;
      try {
        const stored: StoredObservation = await this.readStored(signal => query.observeSession(sessionId, { projectionMode: 'all', signal }), deadline);
        observation = stored;
        if (this.disposed) return;
        if (this.sessionConfig(sessionId).paused) {
          this.storedSwept.delete(sessionId);
          continue;
        }
        const events = validateSessionEvents(stored.events);
        if (events.length === 0) continue;
        // 快照之后客户端可能已打开该会话: 归还 live 扫描, 避免与 live 路径
        // 重复上报, 也避免物化撞上写归属。
        if (this.ctx.agents.get(sessionId) !== undefined) continue;
        let lastEnd: SessionEvent<'turn/end'> | undefined;
        for (let i = events.length - 1; i >= 0; i -= 1) {
          const event = events[i];
          if (event?.type === 'turn/end') { lastEnd = event; break; }
        }
        const lastStart = latestTurnStart(events);
        // 兜底分支: 真实 sessionQuery 冷读会把内存中的 interruptedTurnClosers
        // 折叠进返回日志(尾部即合成 turn/end), 上方 closed-tail 才是生产主路
        // 径。这里覆盖两种例外——不折叠的宿主实现, 以及 listSessions 快照与
        // observeSession 之间客户端刚打开、切在轮次中间的 live 视图。
        const openTurn = lastStart !== undefined && (lastEnd === undefined || lastStart.seq > lastEnd.seq);
        if (isMaintenanceTurnStart(lastStart) && (openTurn || lastStart?.data.turn === lastEnd?.data.turn)) continue;
        let reasonKind: string | undefined;
        let freshAt: number;
        if (openTurn) {
          reasonKind = 'interrupted';
          freshAt = events[events.length - 1]?.time ?? 0;
        } else {
          reasonKind = readReasonKind(lastEnd?.data.reason);
          if (reasonKind === 'aborted' && isHostCancel(lastEnd?.data.reason)) reasonKind = 'interrupted';
          freshAt = lastEnd?.time ?? 0;
        }
        // 过期或被取代的永久错误与 live 扫描一致地静默跳过, 不再单独上报。
        if (reasonKind === undefined || freshAt < Date.now() - config.freshMs) continue;
        if (reasonKind !== undefined && !openTurn) {
          const silent = reasonKind === 'no-visible-output' && config.resumeSilentTurns;
          // 尾随 turn/start 已按 openTurn 处理, 这里只剩用户接管一种取代形态。
          const superseded = events.some((event) =>
            lastEnd !== undefined && event.seq > lastEnd.seq && event.type === 'user/message' && event.data.source.kind === 'user',
          );
          if ((!isNonHumanReason(reasonKind) && !silent) || superseded) continue;
          // 镜像 live 扫描的裁决: 畸形/永久错误不值得物化——物化后同样会被拦下。
          if (reasonKind === 'error') {
            const failure = parseFailureFacts((lastEnd!.data.reason as { error?: unknown }).error);
            if (failure === undefined) {
              console.error(`[auto-continue] 忽略畸形存储 turn/end ${sessionId}: error details 无法解释`);
              continue;
            }
            // 永久错误同样走 onTurnFailure, 镜像 live 路径的统计与通知旁效。
            if (config.classify && !isTransientFailure(failure, config.retryableErrorPatterns)) {
              this.onTurnFailure(sessionId, 'sweep:turn/end:error', failure);
              continue;
            }
          }
        }
        const presetId = stored.projections?.values.agentPreset ?? stored.header.agentPreset;
        const loggedConfig = foldRequestHeader(events)?.config;
        if (!await this.materializeStored(
          sessionId,
          presetId,
          loggedConfig === undefined ? undefined : { provider: loggedConfig.provider, model: loggedConfig.model },
        )) {
          this.storedSwept.delete(sessionId);
          return;
        }
        this.storedSweepFailures.delete(sessionId);
        this.wakeBootScan?.();
        this.ctx.logger.info(openTurn
          ? `扫描物化存储会话 ${sessionId}(日志止于 turn/start, 视作 interrupted), 交给启动扫描接管`
          : `扫描物化存储会话 ${sessionId}(turn/end:${reasonKind}), 交给启动扫描接管`);
      } catch (error) {
        if (this.disposed) return;
        // 观察或物化失败允许下一轮重试; 连续触达上限后放弃, 并清掉计数——
        // 已永久跳过的会话不再进入该映射, 不给长存活宿主留死重。
        const failures = (this.storedSweepFailures.get(sessionId) ?? 0) + 1;
        if (failures < SWEEP_MAX_FAILURES) {
          this.storedSweepFailures.set(sessionId, failures);
          this.storedSwept.delete(sessionId);
        } else {
          this.storedSweepFailures.delete(sessionId);
        }
        this.ctx.logger.error(`存储会话 ${sessionId} 物化失败: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        observation?.[Symbol.dispose]?.();
        if (observed % SWEEP_OBSERVE_BATCH === 0 && !this.disposed) {
          await new Promise<void>(resolve => setTimeout(resolve, 0));
        }
      }
    }
  }

  /**
   * 子会话裁决。子会话本身永不直接续跑(父代理权威, 见 README), 但启动扫描要
   * 知道它是否在重启时被打断, 才能在自己的 root 会话上补一次带清单的唤醒。
   * 独立 `childSwept` 记账与独立配额: 主扫描的 `storedSwept` 在 origin 判断
   * 之前就已标记, 复用它会让子会话永远扫不到, 也会吃掉主扫描的观察预算。
   */
  private async sweepChild(
    record: {
      readonly header: SessionHeaderLike & {
        readonly origin?: string;
        readonly agentPreset?: string;
        readonly title?: unknown;
      };
      readonly persisted?: boolean;
    },
    headersById: ReadonlyMap<string, SessionHeaderLike>,
    config: AutoContinueConfig,
    deadline: number,
  ): Promise<void> {
    const header = record.header;
    const sessionId = header.id;
    const parentId = header.parentSession;
    if (parentId === undefined || parentId === '') return;
    // one-shot 子会话在结果落库后已被丢弃, 没有可续的日志。
    if (record.persisted !== true) return;
    if (this.childSwept.has(sessionId)) return;
    // live 会话由实时事件路径负责; 冷读它既费钱又会与写归属相撞。
    if (this.ctx.agents.get(sessionId) !== undefined) return;
    if (this.childScanned >= CHILD_SWEEP_LIMIT) return;
    if (this.ownSessionConfig(sessionId).paused) return;
    const rootId = resolveRootHeader(header, headersById);
    if (rootId === undefined || rootId === sessionId) {
      // 每轮扫描都会重走这里; 只记一次, 否则 15 分钟 freshMs 窗口内会刷出数万行噪声。
      if (!this.childDirtyLogged.has(sessionId)) {
        this.childDirtyLogged.add(sessionId);
        this.log(`子会话 ${sessionId} 父链不可解析(脏引用或自环), 跳过(每会话只记一次)`);
      }
      return; // 脏引用或自环: 不猜
    }
    const query = this.ctx.get('sessionQuery');
    if (query === undefined) return;
    this.childSwept.add(sessionId);
    this.childScanned += 1;
    let observation: StoredObservation | undefined;
    try {
      const stored: StoredObservation = await this.readStored(
        signal => query.observeSession(sessionId, { projectionMode: 'all', signal }),
        deadline,
      );
      observation = stored;
      if (this.disposed) return;
      const events = validateSessionEvents(stored.events);
      if (events.length === 0) return;
      const cause = classifyChildInterruption(events, config);
      if (cause === undefined) return;
      const tail = events[events.length - 1];
      const list = this.childInterrupts.get(rootId) ?? [];
      list.push({
        id: sessionId,
        title: typeof header.title === 'string' && header.title !== '' ? header.title : undefined,
        preset: header.agentPreset,
        cause,
        at: tail?.time ?? Date.now(),
      });
      this.childInterrupts.set(rootId, list);
      this.log(`子会话 ${sessionId} 重启时被打断(${cause}), 记入 root ${rootId}`);
    } catch (error) {
      this.childSwept.delete(sessionId); // 冷读失败允许下一轮重试
      if (!this.disposed) {
        this.ctx.logger.info(
          `子会话 ${sessionId} 冷读失败: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } finally {
      observation?.[Symbol.dispose]?.();
    }
  }

  /** 把本轮收集到的子会话中断转成 root 会话上的一次唤醒(同一批只催一次)。 */
  private async wakeInterruptedChildren(
    config: AutoContinueConfig,
    deadline: number,
  ): Promise<void> {
    if (this.disposed || this.childInterrupts.size === 0) return;
    if (config.paused || !config.scanOnBoot || !config.resumeInterruptedChildren) return;
    // 不整体 clear: 只有"已裁决"的 root 才销账。若在循环前 clear, 任一 root 因冷却或
    // 主路径已排期而提前返回, 这批孩子就永久丢了 —— 它们已在 childSwept 里, 不会再被收集。
    for (const [rootId, children] of [...this.childInterrupts]) {
      if (this.disposed || Date.now() >= deadline) return; // 未处理的留到下一轮
      try {
        if (await this.wakeRoot(config, rootId, children, deadline)) {
          this.childInterrupts.delete(rootId);
        }
      } catch (error) {
        // 抛错也要销账, 否则每轮重试同一条坏数据。
        this.childInterrupts.delete(rootId);
        if (!this.disposed) {
          this.ctx.logger.info(
            `子会话唤醒 ${rootId} 失败: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
  }

  /**
   * 在 root 会话上唤醒一次。只有在 root 自己是"干净终态"时才动手: 它若被打断,
   * 主扫描本来就会续跑它; 它若被用户手动停止, 唤醒就是幽灵回合。
   */
  private async wakeRoot(
    config: AutoContinueConfig,
    rootId: SessionId,
    children: readonly ChildInterrupt[],
    deadline: number,
  ): Promise<boolean> {
    // 返回值语义: true = 已裁决(可销账), false = 稍后重试(必须留住这一批)。
    if (this.sessionConfig(rootId).paused) return false;
    if (Date.now() < (this.pauseUntil.get(rootId) ?? 0)) return false;
    const state = this.state(rootId);
    if (state.pendingTimer !== undefined) return false; // 主路径已排好, 下一轮再看
    if (state.consecutive >= config.maxConsecutive) return true; // 预算耗尽: 不必每轮重试
    if (Date.now() - state.lastAttemptAt < this.cooldownFor(state)) return false;
    const batch = children.map(child => `${child.id}:${child.cause}`).sort().join(',');
    if (this.childWoken.get(rootId) === batch) return true;
    if (!(await this.rootAcceptsWake(rootId, deadline))) return true; // 明确裁决: 不该唤醒
    const agent = await this.ensureLiveAgent(rootId, deadline);
    if (agent === undefined || this.disposed) return false;
    const text = this.buildChildResumeText(config, children);
    const message = createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'user' },
    });
    state.lastAttemptAt = Date.now();
    agent.followup(message);
    this.childWoken.set(rootId, batch);
    this.log(
      `已唤醒 ${rootId}: ${children.length} 个子会话在重启时被打断, 清单已交给父会话处置`,
    );
    this.rearmGoal(rootId, config);
    return true;
  }

  /** 父会话只在"干净结束"或"被宿主关闭"时接受唤醒; 用户手动停止的绝不复活。 */
  private async rootAcceptsWake(sessionId: SessionId, deadline: number): Promise<boolean> {
    const query = this.ctx.get('sessionQuery');
    if (query === undefined) return false;
    let events: readonly SessionEvent[];
    let stored: StoredObservation | undefined;
    try {
      const observation: StoredObservation = await this.readStored(
        signal => query.observeSession(sessionId, { projectionMode: 'all', signal }),
        deadline,
      );
      stored = observation;
      events = validateSessionEvents(observation.events);
    } catch {
      return false;
    } finally {
      // validateSessionEvents 可能抛在畸形日志上, 租约必须无条件释放。
      stored?.[Symbol.dispose]?.();
    }
    if (events.length === 0) return false;
    let lastEnd: SessionEvent<'turn/end'> | undefined;
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i];
      if (event?.type === 'turn/end') { lastEnd = event; break; }
    }
    const lastStart = latestTurnStart(events);
    const end = lastEnd;
    if (lastStart !== undefined && (end === undefined || lastStart.seq > end.seq)) return false;
    if (end === undefined) return false;
    const kind = readReasonKind(end.data.reason);
    if (kind === 'completed') return true;
    if (kind === 'aborted') return isHostCancel(end.data.reason);
    return false;
  }

  /** 发送需要 live agent; 存储会话沿既有物化路径拉起, 复用 preset 与模型回装。 */
  private async ensureLiveAgent(sessionId: SessionId, deadline: number): Promise<Agent | undefined> {
    const live = this.ctx.agents.get(sessionId);
    if (live !== undefined) return live;
    const query = this.ctx.get('sessionQuery');
    if (query === undefined) return undefined;
    let presetId: string | undefined;
    let model: { provider: string; model: string } | undefined;
    let stored: StoredObservation | undefined;
    try {
      const observation: StoredObservation = await this.readStored(
        signal => query.observeSession(sessionId, { projectionMode: 'all', signal }),
        deadline,
      );
      stored = observation;
      presetId = observation.projections?.values.agentPreset ?? observation.header.agentPreset;
      // 与主扫描一致回装日志记录的模型选择, 否则父会话会以默认模型被拉起。
      const loggedConfig = foldRequestHeader(validateSessionEvents(observation.events))?.config;
      if (loggedConfig !== undefined) model = { provider: loggedConfig.provider, model: loggedConfig.model };
    } catch {
      return undefined;
    } finally {
      stored?.[Symbol.dispose]?.();
    }
    const ok = await this.materializeStored(sessionId, presetId, model);
    if (!ok || this.disposed) return undefined;
    return this.ctx.agents.get(sessionId);
  }

  /** 唤醒文本必须带会话级证据: 否则父会话看不到任何状态, 只会白跑一轮再回一句"都结束了"。 */
  private buildChildResumeText(
    config: AutoContinueConfig,
    children: readonly ChildInterrupt[],
  ): string {
    const lines = children.map((child) => {
      const label = child.title !== undefined ? `「${child.title}」` : '';
      const preset = child.preset !== undefined ? ` (${child.preset})` : '';
      const cause = CHILD_CAUSE_COPY[config.locale][child.cause];
      return `- ${child.id} ${label}${preset} — ${cause}`;
    });
    const header = config.locale === 'zh'
      ? '重启时你开的以下子代理 / 团队成员会话被打断, 没有跑完。请逐个检查, 按需要继续或收尾:'
      : 'These child sessions you started (subagent / team member) were interrupted by a restart and did not finish. Check each one and either continue it or wrap it up:';
    const tail = config.locale === 'zh'
      ? '要继续的用 send_message / subagent 重新拉起对应会话(重启后它们并未加载); 已完成或不再需要的, 说明结论即可。'
      : 'Use send_message (or subagent) to bring back the ones that should continue — they are not loaded after the restart; for finished or abandoned ones, just state the conclusion.';
    return [header, ...lines, tail].join('\n');
  }

  /**
   * 重启会把 active goal 置为 disarmed(宿主卸载驱动的正常动作), 只有人类授权的
   * resume 能重新 arm; paused 则是人类的显式决定。两者都默认关闭。
   */
  private rearmGoal(sessionId: SessionId, config: AutoContinueConfig): void {
    if (!config.resumeGoals) return;
    const goals = (this.ctx as unknown as { get(key: string): unknown }).get(GOALS_SERVICE_KEY) as
      | GoalServiceLike
      | undefined;
    if (goals === undefined) return;
    const agent = this.ctx.agents.get(sessionId);
    if (agent === undefined) return;
    try {
      const view = goals.get(agent);
      if (view === undefined) return;
      // 宿主的 view() 不带 ref 字段, 而 resume() 用 revision 做 CAS 校验(expectCurrent):
      // 只带 id 必定抛 GOAL_STALE_REVISION 被这里 catch 成一行日志 —— 等于开关失效。
      // 缺 revision 时 fail closed, 不猜。
      const revision = view.revision;
      if (revision === undefined) {
        this.log(`会话 ${sessionId}: goal 视图缺 revision, 跳过重新武装(宿主会拒绝无 revision 的 resume)`);
        return;
      }
      const ref: GoalRefLike = view.ref ?? { id: view.id, revision };
      if (view.phase === 'active' && view.activation === 'disarmed') {
        goals.resume(agent, ref);
        this.log(`会话 ${sessionId}: goal 被重启失活, 已重新武装`);
        return;
      }
      if (view.phase === 'paused' && config.resumePausedGoals) {
        goals.resume(agent, ref);
        this.log(`会话 ${sessionId}: 已恢复被暂停的 goal`);
      }
    } catch (error) {
      this.ctx.logger.info(
        `goal 恢复失败 ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 按会话记录的 preset 组合把存储会话恢复为 live agent(镜像会话控制
   * 器的 adopt 路径: preset 挂载 + 会话已记录的模型选择回装)。模型选择
   * 以日志记录的 request-header 播种 agentOptions——{{model}}/{{provider}}
   * 提示变量与首次请求路由都读它, 驱动器还会因路由吻合而自行回装日志
   * 记录的 effort; 无落点(从未发过请求的会话)回落宿主默认。恢复时追
   * 加的合成 turn/end(`interrupted`)随后由常规扫描按既有关卡恢复。
   */
  private async materializeStored(
    sessionId: SessionId,
    presetId: string | undefined,
    logged: { provider: string; model: string } | undefined,
  ): Promise<boolean> {
    if (this.disposed || this.sessionConfig(sessionId).paused || !this.getConfig().scanOnBoot) return false;
    const presets = this.ctx.get('agentPresets');
    // Mirrors session-controller's adopt: without agent options the agent has no
    // provider/model, so prompt variables like {{model}} have no value and the
    // request carries no route.
    const defaultModel = this.ctx.get('agentDefaultModel');
    const selection = defaultModel?.currentSelection();
    const agentOptions = logged !== undefined
      ? { provider: logged.provider, model: logged.model }
      : selection === undefined ? undefined : { provider: selection.provider, model: selection.model };
    if (presets === undefined) {
      await this.ctx.agents.resume({ resumeSessionId: sessionId, agentOptions, signal: this.stopStoredSweep.signal });
      return true;
    }
    const resolvedId = (await presets.resolve(presetId)).id;
    if (this.disposed || this.sessionConfig(sessionId).paused || !this.getConfig().scanOnBoot) return false;
    if (this.ctx.agents.get(sessionId) !== undefined) return true;
    await this.ctx.agents.resume({
      resumeSessionId: sessionId,
      agentOptions,
      signal: this.stopStoredSweep.signal,
      setup: async (agentCtx) => {
        await presets.mount(agentCtx, resolvedId);
      },
    });
    return true;
  }

  /** Captured identity only: even session.id can throw when the header is damaged. */
  private logBootScanFailure(sessionId: SessionId | undefined, error: unknown): void {
    console.error(`[auto-continue] 启动扫描跳过会话 ${sessionId ?? '(id unavailable)'}: ${
      error instanceof Error ? error.message : String(error)
    }`);
  }

  /** 从历史事件恢复上一步工具调用状态(扫描路径的幂等护栏)。 */
  private applyGuardFromEvents(
    state: SessionState,
    events: readonly SessionEvent[],
    untilSeq: number,
  ): void {
    state.tools.restore(events, untilSeq);
  }
}
