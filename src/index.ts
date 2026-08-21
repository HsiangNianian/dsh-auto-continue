/**
 * Host half of the auto-continue plugin.
 *
 * - Registers the `auto-continue` settings namespace (the browser half's
 *   settings card edits it; the host engine reads it).
 * - Runs the single-instance auto-continue engine: listens to the session
 *   event firehose, sends via `agent.followup`, cancels via `agent.cancel`.
 * - Serves a status bridge the browser half subscribes to: notifications and
 *   runtime state (stats / pauses), plus an action endpoint for notification
 *   buttons.
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import { AutoContinueRunner, resolveConfig, type AutoContinueSettings } from './host/engine.ts';
// Type-only: pulls the `ctx.settings` Context augmentation from dsh-settings.
import type {} from '@deepseek-ai/dsh-settings';
// Type-only: pulls the `ctx.webServer` Context augmentation.
import type {} from '@deepseek-ai/dsh-host-webserver';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-session';

/** Settings namespace of the auto-continue plugin (lowercase kebab-case). */
export const AUTO_CONTINUE_NS = 'auto-continue';

/** Wire schema of the auto-continue section; defaults are the plugin's built-in values. */
export const AutoContinueSchema = z.object({
  /** Text automatically sent after an interruption. */
  continueText: z.string().default('继续'),
  /** Text sent when the output token ceiling is reached (same placeholders as `continueText`). */
  continueTextMaxTokens: z.string().default('继续'),
  /** Idempotency guard: inspect the last tool call before resuming and steer the model. */
  guardTools: z.boolean().default(true),
  /** Guard text appended when the last tool call has no confirmed result (it may have partially executed). */
  guardPendingText: z
    .string()
    .default('(上一步工具「{tool}」可能未完成, 先确认状态再继续, 不要重复执行)'),
  /** Guard text appended when the last tool call completed successfully (don't rerun it). */
  guardDoneText: z
    .string()
    .default('(上一步工具「{tool}」已完成, 结果: {result}; 不要重复执行, 直接继续)'),
  /** Grace period after an interruption before auto-sending (ms). */
  graceMs: z.natural().default(3000),
  /** Minimum interval between two auto-continues per session (ms). */
  cooldownMs: z.natural().default(20000),
  /** Max consecutive auto-continues per session before stopping. */
  maxConsecutive: z.natural().min(1).default(3),
  /** Scan recently interrupted sessions on page load / reconnect. */
  scanOnBoot: z.boolean().default(true),
  /** Max sessions the scan checks (most recently updated). */
  scanLimit: z.natural().min(1).default(8),
  /** Scan only considers interruptions inside this window (ms). */
  freshMs: z.natural().default(15 * 60 * 1000),
  /** Delay before scanning after a reconnect (ms). */
  reconnectScanDelayMs: z.natural().default(5000),
  /** SSE reconnect backoff (ms). */
  reconnectBackoffMs: z.natural().default(3000),
  /** Log `[auto-continue]` lines to the browser console. */
  verbose: z.boolean().default(true),
  /** Classify failures: auto-continue transient errors only; permanent ones are skipped and notified. */
  classify: z.boolean().default(true),
  /** Cooldown multiplier per consecutive failure (adaptive backoff). */
  backoffFactor: z.natural().min(1).default(2),
  /** Cap on the effective backoff interval (ms). */
  backoffMaxMs: z.natural().default(300000),
  /** Show browser notifications for auto-continue events. */
  notify: z.boolean().default(false),
  /** Globally pause auto-continue: no live or scan send. */
  paused: z.boolean().default(false),
  /** Loop guard: detect a running turn spinning in place and restart it. */
  loopGuard: z.boolean().default(true),
  /** A model message shorter than this many chars counts as a short sentence (loop signal). */
  loopShortChars: z.natural().min(1).default(40),
  /** Consecutive short sentences within this window (ms) with no tool call in between trip the loop guard. */
  loopWindowMs: z.natural().min(1000).default(30000),
  /** Consecutive short sentences trip the loop guard. */
  loopShortCount: z.natural().min(2).default(12),
  /** Consecutive identical short sentences trip the loop guard (strongest spinning signal). */
  loopRepeatText: z.natural().min(2).default(4),
  /** Consecutive identical tool calls with identical arguments AND results trip the loop guard. */
  loopToolRepeat: z.natural().min(2).default(5),
  /** Text sent after the loop guard cancels and restarts a turn (supports {tool}). */
  loopText: z
    .string()
    .default('(检测到你可能陷入循环, 请停止重复刚才的动作, 换一种方式继续)'),
});

/**
 * Plugin body: register the settings namespace, start the single-instance
 * engine, and serve the status bridge.
 * @param ctx - host plugin context.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(settingsNamespace(AUTO_CONTINUE_NS), AutoContinueSchema, {
      applies: 'live',
    });
  });

  // 单实例引擎: host 进程内监听会话事件, 所有标签页共享同一个引擎。
  ctx.inject(['settings', 'agents', 'webServer'], (engineCtx) => {
    const runner = new AutoContinueRunner(engineCtx, () =>
      resolveConfig(engineCtx.settings.get(settingsNamespace(AUTO_CONTINUE_NS)) as AutoContinueSettings | undefined),
    );

    // 状态桥: browser 侧订阅通知与运行时状态(SSE)。
    const sseClients = new Set<(data: string) => void>();
    const pushToAll = (data: string): void => {
      for (const send of sseClients) {
        try {
          send(data);
        } catch {
          sseClients.delete(send);
        }
      }
    };
    const statePayload = (): string =>
      JSON.stringify({
        type: 'state',
        stats: runner.todayStats(),
        paused: runner.activePauses(),
      });

    runner.subscribeNotices(() => {
      for (const notice of runner.drainNotices()) {
        pushToAll(`data: ${JSON.stringify({ type: 'notice', notice })}\n\n`);
      }
    });
    runner.subscribeState(() => {
      pushToAll(`data: ${statePayload()}\n\n`);
    });

    engineCtx.webServer.register({
      kind: 'exact',
      path: '/api/auto-continue-bridge',
      handler: (req, res) => {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        });
        res.write(`data: ${statePayload()}\n\n`);
        const send = (data: string): void => {
          res.write(data);
        };
        sseClients.add(send);
        req.on('close', () => sseClients.delete(send));
      },
    });

    // 通知按钮动作: browser 点击「立即续跑 / 暂停该会话」时 POST 到这里。
    engineCtx.webServer.register({
      kind: 'exact',
      path: '/api/auto-continue-action',
      handler: (req, res) => {
        let body = '';
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString('utf8');
          if (body.length > 4096) req.destroy();
        });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body) as { sessionId?: string; action?: string };
            if (typeof parsed.action === 'string') {
              runner.handleNoticeAction((parsed.sessionId as never) ?? undefined, parsed.action);
              res.writeHead(200, { 'content-type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
              return;
            }
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false }));
          } catch {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false }));
          }
        });
      },
    });
  });
}
