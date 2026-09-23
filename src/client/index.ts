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
  AutoContinueSettingsPage,
} from './settings-card.tsx';
import { startBridge } from './bridge.ts';
import type { SettingsScope } from './dsh-store-compat.ts';

/** Dictionary namespace owned by this plugin. */
const NS = 'auto-continue';

/** Settings namespace the settings card edits (the host engine reads it). */
const SETTINGS_NS = 'auto-continue';

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** DSH 0.1.7's bundle configuration seat; only the owner props we consume. */
    'plugins.bundle.config': {
      kind: 'keyed';
      scope: 'root';
      owner: { readonly view: 'summary' | 'page' };
    };
  }
  interface LocaleNamespaceMap {
    /** auto-continue settings-card copy. */
    'auto-continue': SettingsCardKey;
  }
}

/** Shared subset of DSH 0.1.7's provider, without a new runtime dependency. */
type ConfigFormsContext = ClientContext & {
  configForms: { get<T>(entryId: string): SettingsScope<T> };
};

/** Settings services are injected separately: neither exists in every DSH cohort. */
export const inject = ['slots', 'locale'];

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
  ctx.effect(() => startBridge(), 'auto-continue: host bridge');

  // Cordis waits for ALL top-level dependencies. Requiring settingsScope here
  // would leave DSH 0.1.7 pending forever; requiring configForms breaks older
  // hosts. Separate child fibers also follow late providers and their teardown.
  ctx.inject(['settingsScope'], (settingsCtx) => {
    mountSettings(settingsCtx, settingsCtx.settingsScope.bind<AutoContinueSettings>({ namespace: SETTINGS_NS }));
  });
  ctx.inject(['configForms'], (settingsCtx) => {
    const forms = (settingsCtx as ConfigFormsContext).configForms;
    mountSettings(settingsCtx, forms.get<AutoContinueSettings>(SETTINGS_NS));
  });
}

/** Attach this consumer's subscriptions and card to the provider's lifecycle. */
function mountSettings(ctx: ClientContext, scope: SettingsScope<AutoContinueSettings>): void {
  /**
   * Mirror the browser locale into the host config, with a hard per-page budget.
   *
   * The write is only needed while the stored value disagrees with the page, so
   * every notification re-checks the snapshot — but two unbounded writers hid in
   * that check, and both of them hammer `settings.yaml` until the host settings
   * write queue backs up (observed: ~1 write / 400 ms when a completed write does
   * not fold back before the next document tick, and a two-page ping-pong when
   * two pages with different UI languages keep overwriting each other).
   *
   * So: keep the subscription and the `locale/change` hook (a scope that is not
   * `ready` yet still mirrors once it is, and a real language switch still wins),
   * but cap this page at {@link MAX_MIRROR_ATTEMPTS} writes per active locale.
   *
   * The budget must NOT be reset by a matching snapshot. In the real
   * `SettingsScopeController`, a successful `set()` folds the mutation response
   * into the WRITING page's own mirror (`mirror.acceptView` -> scope `derive()` ->
   * subscriber), so under the two-page ping-pong each page first sees its own
   * accepted value — matching its active locale — and would hand itself a fresh
   * budget before the other page writes back. That is an unbounded loop again
   * (probed: 400+ host writes). Reset only when the browser's active locale
   * genuinely changes; a matching snapshot then simply needs no write.
   */
  const MAX_MIRROR_ATTEMPTS = 3;
  let mirroredLocale: string | undefined;
  let mirrorAttempts = 0;
  const syncLocale = (): void => {
    const active = ctx.locale.getLocale().active;
    const snapshot = scope.getSnapshot();
    if (snapshot.status !== 'ready' || !snapshot.writable || snapshot.mode !== 'host') return;
    // A genuine language switch is the only thing that earns a fresh budget: the
    // attempt count must survive matching snapshots, because the writing page's
    // own acknowledgement arrives as a match (see above). Tracking `mirroredLocale`
    // on every pass is what lets a later real switch be recognised.
    if (mirroredLocale !== active) {
      mirroredLocale = active;
      mirrorAttempts = 0;
    }
    // Converged: nothing to write.
    if (snapshot.value?.locale === active) return;
    if (mirrorAttempts >= MAX_MIRROR_ATTEMPTS) return;
    mirrorAttempts += 1;
    void scope.set('locale', active);
  };
  ctx.effect(() => scope.subscribe(syncLocale), 'auto-continue: locale settings sync');
  ctx.on('locale/change', syncLocale);
  syncLocale();

  const controller = new AutoContinueSettingsCardController(scope);
  ctx.effect(() => () => controller.dispose(), 'auto-continue: settings form');

  // Slot injection waits for the matching UI declaration. Keep the old
  // settings card and the new bundle page independent of service migration.
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
  ctx.slots.inject('plugins.bundle.config', () =>
    ctx.slots.register(
      {
        name: 'plugins.bundle.config',
        key: 'dsh-client-auto-continue',
        locale: NS,
        inject: () => controller.inject(),
      },
      AutoContinueSettingsPage,
    ),
  );
}
