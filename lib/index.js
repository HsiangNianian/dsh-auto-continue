// src/index.ts
import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
var AUTO_CONTINUE_NS = "auto-continue";
var AutoContinueSchema = z.object({
  /** Text automatically sent after an interruption. */
  continueText: z.string().default("继续"),
  /** Text sent when the output token ceiling is reached (same placeholders as `continueText`). */
  continueTextMaxTokens: z.string().default("继续"),
  /** Idempotency guard: inspect the last tool call before resuming and steer the model. */
  guardTools: z.boolean().default(true),
  /** Guard text appended when the last tool call has no confirmed result (it may have partially executed). */
  guardPendingText: z.string().default("(上一步工具「{tool}」可能未完成, 先确认状态再继续, 不要重复执行)"),
  /** Guard text appended when the last tool call completed successfully (don't rerun it). */
  guardDoneText: z.string().default("(上一步工具「{tool}」已完成, 结果: {result}; 不要重复执行, 直接继续)"),
  /** Grace period after an interruption before auto-sending (ms). */
  graceMs: z.natural().default(3e3),
  /** Minimum interval between two auto-continues per session (ms). */
  cooldownMs: z.natural().default(2e4),
  /** Max consecutive auto-continues per session before stopping. */
  maxConsecutive: z.natural().min(1).default(3),
  /** Scan recently interrupted sessions on page load / reconnect. */
  scanOnBoot: z.boolean().default(true),
  /** Max sessions the scan checks (most recently updated). */
  scanLimit: z.natural().min(1).default(8),
  /** Scan only considers interruptions inside this window (ms). */
  freshMs: z.natural().default(15 * 60 * 1e3),
  /** Delay before scanning after a reconnect (ms). */
  reconnectScanDelayMs: z.natural().default(5e3),
  /** SSE reconnect backoff (ms). */
  reconnectBackoffMs: z.natural().default(3e3),
  /** Log `[auto-continue]` lines to the browser console. */
  verbose: z.boolean().default(true),
  /** Classify failures: auto-continue transient errors only; permanent ones are skipped and notified. */
  classify: z.boolean().default(true),
  /** Cooldown multiplier per consecutive failure (adaptive backoff). */
  backoffFactor: z.natural().min(1).default(2),
  /** Cap on the effective backoff interval (ms). */
  backoffMaxMs: z.natural().default(3e5),
  /** Show browser notifications for auto-continue events. */
  notify: z.boolean().default(false),
  /** Globally pause auto-continue: no live or scan send. */
  paused: z.boolean().default(false)
});
function apply(ctx) {
  ctx.inject(["settings"], (settingsCtx) => {
    settingsCtx.settings.register(settingsNamespace(AUTO_CONTINUE_NS), AutoContinueSchema, {
      applies: "live"
    });
  });
}
export {
  AUTO_CONTINUE_NS,
  AutoContinueSchema,
  apply
};
