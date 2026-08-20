/**
 * Host half of the auto-continue plugin: registers the `auto-continue`
 * settings namespace so the browser half's settings card can edit it and the
 * engine can read it. No other host-side behavior.
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Settings namespace of the auto-continue plugin (lowercase kebab-case). */
export declare const AUTO_CONTINUE_NS = "auto-continue";
/** Wire schema of the auto-continue section; defaults are the plugin's built-in values. */
export declare const AutoContinueSchema: z<Schemastery.ObjectS<{
    /** Text automatically sent after an interruption. */
    continueText: z<string, string>;
    /** Text sent when the output token ceiling is reached (same placeholders as `continueText`). */
    continueTextMaxTokens: z<string, string>;
    /** Idempotency guard: inspect the last tool call before resuming and steer the model. */
    guardTools: z<boolean, boolean>;
    /** Guard text appended when the last tool call has no confirmed result (it may have partially executed). */
    guardPendingText: z<string, string>;
    /** Guard text appended when the last tool call completed successfully (don't rerun it). */
    guardDoneText: z<string, string>;
    /** Grace period after an interruption before auto-sending (ms). */
    graceMs: z<number, number>;
    /** Minimum interval between two auto-continues per session (ms). */
    cooldownMs: z<number, number>;
    /** Max consecutive auto-continues per session before stopping. */
    maxConsecutive: z<number, number>;
    /** Scan recently interrupted sessions on page load / reconnect. */
    scanOnBoot: z<boolean, boolean>;
    /** Max sessions the scan checks (most recently updated). */
    scanLimit: z<number, number>;
    /** Scan only considers interruptions inside this window (ms). */
    freshMs: z<number, number>;
    /** Delay before scanning after a reconnect (ms). */
    reconnectScanDelayMs: z<number, number>;
    /** SSE reconnect backoff (ms). */
    reconnectBackoffMs: z<number, number>;
    /** Log `[auto-continue]` lines to the browser console. */
    verbose: z<boolean, boolean>;
    /** Classify failures: auto-continue transient errors only; permanent ones are skipped and notified. */
    classify: z<boolean, boolean>;
    /** Cooldown multiplier per consecutive failure (adaptive backoff). */
    backoffFactor: z<number, number>;
    /** Cap on the effective backoff interval (ms). */
    backoffMaxMs: z<number, number>;
    /** Show browser notifications for auto-continue events. */
    notify: z<boolean, boolean>;
    /** Globally pause auto-continue: no live or scan send. */
    paused: z<boolean, boolean>;
    /** Loop guard: detect a running turn spinning in place and restart it. */
    loopGuard: z<boolean, boolean>;
    /** A model message shorter than this many chars counts as a short sentence (loop signal). */
    loopShortChars: z<number, number>;
    /** Consecutive short sentences within this window (ms) with no tool call in between trip the loop guard. */
    loopWindowMs: z<number, number>;
    /** Consecutive short sentences trip the loop guard. */
    loopShortCount: z<number, number>;
    /** Consecutive identical short sentences trip the loop guard (strongest spinning signal). */
    loopRepeatText: z<number, number>;
    /** Consecutive identical tool calls with identical arguments AND results trip the loop guard. */
    loopToolRepeat: z<number, number>;
    /** Text sent after the loop guard cancels and restarts a turn (supports {tool}). */
    loopText: z<string, string>;
}>, Schemastery.ObjectT<{
    /** Text automatically sent after an interruption. */
    continueText: z<string, string>;
    /** Text sent when the output token ceiling is reached (same placeholders as `continueText`). */
    continueTextMaxTokens: z<string, string>;
    /** Idempotency guard: inspect the last tool call before resuming and steer the model. */
    guardTools: z<boolean, boolean>;
    /** Guard text appended when the last tool call has no confirmed result (it may have partially executed). */
    guardPendingText: z<string, string>;
    /** Guard text appended when the last tool call completed successfully (don't rerun it). */
    guardDoneText: z<string, string>;
    /** Grace period after an interruption before auto-sending (ms). */
    graceMs: z<number, number>;
    /** Minimum interval between two auto-continues per session (ms). */
    cooldownMs: z<number, number>;
    /** Max consecutive auto-continues per session before stopping. */
    maxConsecutive: z<number, number>;
    /** Scan recently interrupted sessions on page load / reconnect. */
    scanOnBoot: z<boolean, boolean>;
    /** Max sessions the scan checks (most recently updated). */
    scanLimit: z<number, number>;
    /** Scan only considers interruptions inside this window (ms). */
    freshMs: z<number, number>;
    /** Delay before scanning after a reconnect (ms). */
    reconnectScanDelayMs: z<number, number>;
    /** SSE reconnect backoff (ms). */
    reconnectBackoffMs: z<number, number>;
    /** Log `[auto-continue]` lines to the browser console. */
    verbose: z<boolean, boolean>;
    /** Classify failures: auto-continue transient errors only; permanent ones are skipped and notified. */
    classify: z<boolean, boolean>;
    /** Cooldown multiplier per consecutive failure (adaptive backoff). */
    backoffFactor: z<number, number>;
    /** Cap on the effective backoff interval (ms). */
    backoffMaxMs: z<number, number>;
    /** Show browser notifications for auto-continue events. */
    notify: z<boolean, boolean>;
    /** Globally pause auto-continue: no live or scan send. */
    paused: z<boolean, boolean>;
    /** Loop guard: detect a running turn spinning in place and restart it. */
    loopGuard: z<boolean, boolean>;
    /** A model message shorter than this many chars counts as a short sentence (loop signal). */
    loopShortChars: z<number, number>;
    /** Consecutive short sentences within this window (ms) with no tool call in between trip the loop guard. */
    loopWindowMs: z<number, number>;
    /** Consecutive short sentences trip the loop guard. */
    loopShortCount: z<number, number>;
    /** Consecutive identical short sentences trip the loop guard (strongest spinning signal). */
    loopRepeatText: z<number, number>;
    /** Consecutive identical tool calls with identical arguments AND results trip the loop guard. */
    loopToolRepeat: z<number, number>;
    /** Text sent after the loop guard cancels and restarts a turn (supports {tool}). */
    loopText: z<string, string>;
}>>;
/**
 * Plugin body: register the settings namespace when a settings provider is
 * composed. Changes apply live — the browser half observes the scope.
 * @param ctx - host plugin context.
 */
export declare function apply(ctx: Context): void;
