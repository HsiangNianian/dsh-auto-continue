/**
 * Host status bridge, browser side.
 *
 * Subscribes to the host engine's `/api/auto-continue-bridge` SSE stream:
 * notifications (shown via the browser Notification API, action buttons POST
 * to `/api/auto-continue-action`) and runtime state (today's stats and the
 * paused-sessions list) consumed by the settings card's live panels.
 */
/** 今日统计视图(与 host 引擎的 DayStats 对应)。 */
export interface DayStatsView {
    date: string;
    sent: number;
    skipped: number;
    recovered: number;
    failed: number;
    gaveUp: number;
    looped: number;
    byCode: Record<string, number>;
}
/** 已暂停会话视图。 */
export interface PausedSessionView {
    sessionId: string;
    until: number;
}
/** 当前桥状态里的已暂停会话(卡片面板用)。 */
export declare function pausedSessions(): PausedSessionView[];
/** 当前桥状态里的今日统计(卡片面板用)。 */
export declare function readTodayStats(): DayStatsView;
/** 清零今日统计(经动作端点交给 host 引擎执行)。 */
export declare function resetTodayStats(): void;
/** 解除某个会话的暂停(经动作端点交给 host 引擎执行)。 */
export declare function unpauseSession(sessionId: string): void;
/** 订阅桥状态变化(卡片面板刷新用)。 */
export declare function subscribeBridge(listener: () => void): () => void;
/**
 * 启动桥订阅(带断线重连), 返回停止函数。
 * 由 client apply 的 ctx.effect 持有。
 */
export declare function startBridge(): () => void;
