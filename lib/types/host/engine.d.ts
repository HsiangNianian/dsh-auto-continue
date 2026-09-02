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
import { type AutoContinueConfig, type DayStats, type NotifyAction } from '../shared/core.ts';
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
    private readonly disposeSessionEvents;
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
