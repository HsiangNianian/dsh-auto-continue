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
import type { IApiClient } from '@deepseek-ai/dsh-client-connection/client';
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
/** 用失败事实与回合信息填充 continueText 模板占位符({code}/{message}/{status}/{tool}/{turn})。 */
export declare function fillTemplate(template: string, facts: FailureFacts | undefined, tool: string | undefined, turn: number | undefined): string;
/** 自适应退避: 同一会话连续失败时的有效冷却间隔。 */
export declare function effectiveCooldown(consecutive: number, base: number, factor: number, max: number): number;
/** 插件主体: 一条 mux 流 + 一条 host 流 + 启动/重连扫描。 */
export declare class AutoContinueRunner {
    private readonly api;
    private readonly getConfig;
    private readonly states;
    private readonly muxAbort;
    private readonly hostAbort;
    private disposed;
    private reconnectScans;
    /**
     * @param api - shared wire client (ctx.connection.api).
     * @param getConfig - read the current resolved configuration (settings scope).
     */
    constructor(api: IApiClient, getConfig: () => AutoContinueConfig);
    private log;
    dispose(): void;
    private state;
    private runMux;
    private runHost;
    private onMuxFrame;
    private onSessionEvent;
    private onHostFrame;
    /** 回合失败入口: 先做错误分类, 永久性失败跳过并通知, 临时性失败走正常调度。 */
    private onTurnFailure;
    /** 本会话当前生效的冷却间隔(自适应退避)。 */
    private cooldownFor;
    private schedule;
    private cancelPending;
    private fire;
    private runningViaList;
    private scheduleReconnectScan;
    private bootScanLoop;
    /** 反复尝试扫描, 直到成功(宿主就绪)或达到次数上限。 */
    private scanLoop;
    /**
     * 扫描最近中断过的会话: 最后回合以非人为原因结束, 且其后没有新回合或用户消息。
     * @returns 是否成功完成一次扫描(宿主就绪)。
     */
    private scanInterrupted;
}
