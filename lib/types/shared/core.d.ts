/** 共享核心: 平台无关的纯逻辑与类型。
 *
 * 被 host 引擎(src/host/engine.ts)与浏览器半侧共用: 配置解析、错误分类、
 * 模板填充、自适应退避、幂等护栏的工具结果提取、循环守卫的会话状态机,
 * 以及回显识别。引擎迁入 host 后(0.8.0), 浏览器半侧只 re-export 本模块。
 */
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
/**
 * 视为「非人为中断」的回合结束原因, 用于启动/重连扫描。
 * - `interrupted` 只由崩溃修复在宿主重载时写入(loop 永不实时发出), 因此仅在扫描路径处理;
 * - 实时事件路径只对 `error` / `max-tokens` 自动续跑;
 * - `aborted`(用户停止)与 `blocked`(策略拒绝)永不自动继续。
 */
type NonHumanReason = 'error' | 'interrupted' | 'max-tokens';
export declare function isNonHumanReason(kind: string): kind is NonHumanReason;
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
/** 从 tool/result 事件载荷提取成功与否与文本摘要。 */
export declare function toolResultFacts(data: {
    error?: {
        name?: string;
        code?: string;
    };
    message?: {
        content?: Array<{
            type?: string;
            content?: unknown;
            isError?: boolean;
        }>;
    };
}): ToolResultFacts;
/** 自适应退避: 同一会话连续失败时的有效冷却间隔。 */
export declare function effectiveCooldown(consecutive: number, base: number, factor: number, max: number): number;
export declare function sleep(ms: number): Promise<void>;
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
export declare function todayKey(): string;
/** 空统计桶。 */
export declare function emptyDayStats(): DayStats;
/** 每会话运行时状态。 */
export interface SessionState {
    /** 连续自动「继续」次数; 成功回合或用户手动介入后归零。 */
    consecutive: number;
    /** 上次自动「继续」时间戳。 */
    lastAutoAt: number;
    /** 上次自动「继续」尝试(成功或失败)时间戳; 防止失败场景下的快速重试循环。 */
    lastAttemptAt: number;
    /** 我们上次自动发送的文本(用于识别自己的回显)。 */
    lastSentText: string;
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
    toolRun: {
        /** 工具名 + 参数(用于判定是否同一调用)。 */
        key: string;
        /** 连续相同调用数(结果确认后更新)。 */
        count: number;
        /** 上次该调用的结果摘要(比较用)。 */
        lastResult: string | undefined;
        /** 本次调用等待结果确认。 */
        waiting: boolean;
    } | undefined;
    /** 本回合已触发过 loop guard(防重复打断)。 */
    loopFired: boolean;
    /** loop 重启的延迟定时器(冷却结束后再 schedule)。 */
    loopRetryTimer: ReturnType<typeof setTimeout> | undefined;
    /** 我们主动 cancel 过本回合(区分用户停止)。 */
    loopCancelled: boolean;
}
export declare const freshState: () => SessionState;
export declare const RECOVERY_WINDOW_MS: number;
export declare const ECHO_WINDOW_MS: number;
export declare function isOurEcho(state: SessionState, event: SessionEvent): boolean;
export {};
