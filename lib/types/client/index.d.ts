/**
 * Auto-continue plugin, browser half.
 *
 * - Runs the auto-continue engine over the live mux + host event streams.
 * - Registers the `auto-continue` settings card into the plugin-configuration
 *   section (`settings.plugin.item`), editing the same namespace the engine
 *   reads — every behavior knob is configurable from the GUI.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
import { type SettingsCardKey } from './locales.ts';
/** 客户端根上下文的 connection 服务(由 dsh-client-connection 挂载)。 */
declare module '@deepseek-ai/cordis' {
    interface Context {
        connection: ConnectionHandle;
    }
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** auto-continue settings-card copy. */
        'auto-continue': SettingsCardKey;
    }
}
/** Services required by this plugin. */
export declare const inject: string[];
export { fillTemplate, pauseSession, pausedSessions, readTodayStats, resetTodayStats, sessionPauseUntil, unpauseSession, } from './engine.ts';
/**
 * Plugin body: mount the engine and the settings card.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
