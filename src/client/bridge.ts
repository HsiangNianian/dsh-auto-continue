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

interface BridgeState {
  stats: DayStatsView;
  paused: PausedSessionView[];
}

interface BridgeNotice {
  id: string;
  title: string;
  body: string;
  sessionId?: string;
  actions: { action: string; title: string }[];
  at: number;
}

const EMPTY_STATS: DayStatsView = {
  date: '',
  sent: 0,
  skipped: 0,
  recovered: 0,
  failed: 0,
  gaveUp: 0,
  looped: 0,
  byCode: {},
};

let state: BridgeState = { stats: EMPTY_STATS, paused: [] };
const listeners = new Set<() => void>();

/** 当前桥状态里的已暂停会话(卡片面板用)。 */
export function pausedSessions(): PausedSessionView[] {
  return state.paused;
}

/** 当前桥状态里的今日统计(卡片面板用)。 */
export function readTodayStats(): DayStatsView {
  return state.stats;
}

/** 清零今日统计(经动作端点交给 host 引擎执行)。 */
export function resetTodayStats(): void {
  void postAction({ action: 'reset-stats' });
}

/** 解除某个会话的暂停(经动作端点交给 host 引擎执行)。 */
export function unpauseSession(sessionId: string): void {
  void postAction({ action: 'unpause', sessionId });
}

/** 订阅桥状态变化(卡片面板刷新用)。 */
export function subscribeBridge(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 通知按钮动作回传 host(立即续跑 / 暂停该会话 1 小时 / 解除暂停 / 清零统计)。 */
async function postAction(payload: { action: string; sessionId?: string }): Promise<void> {
  try {
    await fetch('/api/auto-continue-action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    /* host 不可达时静默 */
  }
}

function handleEvent(event: { type: string; notice?: BridgeNotice; stats?: DayStatsView; paused?: PausedSessionView[] }): void {
  if (event.type === 'state') {
    state = {
      stats: event.stats ?? EMPTY_STATS,
      paused: event.paused ?? [],
    };
    for (const listener of listeners) listener();
  } else if (event.type === 'notice' && event.notice !== undefined) {
    showNotification(event.notice);
  }
}

/** 浏览器通知: 展示 host 通知并挂动作按钮。 */
function showNotification(notice: BridgeNotice): void {
  try {
    const N = (globalThis as { Notification?: unknown }).Notification as
      | (new (t: string, o: { body: string; actions?: { action: string; title: string }[] }) => unknown)
      | undefined;
    if (typeof N === 'undefined') return;
    const permission = (N as unknown as { permission?: string }).permission;
    const create = (): void => {
      const instance = new N(notice.title, {
        body: notice.body,
        ...(notice.actions.length > 0 ? { actions: notice.actions } : {}),
      });
      const target = instance as {
        onclick?: (() => void) | null;
        onaction?: ((event: { action: string }) => void) | null;
      };
      target.onclick = () => {
        try {
          (globalThis as { focus?: () => void }).focus?.();
        } catch {
          /* ignore */
        }
      };
      target.onaction = (event) => {
        if (notice.sessionId !== undefined) {
          void postAction({ action: event.action, sessionId: notice.sessionId });
        }
      };
    };
    if (permission === 'granted') {
      create();
    } else if (permission === 'default') {
      void (N as unknown as { requestPermission?: () => Promise<string> }).requestPermission?.()
        .then((result) => {
          if (result === 'granted') create();
        })
        .catch(() => {});
    }
  } catch {
    /* 通知失败不影响核心逻辑 */
  }
}

/**
 * 启动桥订阅(带断线重连), 返回停止函数。
 * 由 client apply 的 ctx.effect 持有。
 */
export function startBridge(): () => void {
  let stopped = false;
  let controller: AbortController | undefined;

  const loop = async (): Promise<void> => {
    while (!stopped) {
      controller = new AbortController();
      try {
        const response = await fetch('/api/auto-continue-bridge', { signal: controller.signal });
        if (!response.ok || response.body === null) throw new Error(`bridge HTTP ${response.status}`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx = buffer.indexOf('\n\n');
          while (idx !== -1) {
            const chunk = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            for (const line of chunk.split('\n')) {
              if (line.startsWith('data: ')) {
                try {
                  handleEvent(JSON.parse(line.slice(6)) as Parameters<typeof handleEvent>[0]);
                } catch {
                  /* 忽略坏帧 */
                }
              }
            }
            idx = buffer.indexOf('\n\n');
          }
        }
      } catch {
        /* 断线: 退避重连 */
      }
      if (!stopped) await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  };
  void loop();

  return () => {
    stopped = true;
    controller?.abort();
  };
}
