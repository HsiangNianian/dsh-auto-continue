/**
 * Host half of the auto-continue plugin: registers the `auto-continue`
 * settings namespace so the browser half's settings card can edit it and the
 * engine can read it. No other host-side behavior.
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
// Type-only: pulls the `ctx.settings` Context augmentation from dsh-settings.
import type {} from '@deepseek-ai/dsh-settings';

/** Settings namespace of the auto-continue plugin (lowercase kebab-case). */
export const AUTO_CONTINUE_NS = 'auto-continue';

/** Wire schema of the auto-continue section; defaults are the plugin's built-in values. */
export const AutoContinueSchema = z.object({
  /** Text automatically sent after an interruption. */
  continueText: z.string().default('继续'),
  /** Text sent when the output token ceiling is reached (same placeholders as `continueText`). */
  continueTextMaxTokens: z.string().default('继续'),
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
});

/**
 * Plugin body: register the settings namespace when a settings provider is
 * composed. Changes apply live — the browser half observes the scope.
 * @param ctx - host plugin context.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(settingsNamespace(AUTO_CONTINUE_NS), AutoContinueSchema, {
      applies: 'live',
    });
  });
}
