/**
 * Auto-continue plugin, browser half (thin shell).
 *
 * Since 0.8.0 the auto-continue ENGINE runs inside the host process (single
 * instance — see src/host/engine.ts), so this half only:
 * - registers the `auto-continue` settings card (`settings.plugin.item`),
 * - subscribes to the host status bridge (SSE) and shows browser
 *   notifications with action buttons (Resume now / Pause 1h) via the bridge
 *   action endpoint,
 * - feeds the card's stats / paused-sessions panels from the bridge state.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type SettingsCardKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** auto-continue settings-card copy. */
        'auto-continue': SettingsCardKey;
    }
}
/** Services required by this plugin. */
export declare const inject: string[];
export { pausedSessions, readTodayStats, resetTodayStats, unpauseSession, } from './bridge.ts';
/**
 * Plugin body: settings card + host status bridge (notifications, stats,
 * paused sessions).
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
