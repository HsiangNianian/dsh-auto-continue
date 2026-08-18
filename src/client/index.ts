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
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client';
// Type-only: pulls the settings-surface SlotMap merge and ctx.settingsScope.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
// Type-only: pulls the `settings.plugin.item` SlotMap merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client';
import { AutoContinueRunner, resolveConfig, type AutoContinueSettings } from './engine.ts';
import { en, zh, type SettingsCardKey } from './locales.ts';
import {
  AutoContinueSettingsCard,
  AutoContinueSettingsCardController,
} from './settings-card.tsx';

/** 客户端根上下文的 connection 服务(由 dsh-client-connection 挂载)。 */
declare module '@deepseek-ai/cordis' {
  interface Context {
    connection: ConnectionHandle;
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'auto-continue';

/** Settings namespace the engine reads and the settings card edits. */
const SETTINGS_NS = 'auto-continue';

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** auto-continue settings-card copy. */
    'auto-continue': SettingsCardKey;
  }
}

/** Services required by this plugin. */
export const inject = ['slots', 'locale', 'connection', 'settingsScope'];

// 浏览器侧辅助(设置卡片与模拟测试共用): 暂停控制与统计读取。
export {
  fillTemplate,
  pauseSession,
  pausedSessions,
  readTodayStats,
  resetTodayStats,
  sessionPauseUntil,
  unpauseSession,
} from './engine.ts';

/** 当前 runner(HMR 重载时先销毁旧的再建新的)。 */
let current: AutoContinueRunner | null = null;

/**
 * Plugin body: mount the engine and the settings card.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'auto-continue: dictionaries');

  // Engine: reads the settings scope live, so GUI changes apply immediately.
  const scope = ctx.settingsScope.bind<AutoContinueSettings>({ namespace: SETTINGS_NS });
  current?.dispose();
  current = new AutoContinueRunner(ctx.connection.api, () => resolveConfig(scope.getSnapshot().value));

  // Plugin configuration card: one staged form over the `auto-continue`
  // settings namespace, contributed to the plugin-configuration section
  // (Settings → Plugins). Since DSH 0.1.0-rc.7 `settings.plugin.item` is a
  // keyed slot dispatched by the settings namespace it edits, so the entry
  // registers with `key` (the namespace), like the official cards.
  const controller = new AutoContinueSettingsCardController(scope);
  ctx.slots.inject('settings.plugin.item', () =>
    ctx.slots.register(
      {
        name: 'settings.plugin.item',
        key: SETTINGS_NS,
        locale: NS,
        inject: () => controller.inject(),
      },
      AutoContinueSettingsCard,
    ),
  );
}
