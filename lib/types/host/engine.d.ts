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
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import { type AutoContinueConfig, type DayStats, type RecoveryAttempt, type NotifyAction } from '../shared/core.ts';
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
    private readonly recoveryAttempts;
    private readonly notices;
    private readonly noticeListeners;
    private readonly stateListeners;
    private readonly prioritizedFollowups;
    private readonly disposeSessionEvents;
    private readonly disposeInboxEvents;
    private disposed;
    private readonly bootScannedSessions;
    /** Also bound diagnostics when even an agent's session getter is unavailable. */
    private readonly bootScanErrors;
    /** 存储扫描已裁决的会话 id, 避免每轮重复冷读大日志。 */
    private readonly storedSwept;
    /** 子会话裁决独立记账: storedSwept 在 origin 判断之前就已标记, 不能复用。 */
    private readonly childSwept;
    /** 本轮已花掉的子会话观察配额(每轮重置, 子会话日志与主会话同等昂贵)。 */
    private childScanned;
    /** 本轮收集到的子会话中断, 按 root 主会话 id 归组。 */
    private readonly childInterrupts;
    /** 已唤醒过的 root 会话 → 上次唤醒覆盖的子会话签名, 防止每轮重复催同一批。 */
    private readonly childWoken;
    /** 已打印过「父链不可解析」的子会话, 避免 15 分钟扫描窗口内每轮重扫把日志刷爆。 */
    private readonly childDirtyLogged;
    /** 存储会话的连续观察/物化失败次数, 触达 SWEEP_MAX_FAILURES 后不再重试。 */
    private readonly storedSweepFailures;
    private storedSweepAnnounced;
    private bootScanTimer;
    private wakeBootScan;
    private storedSweep;
    private readonly stopStoredSweep;
    /**
     * @param ctx - host plugin context (agents registry, session events).
     * @param getConfig - read the current resolved configuration (entry config).
     */
    constructor(ctx: Context, getConfig: () => AutoContinueConfig);
    private log;
    /** 对外(状态桥): 今日统计快照。 */
    todayStats(): DayStats;
    recentRecoveryAttempts(): RecoveryAttempt[];
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
    private sessionConfig;
    configurationChanged(): void;
    /** 对外(状态桥): 消费待展示的通知。 */
    drainNotices(): HostNotice[];
    /** 通知动作(browser 通知按钮回传): 立即续跑 / 暂停该会话 / 解除暂停 / 清零统计。 */
    handleNoticeAction(sessionId: SessionId | undefined, action: string): void;
    dispose(): void;
    private state;
    /** Mark a child session and clear queued grace/cooldown sends. */
    private markSubagent;
    /** Read durable origin from the live agent for direct action paths as well. */
    private isSubagent;
    /**
     * 事件入口(host 单实例): 预处理工具调用/结果/模型消息(护栏与循环信号),
     * 然后交给回合状态机。
     */
    private onHostEvent;
    private tracksOutput;
    /** Treat unknown block kinds conservatively: only reasoning and blank text are silent. */
    private hasVisibleContent;
    /** 从 assistant/message 事件提取纯文本。 */
    private assistantText;
    private assistantChunkText;
    private normalizedSegment;
    private isNearDuplicateSegment;
    private withinEditDistance;
    private noteStreamSegment;
    private onAssistantChunk;
    private onAssistantMessage;
    /** 两个循环信号的公共检查; 命中且本回合未打断过则打断。 */
    private checkLoop;
    /**
     * 打断运行中的回合: cancel(带来源标记)+ 进冷却。
     * 只有随后持久化的 turn/end 精确携带专属 hook cause 时,
     * 才会用 loopText 重启回合——DSH 的 first-cause 语义保证用户 Stop 优先。
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
    /**
     * 冷却期内的恢复: 等到冷却结束再重新调度。
     * 直接丢弃会让一次瞬时失败把会话搁置, 直到用户手动发消息才恢复。
     */
    private deferCooldownRetry;
    /** 按调度原因选择续跑模板: loop 重启、无输出回合、max-tokens、自主循环, 其余用通用继续文本。 */
    private templateFor;
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
    /** Inspect newly available sessions; process each settled startup history once. */
    private scanInterrupted;
    /** Bound cold reads even if a backend ignores cancellation; release late leases. */
    private readStored;
    /**
     * 存储扫描: 枚举持久化会话, 把尾部命中恢复谓词的未加载会话物化为
     * live agent。宿主重启后 agent 仅在客户端打开会话时才懒加载, 不物化
     * 则启动扫描永远看不到它们; 谓词与上方扫描一致, 仅失败类原因。
     */
    private sweepStoredSessions;
    /**
     * 子会话裁决。子会话本身永不直接续跑(父代理权威, 见 README), 但启动扫描要
     * 知道它是否在重启时被打断, 才能在自己的 root 会话上补一次带清单的唤醒。
     * 独立 `childSwept` 记账与独立配额: 主扫描的 `storedSwept` 在 origin 判断
     * 之前就已标记, 复用它会让子会话永远扫不到, 也会吃掉主扫描的观察预算。
     */
    private sweepChild;
    /** 把本轮收集到的子会话中断转成 root 会话上的一次唤醒(同一批只催一次)。 */
    private wakeInterruptedChildren;
    /**
     * 在 root 会话上唤醒一次。只有在 root 自己是"干净终态"时才动手: 它若被打断,
     * 主扫描本来就会续跑它; 它若被用户手动停止, 唤醒就是幽灵回合。
     */
    private wakeRoot;
    /** 父会话只在"干净结束"或"被宿主关闭"时接受唤醒; 用户手动停止的绝不复活。 */
    private rootAcceptsWake;
    /** 发送需要 live agent; 存储会话沿既有物化路径拉起, 复用 preset 与模型回装。 */
    private ensureLiveAgent;
    /** 唤醒文本必须带会话级证据: 否则父会话看不到任何状态, 只会白跑一轮再回一句"都结束了"。 */
    private buildChildResumeText;
    /**
     * 重启会把 active goal 置为 disarmed(宿主卸载驱动的正常动作), 只有人类授权的
     * resume 能重新 arm; paused 则是人类的显式决定。两者都默认关闭。
     */
    private rearmGoal;
    /**
     * 按会话记录的 preset 组合把存储会话恢复为 live agent(镜像会话控制
     * 器的 adopt 路径: preset 挂载 + 会话已记录的模型选择回装)。模型选择
     * 以日志记录的 request-header 播种 agentOptions——{{model}}/{{provider}}
     * 提示变量与首次请求路由都读它, 驱动器还会因路由吻合而自行回装日志
     * 记录的 effort; 无落点(从未发过请求的会话)回落宿主默认。恢复时追
     * 加的合成 turn/end(`interrupted`)随后由常规扫描按既有关卡恢复。
     */
    private materializeStored;
    /** Captured identity only: even session.id can throw when the header is damaged. */
    private logBootScanFailure;
    /** 从历史事件恢复上一步工具调用状态(扫描路径的幂等护栏)。 */
    private applyGuardFromEvents;
}
