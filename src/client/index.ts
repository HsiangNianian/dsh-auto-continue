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
import type { Context as ClientContext } from '@deepseek-ai/cordis';
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client';
// Type-only: pulls the settings-surface SlotMap merge and ctx.settingsScope.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
// Type-only: pulls the `settings.plugin.item` SlotMap merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client';
import { type AutoContinueSettings } from './engine.ts';
import { en, zh, type SettingsCardKey } from './locales.ts';
import {
  AutoContinueSettingsCard,
  AutoContinueSettingsCardController,
} from './settings-card.tsx';
import { startBridge } from './bridge.ts';

/** Dictionary namespace owned by this plugin. */
const NS = 'auto-continue';

/** Settings namespace the settings card edits (the host engine reads it). */
const SETTINGS_NS = 'auto-continue';

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** auto-continue settings-card copy. */
    'auto-continue': SettingsCardKey;
  }
}

/** Services required by this plugin. */
export const inject = ['slots', 'locale', 'settingsScope'];

// 浏览器侧辅助(设置卡片用): 桥状态读取与暂停解除。
export {
  pausedSessions,
  readTodayStats,
  resetTodayStats,
  unpauseSession,
} from './bridge.ts';

/**
 * Plugin body: settings card + host status bridge (notifications, stats,
 * paused sessions).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'auto-continue: dictionaries');

  // 状态桥: 订阅 host 的通知与运行时状态, 弹浏览器通知并驱动卡片面板。
  ctx.effect(() => startBridge(), 'auto-continue: host bridge');

  // Plugin configuration card: one staged form over the `auto-continue`
  // settings namespace, contributed to the plugin-configuration section
  // (Settings → Plugins). Since DSH 0.1.0-rc.7 `settings.plugin.item` is a
  // keyed slot dispatched by the settings namespace it edits, so the entry
  // registers with `key` (the namespace), like the official cards.
  const scope = ctx.settingsScope.bind<AutoContinueSettings>({ namespace: SETTINGS_NS });
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
