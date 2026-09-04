/**
 * Auto-continue engine — host half core (single instance).
 *
 * Runs inside the dsh host process, so there is exactly ONE engine regardless
 * of how many browser tabs are open — the multi-tab duplicate-send class of
 * bugs (issue #13) cannot exist by construction. Listens to the session event
 * firehose (`session/event`), sends through the agent registry
 * (`agent.followup`), cancels through `agent.cancel`, and reads configuration
 * from the settings service.
 *
 * All behavior is driven by the `auto-continue` settings namespace (see the
 * plugin's settings card); every knob below is user-configurable there.
 */

import type { Context } from '@deepseek-ai/cordis';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session/types';
import type { Session } from '@deepseek-ai/dsh-session';
import {
  DEFAULT_CONFIG,
  RECOVERY_WINDOW_MS,
  effectiveCooldown,
  emptyDayStats,
  fillTemplate,
  forgetPendingEcho,
  freshState,
  isNonHumanReason,
  isOurEcho,
  isTransientAgentError,
  isTransientFailure,
  resolveConfig,
  sleep,
  todayKey,
  trackPendingEcho,
  toolResultFacts,
  type AutoContinueConfig,
  type AutoContinueLocale,
  type DayStats,
  type FailureFacts,
  type SessionState,
  type NotifyAction,
  type NotifyOptions,
  type TemplateContext,
} from '../shared/core.ts';

const NOTICE_COPY = {
  zh: {
    notContinuedTitle: 'dsh-auto-continue: 未自动继续',
    permanentErrorBody: (sessionId: SessionId, summary: string) =>
      `${sessionId}: 永久性错误 ${summary}，需要人工处理`,
    resumeAction: '立即续跑',
    pauseAction: '暂停该会话 1 小时',
    continuedTitle: 'dsh-auto-continue: 已自动继续',
    continuedBody: (sessionId: SessionId, text: string, count: number) =>
      `${sessionId}: 已发送「${text}」(第 ${count} 次连续)`,
    stoppedTitle: 'dsh-auto-continue: 已停止自动继续',
    stoppedBody: (sessionId: SessionId, count: number) =>
      `${sessionId}: 连续失败 ${count} 次, 需要人工介入`,
  },
  en: {
    notContinuedTitle: 'dsh-auto-continue: Not continued',
    permanentErrorBody: (sessionId: SessionId, summary: string) =>
      `${sessionId}: Permanent error ${summary}; manual intervention required`,
    resumeAction: 'Resume now',
    pauseAction: 'Pause this session for 1 hour',
    continuedTitle: 'dsh-auto-continue: Continued automatically',
    continuedBody: (sessionId: SessionId, text: string, count: number) =>
      `${sessionId}: Sent "${text}" (consecutive attempt ${count})`,
    stoppedTitle: 'dsh-auto-continue: Auto-continue stopped',
    stoppedBody: (sessionId: SessionId, count: number) =>
      `${sessionId}: ${count} consecutive failures; manual intervention required`,
  },
} as const satisfies Record<AutoContinueLocale, Record<string, unknown>>;

/** Durable cancel identity reserved for this plugin's loop guard. */
const LOOP_GUARD_CANCEL_CAUSE = {
  kind: 'hook',
  reason: 'dsh-auto-continue:loop-guard',
} as const;

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
  if (typeof compatible.snapshotEvents === 'function') return compatible.snapshotEvents();
  if (compatible.events !== undefined) return compatible.events;
  throw new TypeError('session exposes neither snapshotEvents() nor events');
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
export class AutoContinueRunner {
  private readonly states = new Map<SessionId, SessionState>();
  private readonly pauseUntil = new Map<SessionId, number>();
  private dayStats: DayStats = emptyDayStats();
  private readonly notices: HostNotice[] = [];
  private readonly noticeListeners = new Set<() => void>();
  private readonly stateListeners = new Set<() => void>();
  private readonly disposeSessionEvents: () => void;
  private disposed = false;

  /**
   * @param ctx - host plugin context (agents registry, session events, settings).
   * @param getConfig - read the current resolved configuration (settings service).
   */
  constructor(
    private readonly ctx: Context,
    private readonly getConfig: () => AutoContinueConfig,
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
    const config = this.getConfig();
    if (config.scanOnBoot) {
      void this.bootScanLoop();
    }
    this.log(
      `已启动(host 单实例, 文本="${config.continueText}", 宽限 ${config.graceMs}ms, ` +
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
    this.disposeSessionEvents();
    for (const state of this.states.values()) {
      if (state.pendingTimer !== undefined) clearTimeout(state.pendingTimer);
      if (state.loopRetryTimer !== undefined) clearTimeout(state.loopRetryTimer);
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

  /**
   * 事件入口(host 单实例): 预处理工具调用/结果/模型消息(护栏与循环信号),
   * 然后交给回合状态机。
   */
  private onHostEvent(session: Session, event: SessionEvent): void {
    const sessionId = session.id;
    if (event.type === 'tool/call') {
      const name = event.data.name;
      if (typeof name === 'string') {
        const state = this.state(sessionId);
        state.lastTool = name;
        state.lastToolResult = 'pending'; // 已发起, 尚未见结果
        // loop guard 信号 2: 同工具+同参数才可能是循环; 参数变化 = 有进展
        // (工具调用本身也重置短句信号)。计数在结果确认后才推进。
        state.shortRun = 0;
        const key = `${name}\n${event.data.arguments}`;
        if (state.toolRun?.key === key) {
          state.toolRun.waiting = true; // 结果到达时与上次结果比较
        } else {
          state.toolRun = { key, count: 1, lastResult: undefined, waiting: false };
        }
      }
    } else if (event.type === 'tool/result') {
      const state = this.state(sessionId);
      if (state.lastToolResult === 'pending') {
        const facts = toolResultFacts(event.data);
        state.lastToolResult = facts;
        // 结果确认: 与上次相同 → 计数推进; 不同 → 有进展, 重置
        const run = state.toolRun;
        if (run !== undefined && run.waiting) {
          run.waiting = false;
          if (run.lastResult !== undefined && run.lastResult === facts.excerpt) {
            run.count += 1;
            this.checkLoop(sessionId, state);
          } else {
            run.lastResult = facts.excerpt;
            run.count = 1;
          }
        } else if (run !== undefined && !run.waiting) {
          run.lastResult = facts.excerpt;
        }
      }
    } else if (event.type === 'assistant/message') {
      const state = this.state(sessionId);
      this.onAssistantMessage(sessionId, state, event);
    }
    this.onSessionEvent(sessionId, event);
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
   * 只有随后持久化的 turn/end 精确携带专属 hook cause 时,
   * 才会用 loopText 重启回合——DSH 的 first-cause 语义保证用户 Stop 优先。
   */
  private async interruptLoop(sessionId: SessionId, state: SessionState): Promise<void> {
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
        const reason = event.data.reason;
        if (
          typeof reason !== 'object' ||
          reason === null ||
          Array.isArray(reason) ||
          typeof reason.kind !== 'string' ||
          reason.kind.trim() === ''
        ) {
          console.error(`[auto-continue] 忽略畸形 turn/end ${sessionId}: reason 无法解释`);
          break;
        }
        if (reason.kind === 'completed') {
          // 成功回合: 恢复健康状态, 并确认上一次自动发送的效果
          state.consecutive = 0;
          state.lastFailure = undefined;
          this.noteRecovery(sessionId, 'completed');
        } else if (reason.kind === 'aborted') {
          if (
            reason.reason.kind === LOOP_GUARD_CANCEL_CAUSE.kind &&
            reason.reason.reason === LOOP_GUARD_CANCEL_CAUSE.reason
          ) {
            // 我们自己的 loop guard 打断: 视为可恢复中断, 用循环提示文本重启回合。
            // 不清 consecutive / lastAttemptAt: 冷却与连续上限在 loop 路径同样生效,
            // 防止无限打断重发(issue #13); 打断本身受冷却约束, 重启也要等冷却。
            if (loopCancelPending) this.bumpStat({ looped: 1 });
            state.pendingRecoveryAt = 0;
            state.shortRun = 0;
            state.lastShortAt = 0;
            state.lastAssistantText = '';
            state.sameTextRun = 0;
            state.toolRun = undefined;
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
              }, remaining);
              this.log(`loop 重启延迟 ${remaining}ms(冷却期) ${sessionId}`);
            } else {
              this.schedule(sessionId, 'loop:aborted');
            }
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
          if (typeof error !== 'object' || error === null || Array.isArray(error)) {
            console.error(`[auto-continue] 忽略畸形 turn/end ${sessionId}: error details 缺失`);
            break;
          }
          const code = typeof error.code === 'string' && error.code.trim() !== ''
            ? error.code
            : undefined;
          const message = typeof error.message === 'string' && error.message.trim() !== ''
            ? error.message
            : undefined;
          const status = typeof error.status === 'number' && Number.isFinite(error.status)
            ? error.status
            : undefined;
          if (code === undefined && message === undefined && status === undefined) {
            console.error(`[auto-continue] 忽略畸形 turn/end ${sessionId}: error details 无法解释`);
            break;
          }
          state.lastFailure = {
            code: code ?? 'UNKNOWN',
            message: message ?? code ?? `HTTP ${status}`,
            ...(status !== undefined ? { status } : {}),
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
        if (isOurEcho(state, event)) break; // 我们自己的回显(跨标签页识别)
        if (event.data.source.kind === 'user') {
          // 用户手动介入: 清零上限与跨标签页发送计数
          state.consecutive = 0;
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
    return {
      actions: [
        { action: 'resume', title: copy.resumeAction },
        { action: 'pause1h', title: copy.pauseAction },
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
      this.pauseUntil.set(sessionId, Date.now() + 60 * 60 * 1000);
      this.cancelPending(sessionId, '通知按钮暂停该会话');
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
    const state = this.state(sessionId);
    if (state.subagent) return;
    if (state.pendingTimer !== undefined) {
      clearTimeout(state.pendingTimer);
      state.pendingTimer = undefined;
    }
    try {
      await this.fire(sessionId, 'manual:notification', true);
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

  private schedule(sessionId: SessionId, reason: string): void {
    const state = this.state(sessionId);
    const config = this.getConfig();
    if (state.subagent) return; // 子代理会话由父代理处理, 不抢跑
    if (config.paused) {
      this.log(`跳过 ${sessionId}(${reason}): 全局暂停中`);
      return;
    }
    if (Date.now() < (this.pauseUntil.get(sessionId) ?? 0)) {
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
    const timer = setTimeout(() => {
      if (state.pendingTimer !== timer) return;
      state.pendingTimer = undefined;
      // 保险丝: 定时器回调内任何异常(含 inactive context)都不得成为未捕获异常炸掉进程。
      try {
        void this.fire(sessionId, reason);
      } catch (error) {
        console.error(`[auto-continue] 定时发送异常 ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
      }
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

  private fire(sessionId: SessionId, reason: string, force = false): void {
    if (this.disposed) return;
    const state = this.state(sessionId);
    const config = this.getConfig();
    if (state.subagent) return; // 子代理会话由父代理处理, 不抢跑
    if (config.paused) {
      this.log(`跳过 ${sessionId}(${reason}): 全局暂停中`);
      return;
    }
    if (Date.now() < (this.pauseUntil.get(sessionId) ?? 0)) {
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
    const template = reason.startsWith('loop:')
      ? config.loopText
      : reason.includes('max-tokens')
        ? config.continueTextMaxTokens
        : config.continueText;
    const text = this.buildContinueText(config, state, template);
    // 发送: agent.followup 是排队语义(运行中会排入 inbox, 不会打断), 天然安全
    const agent = this.ctx.agents.get(sessionId);
    if (agent === undefined) {
      this.log(`跳过 ${sessionId}(${reason}): 无 live agent`);
      return;
    }
    state.lastAttemptAt = Date.now(); // 先记账: 无论成败, 本次尝试都进入冷却
    try {
      const message = createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'user' },
      });
      // `followup` may publish the matching session event synchronously.
      trackPendingEcho(state, message.id);
      try {
        agent.followup(message);
      } catch (error) {
        forgetPendingEcho(state, message.id);
        throw error;
      }
      const now = Date.now();
      state.consecutive += 1;
      state.pendingRecoveryAt = now; // 等待窗口内的下一个回合结束来判定恢复结果
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
      tool: state.lastTool,
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
    if (state.lastTool === undefined || state.lastToolResult === undefined) return { kind: 'none' };
    if (state.lastToolResult === 'pending') return { kind: 'pending', tool: state.lastTool };
    if (state.lastToolResult.ok) {
      return { kind: 'done', tool: state.lastTool, result: state.lastToolResult.excerpt };
    }
    return { kind: 'failed', tool: state.lastTool };
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
    // 只扫 live agents(host 重启后 agent-loop 会 resume 崩溃会话, 冷会话无需处理)
    const now = Date.now();
    const candidates: {
      sessionId: SessionId;
      events: readonly SessionEvent[];
      lastActivityAt: number;
      listIndex: number;
    }[] = [];
    for (const agent of this.ctx.agents.list()) {
      const session = agent.session;
      if (session.header.origin === 'subagent') continue; // 子代理由父代理处理
      const events = snapshotSessionEvents(session);
      const lastActivityAt = events.reduce(
        (latest, event) => Math.max(latest, event.time),
        Number.isFinite(session.header.createdAt) ? session.header.createdAt : 0,
      );
      candidates.push({
        sessionId: session.id,
        events,
        lastActivityAt,
        listIndex: candidates.length,
      });
    }
    candidates.sort(
      (left, right) =>
        right.lastActivityAt - left.lastActivityAt || left.listIndex - right.listIndex,
    );
    for (const candidate of candidates.slice(0, config.scanLimit)) {
      if (this.disposed) return true;
      const state = this.state(candidate.sessionId);
      if (state.pendingTimer !== undefined) continue;
      if (state.consecutive >= config.maxConsecutive) continue;
      if (now - state.lastAttemptAt < this.cooldownFor(state)) continue;
      if (now < (this.pauseUntil.get(candidate.sessionId) ?? 0)) continue; // 会话暂停中
      const events = candidate.events;
      // 从尾部找最后一个 turn/end
      let lastEnd: SessionEvent<'turn/end'> | undefined;
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const event = events[i];
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
      for (const event of events) {
        if (event.seq <= lastEnd.seq) continue;
        if (event.type === 'turn/start') superseded = true;
        if (event.type === 'user/message' && event.data.source.kind === 'user') superseded = true;
        if (superseded) break;
      }
      if (superseded) continue;
      // 幂等护栏: 从历史事件里重建上一步工具调用的执行状态
      this.applyGuardFromEvents(state, events, lastEnd.seq);
      const scanReason = `scan:turn/end:${reason.kind}`;
      this.log(`扫描发现中断 ${candidate.sessionId}(turn/end:${reason.kind}), 交给恢复策略处理`);
      if (reason.kind === 'error') {
        const error = reason.error;
        state.lastFailure = {
          code: typeof error.code === 'string' ? error.code : 'UNKNOWN',
          message: typeof error.message === 'string' ? error.message : String(error),
          ...(typeof error.status === 'number' ? { status: error.status } : {}),
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
  private applyGuardFromEvents(
    state: SessionState,
    events: readonly SessionEvent[],
    untilSeq: number,
  ): void {
    state.lastTool = undefined;
    state.lastToolResult = undefined;
    let call: SessionEvent<'tool/call'> | undefined;
    for (const event of events) {
      if (event.seq >= untilSeq) continue;
      if (event.type === 'tool/call') call = event;
    }
    if (call === undefined) return;
    state.lastTool = call.data.name;
    state.lastToolResult = 'pending';
    for (const event of events) {
      if (event.seq <= call.seq || event.seq >= untilSeq) continue;
      if (event.type === 'tool/result') {
        state.lastToolResult = toolResultFacts(event.data);
        break;
      }
    }
  }
}
