/**
 * dsh-client-auto-continue — 请求中断自动「继续」插件
 *
 * 监听 webui 的实时事件流(mux + host 两条 SSE):
 *   - 回合以非人为原因结束(`turn/end` reason ∈ error / interrupted / max-tokens)
 *   - 宿主报告无回合位置的 Agent 失败(`host/agent-error`)
 * 宽限期后自动向该会话发送一条用户消息(默认「继续」), 模拟用户手动续跑。
 *
 * 安全护栏(全部可调, 见 Config):
 *   - 用户主动停止(aborted)/策略拒绝(blocked)绝不自动继续
 *   - 宽限期(GRACE_MS, 默认 3s)内宿主自行开启新回合(turn/start)则取消
 *   - 每会话冷却(COOLDOWN_MS, 默认 20s)与最大连续次数(MAX_CONSECUTIVE, 默认 3)
 *   - 会话正在运行、有排队消息、是子代理会话时不发送
 *   - 跨标签页互斥(localStorage), 避免多个标签页重复发送
 *   - 启动/重连扫描只处理最近 FRESH_MS(默认 15 分钟)内的中断,
 *     且该中断之后没有新回合或用户消息
 *
 * 配置: 默认值见 Config; 可通过 localStorage["dsh-auto-continue.config"]
 * 存一份 JSON 覆盖任意字段(改完刷新页面生效)。
 */

import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {
  ConnectionHandle,
  HostFrame,
  IApiClient,
  MuxFrame,
  SessionId,
  SessionSummary,
} from "@deepseek-ai/dsh-client-connection/client";
import type { SessionEvent } from "@deepseek-ai/dsh-session/types";

/** 客户端根上下文的 connection 服务(由 dsh-client-connection 挂载)。 */
declare module "@deepseek-ai/cordis" {
  interface Context {
    connection: ConnectionHandle;
  }
}

/** 视为「非人为中断」的回合结束原因。aborted(用户停止)与 blocked(策略拒绝)不在其中。 */
type NonHumanReason = "error" | "interrupted" | "max-tokens";

interface Config {
  /** 自动发送的消息文本。 */
  continueText: string;
  /** 检测到中断后等待的宽限期(ms): 宿主可能自行开启新回合(goal 等), 期间到达 turn/start 则取消。 */
  graceMs: number;
  /** 同一会话两次自动「继续」的最小间隔(ms)。 */
  cooldownMs: number;
  /** 同一会话连续自动「继续」的最大次数, 超过后停止, 直到用户手动介入或出现成功回合。 */
  maxConsecutive: number;
  /** 启动时是否扫描最近中断过的会话(见 scanInterrupted)。 */
  scanOnBoot: boolean;
  /** 启动/重连扫描最多检查的会话数(按最近更新排序, 不含运行中与子代理会话)。 */
  scanLimit: number;
  /** 扫描时只处理 FRESH_MS 以内的中断。 */
  freshMs: number;
  /** 重连后等待宿主完成恢复再扫描的延迟(ms)。 */
  reconnectScanDelayMs: number;
  /** 流断开后的重连退避(ms)。 */
  reconnectBackoffMs: number;
  /** 是否为每条自动消息在控制台输出日志。 */
  verbose: boolean;
}

const DEFAULT_CONFIG: Config = {
  continueText: "继续",
  graceMs: 3000,
  cooldownMs: 20000,
  maxConsecutive: 3,
  scanOnBoot: true,
  scanLimit: 8,
  freshMs: 15 * 60 * 1000,
  reconnectScanDelayMs: 5000,
  reconnectBackoffMs: 3000,
  verbose: true,
};

function loadConfig(): Config {
  const config: Config = { ...DEFAULT_CONFIG };
  try {
    const raw = localStorage.getItem("dsh-auto-continue.config");
    if (raw) Object.assign(config, JSON.parse(raw));
  } catch {
    /* 配置损坏时静默使用默认值 */
  }
  return config;
}

/** 浏览器当前 IANA 时区; 不可用时省略(宿主允许省略)。 */
function clientTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 跨标签页互斥与冷却记录(仅浏览器本地, 不落盘到宿主)。 */
const lockPrefix = "dsh-auto-continue:";
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
}

const freshState = (): SessionState => ({
  consecutive: 0,
  lastAutoAt: 0,
  lastAttemptAt: 0,
  lastSentText: "",
  pendingTimer: undefined,
  running: undefined,
  queued: 0,
  subagent: false,
});

/** 判定一条 user/message 是否是我们自己自动发送的回显。 */
function isOurEcho(state: SessionState, event: SessionEvent): boolean {
  if (event.type !== "user/message") return false;
  const message = event.data;
  if (message.source.kind !== "user") return false;
  if (state.lastSentText === "") return false;
  if (Date.now() - state.lastAutoAt > 30000) return false;
  const text = message.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
  return text === state.lastSentText;
}

function isNonHumanReason(kind: string): kind is NonHumanReason {
  return kind === "error" || kind === "interrupted" || kind === "max-tokens";
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
  config: Config,
  log: (message: string) => void,
  signal: AbortSignal,
): Promise<void> {
  let backoff = config.reconnectBackoffMs;
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
    backoff = config.reconnectBackoffMs;
    onReconnect();
    await sleep(config.reconnectBackoffMs);
  }
}

/** 插件主体: 一条 mux 流 + 一条 host 流 + 启动/重连扫描。 */
class AutoContinueRunner {
  private readonly api: IApiClient;
  private readonly config: Config;
  private readonly states = new Map<SessionId, SessionState>();
  private readonly muxAbort = new AbortController();
  private readonly hostAbort = new AbortController();
  private disposed = false;
  private reconnectScans = 0;

  constructor(ctx: ClientContext) {
    this.api = ctx.connection.api;
    this.config = loadConfig();
    if (!this.config.continueText.trim()) {
      console.warn("[auto-continue] continueText 为空, 插件停用。");
      this.disposed = true;
      return;
    }
    void this.runMux();
    void this.runHost();
    if (this.config.scanOnBoot) {
      // 启动时连接可能尚未建立, 循环重试直到成功。
      void this.bootScanLoop();
    }
    this.log(
      `已启动(文本="${this.config.continueText}", 宽限 ${this.config.graceMs}ms, ` +
        `冷却 ${this.config.cooldownMs}ms, 最多连续 ${this.config.maxConsecutive} 次)`,
    );
  }

  private log(message: string): void {
    if (this.config.verbose) console.info(`[auto-continue] ${message}`);
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
      this.config,
      (m) => this.log(m),
      this.muxAbort.signal,
    );
  }

  private runHost(): Promise<void> {
    return pumpStream<HostFrame>(
      (signal) => this.api.events.host({}, signal),
      (payload) => this.onHostFrame(payload),
      () => this.scheduleReconnectScan(),
      this.config,
      (m) => this.log(m),
      this.hostAbort.signal,
    );
  }

  // ---------- mux 帧 ----------

  private onMuxFrame(frame: MuxFrame): void {
    switch (frame.type) {
      case "session/event":
        this.onSessionEvent(frame.sessionId, frame.event);
        break;
      case "session/queue":
        this.state(frame.sessionId).queued = frame.items.length;
        if (frame.items.length > 0) this.cancelPending(frame.sessionId, "出现排队消息");
        break;
      case "stream/error":
        this.log(`mux stream/error: ${frame.error.code} ${frame.error.message}`);
        break;
      default:
        break; // session/subscribed、approval/*、question/*、session/jobs、session/projection 与本插件无关
    }
  }

  private onSessionEvent(sessionId: SessionId, event: SessionEvent): void {
    const state = this.state(sessionId);
    switch (event.type) {
      case "turn/start":
        state.running = true;
        this.cancelPending(sessionId, "宿主自行开启新回合");
        break;
      case "turn/end": {
        state.running = false;
        this.cancelPending(sessionId, "收到新的 turn/end");
        const reason = event.data.reason;
        if (reason.kind === "completed") {
          // 成功回合: 恢复健康状态
          state.consecutive = 0;
        } else if (reason.kind === "aborted") {
          // 用户主动停止: 不自动继续, 视为用户介入
          state.consecutive = 0;
        } else if (reason.kind === "blocked") {
          // 策略拒绝: 不自动继续
        } else if (isNonHumanReason(reason.kind)) {
          this.schedule(sessionId, `turn/end:${reason.kind}`);
        }
        break;
      }
      case "user/message":
        if (isOurEcho(state, event)) break; // 我们自己的回显
        if (event.data.source.kind === "user") {
          // 用户手动介入
          state.consecutive = 0;
          this.cancelPending(sessionId, "用户手动发送消息");
        }
        break;
      default:
        break;
    }
  }

  // ---------- host 帧 ----------

  private onHostFrame(frame: HostFrame): void {
    switch (frame.type) {
      case "host/session-status":
        this.state(frame.sessionId).running = frame.running;
        if (frame.running) this.cancelPending(frame.sessionId, "宿主报告会话开始运行");
        break;
      case "host/session-added":
        this.state(frame.sessionId).subagent = frame.parentSessionId !== undefined;
        break;
      case "host/agent-error":
        if (this.state(frame.sessionId).subagent) break;
        this.log(`host/agent-error(${frame.sessionId}): ${frame.message}`);
        this.schedule(frame.sessionId, "host/agent-error");
        break;
      case "host/session-removed":
        this.cancelPending(frame.sessionId, "会话已移除");
        this.states.delete(frame.sessionId);
        break;
      default:
        break;
    }
  }

  // ---------- 调度 ----------

  private schedule(sessionId: SessionId, reason: string): void {
    const state = this.state(sessionId);
    if (state.subagent) return; // 子代理会话由父代理处理, 不抢跑
    if (state.pendingTimer !== undefined) return; // 已有待发送
    if (Date.now() - state.lastAttemptAt < this.config.cooldownMs) return; // 冷却期(含失败尝试)
    if (state.consecutive >= this.config.maxConsecutive) {
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
    }, this.config.graceMs);
    state.pendingTimer = timer;
    this.log(
      `检测到非人为中断 ${sessionId}(${reason}), ${this.config.graceMs}ms 后自动发送「${this.config.continueText}」`,
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
    // 权威 running 检查: 优先用 host 帧, 未知时回退到 session.list
    if (state.running === undefined) {
      const running = await this.runningViaList(sessionId);
      if (running === undefined || running) {
        this.log(`跳过 ${sessionId}: 无法确认空闲(${running === undefined ? "未知" : "运行中"})`);
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
    // 跨标签页冷却
    if (Date.now() - readLastSend(sessionId) < this.config.cooldownMs) {
      this.log(`跳过 ${sessionId}: 其他标签页刚发送过`);
      return;
    }
    if (!claimSend(sessionId)) {
      this.log(`跳过 ${sessionId}: 其他标签页正在发送`);
      return;
    }
    const text = this.config.continueText;
    const zone = clientTimeZone();
    state.lastAttemptAt = Date.now(); // 先记账: 无论成败, 本次尝试都进入冷却
    try {
      const response = await this.api.sessions.prompt({
        sessionId,
        mode: "queue",
        content: [{ type: "text", text }],
        ...(zone === undefined ? {} : { clientTimeZone: zone }),
      });
      if (response.result.ok) {
        const now = Date.now();
        state.consecutive += 1;
        state.lastAutoAt = now;
        state.lastSentText = text;
        writeLastSend(sessionId, now);
        this.log(`已自动发送「${text}」到 ${sessionId}(${reason}), 第 ${state.consecutive} 次连续`);
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
      void this.scanLoop(6, this.config.reconnectScanDelayMs);
    }, this.config.reconnectScanDelayMs);
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
            `扫描失败(${attempt + 1}/${attempts === Infinity ? "∞" : attempts}): ${
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
    const response = await this.api.sessions.list({});
    if (!response.result.ok) return false;
    const items = response.result.value.items;
    const candidates = items
      .filter((summary) => !summary.running && summary.parentSessionId === undefined)
      .slice(0, this.config.scanLimit);
    const now = Date.now();
    for (const summary of candidates) {
      if (this.disposed) return true;
      const state = this.state(summary.sessionId);
      if (state.pendingTimer !== undefined) continue;
      if (state.consecutive >= this.config.maxConsecutive) continue;
      if (now - state.lastAttemptAt < this.config.cooldownMs) continue;
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
      let lastEnd: SessionEvent<"turn/end"> | undefined;
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const event = events[i]?.event;
        if (event !== undefined && event.type === "turn/end") {
          lastEnd = event;
          break;
        }
      }
      if (lastEnd === undefined) continue;
      const reason = lastEnd.data.reason;
      if (!isNonHumanReason(reason.kind)) continue;
      if (lastEnd.time < now - this.config.freshMs) continue; // 太久远, 不翻旧账
      // 该 turn/end 之后不能有新回合或用户消息(说明已被处理)
      let superseded = false;
      for (const entry of events) {
        const event = entry.event;
        if (event.seq <= lastEnd.seq) continue;
        if (event.type === "turn/start") superseded = true;
        if (event.type === "user/message" && event.data.source.kind === "user") superseded = true;
        if (superseded) break;
      }
      if (superseded) continue;
      this.log(`扫描发现中断 ${summary.sessionId}(turn/end:${reason.kind}), 安排自动继续`);
      this.schedule(summary.sessionId, `scan:turn/end:${reason.kind}`);
    }
    return true;
  }
}

// ---------- 插件入口 ----------

/** 当前 runner(HMR 重载时先销毁旧的再建新的)。 */
let current: AutoContinueRunner | null = null;

/** 所需服务: 连接句柄(ctx.connection.api)。 */
export const inject = ["connection"];

/**
 * 插件主体: 挂载事件监听, 开始自动续跑。
 * @param ctx - 客户端根上下文。
 */
export function apply(ctx: ClientContext): void {
  current?.dispose();
  current = new AutoContinueRunner(ctx);
}
