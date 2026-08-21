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
import type { SessionId } from '@deepseek-ai/dsh-session/types';
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
export declare const DEFAULT_CONFIG: AutoContinueConfig;
/** Resolve a (possibly partial / not-yet-loaded) settings section to a full config. */
export declare function resolveConfig(section: AutoContinueSettings | undefined): AutoContinueConfig;
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
export declare function isTransientFailure(failure: FailureFacts): boolean;
/**
 * host/agent-error 消息分类: 仅明确属于网络/传输类的临时错误才自动继续。
 * 其余(序列化失败、配置/宿主内部错误等)视为永久性——重试无益, 且用户停止导致的
 * 序列化失败(如 Windows 下 abort 的 DOMException reason)绝不能自动续跑。
 */
export declare function isTransientAgentError(message: string): boolean;
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
export declare function fillTemplate(template: string, ctx: TemplateContext): string;
/** 上一步工具调用的判定结果: 是否已确认完成, 以及文本摘要。 */
export interface ToolResultFacts {
    /** 工具是否成功完成(内部失败或 isError 视为未成功)。 */
    ok: boolean;
    /** 工具输出的文本摘要(截断)。 */
    excerpt: string;
}
/** 自适应退避: 同一会话连续失败时的有效冷却间隔。 */
export declare function effectiveCooldown(consecutive: number, base: number, factor: number, max: number): number;
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
/** 通知桥事件: host 引擎产生, browser 侧订阅展示(Notification / 动作按钮)。 */
export interface HostNotice {
    /** 稳定标识(供 browser 去重)。 */
    id: string;
    title: string;
    body: string;
    /** 会话 id(通知按钮「立即续跑 / 暂停该会话」作用于它)。 */
    sessionId?: SessionId;
    actions: NotifyAction[];
    /** 产生时间。 */
    at: number;
}
/** 插件主体: 一条 mux 流 + 一条 host 流 + 启动/重连扫描。 */
export declare class AutoContinueRunner {
    private readonly ctx;
    private readonly getConfig;
    private readonly states;
    private readonly pauseUntil;
    private dayStats;
    private readonly notices;
    private readonly noticeListeners;
    private readonly stateListeners;
    private disposed;
    /**
     * @param ctx - host plugin context (agents registry, session events, settings).
     * @param getConfig - read the current resolved configuration (settings service).
     */
    constructor(ctx: Context, getConfig: () => AutoContinueConfig);
    private log;
    /** 对外(状态桥): 今日统计快照。 */
    todayStats(): DayStats;
    /** 对外(状态桥): 当前生效的会话级暂停列表。 */
    activePauses(): {
        sessionId: SessionId;
        until: number;
    }[];
    /** 对外(状态桥): 订阅通知事件(SSE 端点推送)。 */
    subscribeNotices(listener: () => void): () => void;
    /** 对外(状态桥): 订阅运行时状态变化(统计/暂停列表)。 */
    subscribeState(listener: () => void): () => void;
    private emitState;
    /** 对外(状态桥): 消费待展示的通知。 */
    drainNotices(): HostNotice[];
    /** 通知动作(browser 通知按钮回传): 立即续跑 / 暂停该会话 / 解除暂停 / 清零统计。 */
    handleNoticeAction(sessionId: SessionId | undefined, action: string): void;
    dispose(): void;
    private state;
    /**
     * 事件入口(host 单实例): 预处理工具调用/结果/模型消息(护栏与循环信号),
     * 然后交给回合状态机。
     */
    private onHostEvent;
    /** 从 assistant/message 事件提取纯文本。 */
    private assistantText;
    private onAssistantMessage;
    /** 两个循环信号的公共检查; 命中且本回合未打断过则打断。 */
    private checkLoop;
    /**
     * 打断运行中的回合: cancel(带来源标记)+ 进冷却。
     * 随后的 turn/end aborted 会因 loopCancelled 走「可恢复中断」路径,
     * 用 loopText 重启回合——不会与用户手动停止混淆。
     */
    private interruptLoop;
    private onSessionEvent;
    private onTurnFailure;
    /** 通知操作按钮与回调(「立即续跑」/「暂停该会话 1 小时」)。 */
    private notifyOptions;
    private onNotifyAction;
    /** 内存统计(host 单实例): 按今日桶累计。 */
    private bumpStat;
    /** 通知桥: 产生一条通知事件, SSE 端点推给 browser 侧展示。 */
    private notify;
    /** 恢复结果记账: 自动发送后窗口内的回合结束, 判定恢复成功或失败。 */
    private noteRecovery;
    /** 立即为该会话发送一次自动继续(无视冷却与连续上限; 由通知按钮触发)。 */
    resumeNow(sessionId: SessionId): Promise<void>;
    /** 本会话当前生效的冷却间隔(自适应退避)。 */
    private cooldownFor;
    private schedule;
    private cancelPending;
    private fire;
    /**
     * 组装本次续跑消息: 模板填充 + 幂等护栏。
     * 护栏依据上一步工具调用的执行状态附加指引, 防止重跑副作用操作:
     * - 结果未确认(可能已部分执行)→ 提示先确认状态、不要重复执行
     * - 已确认成功 → 提示已完成、不要重复执行
     * - 已失败 → 不加护栏(重试工具本来就是目的)
     */
    private buildContinueText;
    /** 上一步工具调用的护栏状态(实时路径, 由 mux 帧维护)。 */
    private currentGuard;
    private bootScanLoop;
    /** 反复尝试扫描, 直到成功(宿主就绪)或达到次数上限。 */
    private scanLoop;
    /**
     * 扫描最近中断过的会话: 最后回合以非人为原因结束, 且其后没有新回合或用户消息。
     * @returns 是否成功完成一次扫描(宿主就绪)。
     */
    private scanInterrupted;
    /** 从历史事件恢复上一步工具调用状态(扫描路径的幂等护栏)。 */
    private applyGuardFromEvents;
}
