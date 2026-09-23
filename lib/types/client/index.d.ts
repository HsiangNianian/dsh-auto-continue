/**
 * Auto-continue plugin, browser half (thin shell).
 *
 * Since 0.8.0 the auto-continue ENGINE runs inside the host process (single
 * instance — see src/host/engine.ts), so this half only:
 * - registers the `auto-continue` settings card in the available plugin UI,
 * - subscribes to the host status bridge (SSE) and shows browser
 *   notifications with action buttons (Resume now / Pause 1h) via the bridge
 *   action endpoint,
 * - feeds the card's stats / paused-sessions panels from the bridge state.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type SettingsCardKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        /** DSH 0.1.7's bundle configuration seat; only the owner props we consume. */
        'plugins.bundle.config': {
            kind: 'keyed';
            scope: 'root';
            owner: {
                readonly view: 'summary' | 'page';
            };
        };
    }
    interface LocaleNamespaceMap {
        /** auto-continue settings-card copy. */
        'auto-continue': SettingsCardKey;
    }
}
/** Settings services are injected separately: neither exists in every DSH cohort. */
export declare const inject: string[];
export { pausedSessions, readTodayStats, resetTodayStats, unpauseSession, } from './bridge.ts';
/**
 * Plugin body: settings card + host status bridge (notifications, stats,
 * paused sessions).
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
