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
}>, Schemastery.ObjectT<{
    /** Text automatically sent after an interruption. */
    continueText: z<string, string>;
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
}>>;
/**
 * Plugin body: register the settings namespace when a settings provider is
 * composed. Changes apply live — the browser half observes the scope.
 * @param ctx - host plugin context.
 */
export declare function apply(ctx: Context): void;
