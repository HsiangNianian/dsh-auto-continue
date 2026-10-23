/**
 * The auto-continue settings card: edits the `auto-continue` namespace fields
 * from the legacy settings section or the bundle's plugin-manager page.
 *
 * Self-contained card chrome (disclosure header, staged fields, save/discard
 * footer) following the plugin-card store pattern of the DSH plugin
 * configuration section; styles live in `styles.ts` and use the DSH design
 * tokens so the card follows the active theme.
 */
import { useEffect, useId, useState, type ReactNode } from 'react';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { DEFAULT_CONFIG, type AutoContinueSettings } from './engine.ts';
import type { SessionMode } from '../shared/core.ts';
import type { ComposerToggleFace, ComposerToggleState } from './composer-toggle.tsx';
import { NativeSwitch } from './native-switch.tsx';
import { createSnapshotStore, type SettingsScope, type SnapshotStore } from './dsh-store-compat.ts';
import {
  pausedSessions,
  readTodayStats,
  readRecoveryAttempts,
  readSessionPolicy,
  resetTodayStats,
  setSessionMode,
  subscribeBridge,
  unpauseSession,
} from './bridge.ts';
import type { SettingsCardKey } from './locales.ts';
import {
  booleanField,
  canWriteSettings,
  CardForm,
  numberField,
  textField,
  type CardActions,
  type CardFieldState,
  type CardShell,
} from './settings-form.ts';
import { injectStyles } from './styles.ts';
import { prepareSettingsNotification, showSettingsNotification } from './settings-notifications.ts';

// Styles must land during factory materialization so the module system's
// style bookkeeping (HMR) owns them.
injectStyles();

/**
 * Native plugin-settings primitives. Older hosts (and the unit-test fixture)
 * do not export them; the legacy hand-built card stays as the fallback.
 */
const nativeSettings = (() => {
  try {
    return require('@deepseek-ai/dsh-client-ui-primitives') as {
      SettingsForm?: React.ComponentType<{
        labels: { save: string; saving: string; saveFailed: string; readOnly: string; unavailable: string };
        state: CardShell;
        onSave: () => void;
        onDiscard: () => void;
        children: ReactNode;
      }>;
      SettingsValueField?: React.ComponentType<Record<string, unknown>>;
      SegmentedControl?: React.ComponentType<{
        id?: string;
        options: ReadonlyArray<{ value: string; label: string }>;
        value: string;
        onChange: (value: string) => void;
        label: string;
        disabled?: boolean;
      }>;
    };
  } catch {
    return {};
  }
})();

const NativeSettingsForm = nativeSettings.SettingsForm;
const NativeValueField = nativeSettings.SettingsValueField;
const NativeSegmentedControl = nativeSettings.SegmentedControl;
const hasNativeSettings = typeof NativeSettingsForm === 'function' && typeof NativeValueField === 'function';

/** What the auto-continue card renders. */
export interface AutoContinueSettingsCardState extends CardShell {
  /** Committed global state; a staged edit does not pause the engine yet. */
  enabled: boolean;
  /** Feedback for the last local save, including browser permission problems. */
  notificationFeedback: SettingsCardKey | undefined;
  paused: CardFieldState;
  showComposerToggle: CardFieldState;
  continueText: CardFieldState;
  continueTextMaxTokens: CardFieldState;
  resumeSilentTurns: CardFieldState;
  resumeCompletedTurns: CardFieldState;
  continueTextLoop: CardFieldState;
  continueTextSilent: CardFieldState;
  continueTextInterrupted: CardFieldState;
  guardTools: CardFieldState;
  guardPendingText: CardFieldState;
  guardDoneText: CardFieldState;
  graceMs: CardFieldState;
  cooldownMs: CardFieldState;
  maxConsecutive: CardFieldState;
  scanOnBoot: CardFieldState;
  scanLimit: CardFieldState;
  freshMs: CardFieldState;
  verbose: CardFieldState;
  classify: CardFieldState;
  retryableErrorPatterns: CardFieldState;
  backoffFactor: CardFieldState;
  backoffMaxMs: CardFieldState;
  notify: CardFieldState;
  loopGuard: CardFieldState;
  loopShortChars: CardFieldState;
  loopWindowMs: CardFieldState;
  loopShortCount: CardFieldState;
  loopRepeatText: CardFieldState;
  loopToolRepeat: CardFieldState;
  loopText: CardFieldState;
}

/** The registration-side face the card's slot entry injects. */
export interface AutoContinueSettingsCardFace extends CardActions {
  hooks: {
    /** Card snapshot bound by the renderer as useAutoContinueSettingsCard. */
    autoContinueSettingsCard: SnapshotStore<AutoContinueSettingsCardState>;
  };
}

/** Bridges the `auto-continue` scope onto the card's staged form. */
export class AutoContinueSettingsCardController {
  private readonly form: CardForm<AutoContinueSettings>;
  private readonly store: SnapshotStore<AutoContinueSettingsCardState>;
  private readonly composer: SnapshotStore<ComposerToggleState>;
  private readonly composerSaving = new Set<string>();
  private readonly composerFailed = new Set<string>();
  private readonly stopComposer: () => void;
  private disposed = false;
  private saveSequence = 0;
  private notificationFeedback: SettingsCardKey | undefined;

  /**
   * @param scope - the bound settings scope for the `auto-continue` namespace.
   */
  constructor(
    private readonly scope: SettingsScope<AutoContinueSettings>,
    private readonly getLocale: () => string,
  ) {
    this.form = new CardForm(scope, [
      booleanField('paused'),
      booleanField('showComposerToggle'),
      textField('continueText'),
      textField('continueTextMaxTokens'),
      booleanField('resumeSilentTurns'),
      booleanField('resumeCompletedTurns'),
      textField('continueTextLoop'),
      textField('continueTextSilent'),
      textField('continueTextInterrupted'),
      booleanField('guardTools'),
      textField('guardPendingText'),
      textField('guardDoneText'),
      numberField('graceMs', 0),
      numberField('cooldownMs', 0),
      numberField('maxConsecutive', 1),
      booleanField('scanOnBoot'),
      numberField('scanLimit', 1),
      numberField('freshMs', 0),
      booleanField('verbose'),
      booleanField('classify'),
      textField('retryableErrorPatterns'),
      numberField('backoffFactor', 1),
      numberField('backoffMaxMs', 0),
      booleanField('notify'),
      booleanField('loopGuard'),
      numberField('loopShortChars', 1),
      numberField('loopWindowMs', 1000),
      numberField('loopShortCount', 2),
      numberField('loopRepeatText', 2),
      numberField('loopToolRepeat', 2),
      textField('loopText'),
    ]);
    this.store = this.form.bind(() => this.projection(), createSnapshotStore);
    this.composer = this.form.bind(() => this.composerProjection(), createSnapshotStore);
    this.stopComposer = subscribeBridge(() => this.composer.set(this.composerProjection()));
  }

  private projection(): AutoContinueSettingsCardState {
    return {
      ...this.form.shell(),
      enabled: !(this.scope.getSnapshot().value?.paused ?? DEFAULT_CONFIG.paused),
      notificationFeedback: this.notificationFeedback,
      paused: this.form.field('paused'),
      showComposerToggle: this.form.field('showComposerToggle'),
      continueText: this.form.field('continueText'),
      continueTextMaxTokens: this.form.field('continueTextMaxTokens'),
      resumeSilentTurns: this.form.field('resumeSilentTurns'),
      resumeCompletedTurns: this.form.field('resumeCompletedTurns'),
      continueTextLoop: this.form.field('continueTextLoop'),
      continueTextSilent: this.form.field('continueTextSilent'),
      continueTextInterrupted: this.form.field('continueTextInterrupted'),
      guardTools: this.form.field('guardTools'),
      guardPendingText: this.form.field('guardPendingText'),
      guardDoneText: this.form.field('guardDoneText'),
      graceMs: this.form.field('graceMs'),
      cooldownMs: this.form.field('cooldownMs'),
      maxConsecutive: this.form.field('maxConsecutive'),
      scanOnBoot: this.form.field('scanOnBoot'),
      scanLimit: this.form.field('scanLimit'),
      freshMs: this.form.field('freshMs'),
      verbose: this.form.field('verbose'),
      classify: this.form.field('classify'),
      retryableErrorPatterns: this.form.field('retryableErrorPatterns'),
      backoffFactor: this.form.field('backoffFactor'),
      backoffMaxMs: this.form.field('backoffMaxMs'),
      notify: this.form.field('notify'),
      loopGuard: this.form.field('loopGuard'),
      loopShortChars: this.form.field('loopShortChars'),
      loopWindowMs: this.form.field('loopWindowMs'),
      loopShortCount: this.form.field('loopShortCount'),
      loopRepeatText: this.form.field('loopRepeatText'),
      loopToolRepeat: this.form.field('loopToolRepeat'),
      loopText: this.form.field('loopText'),
    };
  }

  /**
   * Build the face the card's slot registration injects.
   * @returns the card's snapshot and its form actions.
   */
  inject(): AutoContinueSettingsCardFace {
    return { hooks: { autoContinueSettingsCard: this.store }, ...this.form.actions(), save: () => void this.save() };
  }

  private async save(): Promise<void> {
    const state = this.form.shell();
    const snapshot = this.scope.getSnapshot();
    if (this.disposed || !state.available || !state.writable || !state.dirty || state.invalid || state.saving) return;
    const sequence = ++this.saveSequence;
    const before = snapshot.value?.notify ?? DEFAULT_CONFIG.notify;
    const target = this.form.field('notify').text;
    // Start the permission prompt in the click handler, but save independently.
    const permission = prepareSettingsNotification(target === '' ? DEFAULT_CONFIG.notify : target === 'true');
    this.notificationFeedback = undefined;
    if (!await this.form.save() || this.disposed) return;
    const after = this.scope.getSnapshot().value?.notify ?? DEFAULT_CONFIG.notify;
    if (!before && !after) return;
    const result = await permission;
    // A later save or a provider teardown makes this pending confirmation stale.
    if (this.disposed || sequence !== this.saveSequence || (this.scope.getSnapshot().value?.notify ?? DEFAULT_CONFIG.notify) !== after) return;
    this.notificationFeedback = showSettingsNotification(before === after ? 'saved' : after ? 'enabled' : 'disabled', this.getLocale(), result);
    this.store.set(this.projection());
  }

  injectComposer(sessionId: string): ComposerToggleFace {
    return { hooks: { autoContinueComposer: this.composer }, sessionId, setMode: (mode) => void this.setMode(sessionId, mode) };
  }

  private composerProjection(): ComposerToggleState {
    const snapshot = this.scope.getSnapshot();
    const policy = readSessionPolicy();
    return {
      visible: snapshot.status === 'ready' && (snapshot.value?.showComposerToggle ?? DEFAULT_CONFIG.showComposerToggle),
      policy,
      writable: canWriteSettings(snapshot) && policy?.writable === true,
      saving: new Set(this.composerSaving),
      failed: new Set(this.composerFailed),
    };
  }

  private async setMode(sessionId: string, mode: SessionMode): Promise<void> {
    if (this.disposed || !sessionId || this.composerSaving.has(sessionId) || !this.composerProjection().writable) return;
    this.composerSaving.add(sessionId);
    this.composerFailed.delete(sessionId);
    this.composer.set(this.composerProjection());
    try {
      await setSessionMode(sessionId, mode);
    } catch {
      this.composerFailed.add(sessionId);
    } finally {
      this.composerSaving.delete(sessionId);
      if (!this.disposed) this.composer.set(this.composerProjection());
    }
  }

  /** Release this card's subscription to the provider-owned settings form. */
  dispose(): void {
    this.disposed = true;
    this.stopComposer();
    this.form.dispose();
  }
}

/** Props the renderer binds for the auto-continue plugin-configuration card. */
export type AutoContinueSettingsCardProps =
  PropsLocale<'auto-continue'> & InjectFace<AutoContinueSettingsCardFace>;

/** The bundle page supplies no list container, unlike the legacy settings slot. */
export function AutoContinueSettingsPage(props: AutoContinueSettingsCardProps) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      <AutoContinueSettingsCard {...props} />
    </ul>
  );
}

type FieldName = Exclude<keyof AutoContinueSettingsCardState, keyof CardShell | 'enabled' | 'notificationFeedback'>;
const groups = [
  { id: 'general', fields: ['paused', 'showComposerToggle', 'resumeSilentTurns', 'resumeCompletedTurns', 'notify'] },
  { id: 'recovery', fields: ['graceMs', 'cooldownMs', 'maxConsecutive', 'classify', 'retryableErrorPatterns', 'backoffFactor', 'backoffMaxMs'] },
  { id: 'startup', fields: ['scanOnBoot', 'scanLimit', 'freshMs'] },
  { id: 'prompts', fields: ['continueText', 'continueTextMaxTokens', 'continueTextSilent', 'continueTextInterrupted', 'continueTextLoop', 'guardPendingText', 'guardDoneText', 'loopText'] },
  { id: 'safety', fields: ['guardTools', 'loopGuard', 'loopShortChars', 'loopWindowMs', 'loopShortCount', 'loopRepeatText', 'loopToolRepeat'] },
  { id: 'status', fields: ['verbose'] },
] as const satisfies ReadonlyArray<{ id: string; fields: readonly FieldName[] }>;
type Category = typeof groups[number]['id'];
const textDefaults: Partial<Record<FieldName, SettingsCardKey>> = {
  continueText: 'default.continueText', continueTextMaxTokens: 'default.continueTextMaxTokens',
  continueTextSilent: 'default.continueTextSilent', continueTextLoop: 'default.continueTextLoop',
  continueTextInterrupted: 'default.continueTextInterrupted',
  guardPendingText: 'default.guardPendingText', guardDoneText: 'default.guardDoneText', loopText: 'default.loopText',
};

const REPOSITORY_URL = 'https://github.com/HsiangNianian/dsh-auto-continue';

function RepositoryInvite({ t }: { t: (key: SettingsCardKey) => string }) {
  return <p className="dshAcInvite">
    <span className="dshAcInviteStar" aria-hidden="true">★</span>
    <span>{t('repo.star')}</span>
    <a className="dshAcRepoLink" href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer" aria-label={t('repo.aria')}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.4a9.8 9.8 0 0 0-3.1 19.1c.5.1.7-.2.7-.5v-1.9c-2.8.6-3.4-1.2-3.4-1.2-.5-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 0 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-4.9 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.5 9.5 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.8-2.3 4.6-4.6 4.9.4.3.7.9.7 1.8V21c0 .3.2.6.7.5A9.8 9.8 0 0 0 12 2.4Z" /></svg>
      {t('repo.link')}
      <svg className="dshAcExternal" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7M13 3 7 9M11 9v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3" /></svg>
    </a>
  </p>;
}

/** Controls edit the existing staged form; navigation never owns or discards drafts. */
function SettingField({ name, id, state, actions, disabled, t }: {
  name: FieldName; id: string; state: CardFieldState; actions: CardActions; disabled: boolean;
  t: (key: SettingsCardKey) => string;
}) {
  const boolean = typeof DEFAULT_CONFIG[name] === 'boolean';
  const numeric = typeof DEFAULT_CONFIG[name] === 'number';
  const label = t(`field.${name}` as SettingsCardKey);
  const hint = t(`field.${name}Hint` as SettingsCardKey);
  const value = state.text === '' ? DEFAULT_CONFIG[name] : state.text === 'true';
  const placeholderKey = textDefaults[name];
  const placeholder = placeholderKey ? t(placeholderKey) : name === 'retryableErrorPatterns' ? t('field.retryableErrorPatternsPlaceholder') : String(DEFAULT_CONFIG[name]);
  const common = { id, disabled, 'aria-describedby': `${id}-hint`, 'aria-invalid': state.invalid || undefined, value: state.text, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => actions.edit(name, event.target.value) };
  return <div className={`dshAcField${!boolean && !numeric ? ' dshAcFieldText' : ''}`} data-field={name}>
    <div className="dshAcFieldCopy">
      {boolean ? <span className="dshAcLabel">{label}</span> : <label className="dshAcLabel" htmlFor={id}>{label}</label>}
      <p className={state.invalid ? 'dshAcInvalid' : 'dshAcHint'} id={`${id}-hint`}>{state.invalid ? t('chrome.invalidNumber') : hint}</p>
    </div>
    <div className="dshAcFieldControl">
      {state.overridden && <button type="button" className="dshAcReset" disabled={disabled} aria-label={`${t('chrome.reset')}: ${label}`} onClick={() => actions.resetField(name)}>{t('chrome.reset')}</button>}
      {name === 'resumeCompletedTurns' ? <select id={id} className="dshAcMode" aria-label={label} aria-describedby={`${id}-hint`}
        disabled={disabled} value={String(value)} onChange={event => actions.edit(name, event.target.value)}>
        <option value="false">{t('composer.recover')}</option><option value="true">{t('composer.loop')}</option>
      </select> : boolean ? <span className="dshAcSwitchTarget"><NativeSwitch label={label} title={hint} disabled={disabled}
        checked={name === 'paused' ? !value : Boolean(value)} onChange={checked => actions.edit(name, String(name === 'paused' ? !checked : checked))} /></span>
        : numeric ? <input {...common} className="dshAcInput dshAcNumber" type="text" inputMode="numeric" placeholder={placeholder} />
        : <textarea {...common} className="dshAcInput dshAcTextArea" rows={name === 'retryableErrorPatterns' ? 3 : 2} placeholder={placeholder} />}
    </div>
  </div>;
}


/** One field rendered with the host's own settings primitives. */
function NativeSettingField({ name, id, state, actions, disabled, t }: {
  name: FieldName; id: string; state: CardFieldState; actions: CardActions; disabled: boolean;
  t: (key: SettingsCardKey) => string;
}) {
  const boolean = typeof DEFAULT_CONFIG[name] === 'boolean';
  const numeric = typeof DEFAULT_CONFIG[name] === 'number';
  const label = t(`field.${name}` as SettingsCardKey);
  const hint = t(`field.${name}Hint` as SettingsCardKey);
  const value = state.text === '' ? DEFAULT_CONFIG[name] : state.text === 'true';
  const placeholderKey = textDefaults[name];
  const placeholder = placeholderKey ? t(placeholderKey) : name === 'retryableErrorPatterns' ? t('field.retryableErrorPatternsPlaceholder') : String(DEFAULT_CONFIG[name]);
  const reset = state.overridden
    ? <button type="button" className="dshAcNativeReset" disabled={disabled} aria-label={`${t('chrome.reset')}: ${label}`} onClick={() => actions.resetField(name)}>{t('chrome.reset')}</button>
    : null;

  if (name === 'resumeCompletedTurns') {
    const items = [{ value: 'false', label: t('composer.recover') }, { value: 'true', label: t('composer.loop') }];
    return <div className="dshAcNativeField" data-field={name}>
      <div className="dshAcNativeHead"><label className="dshAcNativeLabel" htmlFor={id}>{label}</label>{reset}</div>
      {NativeSegmentedControl
        ? <NativeSegmentedControl id={id} options={items} value={value ? 'true' : 'false'} onChange={next => actions.edit(name, next)} label={label} disabled={disabled} />
        : <select id={id} className="dshAcMode" aria-label={label} disabled={disabled} value={String(value)} onChange={event => actions.edit(name, event.target.value)}>
            <option value="false">{t('composer.recover')}</option><option value="true">{t('composer.loop')}</option>
          </select>}
      <p className="dshAcNativeHint" id={`${id}-hint`}>{hint}</p>
    </div>;
  }

  if (boolean) {
    return <div className="dshAcNativeField" data-field={name}>
      <div className="dshAcNativeToggleRow">
        <label className="dshAcNativeLabel" htmlFor={id}>{label}</label>
        <span className="dshAcNativeActions">
          {reset}
          <NativeSwitch label={label} title={hint} disabled={disabled}
            checked={name === 'paused' ? !value : Boolean(value)}
            onChange={checked => actions.edit(name, String(name === 'paused' ? !checked : checked))} />
        </span>
      </div>
      <p className="dshAcNativeHint" id={`${id}-hint`}>{hint}</p>
    </div>;
  }

  if (numeric) {
    const ValueField = NativeValueField!;
    return <ValueField id={id} label={label} hint={hint} overriddenLabel={t('chrome.overridden')}
      resetLabel={t('chrome.reset')} invalidLabel={t('chrome.invalidNumber')} disabled={disabled}
      numeric {...state} placeholder={placeholder}
      onEdit={(text: string) => actions.edit(name, text)} onReset={() => actions.resetField(name)} />;
  }

  return <div className="dshAcNativeField" data-field={name}>
    <div className="dshAcNativeHead"><label className="dshAcNativeLabel" htmlFor={id}>{label}</label>{reset}</div>
    <textarea id={id} className="dshAcNativeTextarea" rows={name === 'retryableErrorPatterns' ? 3 : 2}
      disabled={disabled} value={state.text} placeholder={placeholder} aria-invalid={state.invalid || undefined}
      aria-describedby={`${id}-hint`} onChange={event => actions.edit(name, event.target.value)} />
    <p className="dshAcNativeHint" id={`${id}-hint`}>{state.invalid ? t('chrome.invalidNumber') : hint}</p>
  </div>;
}

/** 实时面板: 今日统计 + 已暂停会话。浏览器本地状态, 每 5 秒刷新一次。 */
function LivePanels(props: { t: (key: SettingsCardKey) => string }) {
  const { t } = props;
  const [, refresh] = useState(0);
  useEffect(() => {
    // host 状态桥推送时刷新; 5 秒轮询兜底(桥短暂断线时)
    const unsubscribe = subscribeBridge(() => refresh((value) => value + 1));
    const timer = setInterval(() => refresh((value) => value + 1), 5000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, []);
  const stats = readTodayStats();
  const hasStats = stats.sent + stats.skipped + stats.recovered + stats.failed + stats.gaveUp + stats.looped > 0;
  const codes = Object.entries(stats.byCode)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const paused = pausedSessions();
  const attempts = readRecoveryAttempts();
  const sessions = [...new Set(attempts.map(attempt => attempt.sessionId))];
  return (
    <>
      <section className="dshAcPanel">
        <div className="dshAcPanelHead">
          <span className="dshAcPanelTitle">{t('stats.title')}</span>
          {hasStats ? (
            <button
              type="button"
              className="dshAcReset"
              onClick={() => {
                resetTodayStats();
                refresh((value) => value + 1);
              }}
            >
              {t('stats.reset')}
            </button>
          ) : null}
        </div>
        {!hasStats ? (
          <p className="dshAcHint">{t('stats.empty')}</p>
        ) : (
          <>
            <dl className="dshAcStats">
              <div><dt>{t('stats.sent')}</dt><dd>{stats.sent}</dd></div>
              <div><dt>{t('stats.recovered')}</dt><dd>{stats.recovered}</dd></div>
              <div><dt>{t('stats.failed')}</dt><dd>{stats.failed}</dd></div>
              <div><dt>{t('stats.skipped')}</dt><dd>{stats.skipped}</dd></div>
              <div><dt>{t('stats.gaveUp')}</dt><dd>{stats.gaveUp}</dd></div>
              <div><dt>{t('stats.looped')}</dt><dd>{stats.looped}</dd></div>
            </dl>
            {codes.length > 0 ? (
              <div className="dshAcCodes">
                <span className="dshAcHint">{t('stats.byCode')}:</span>
                {codes.map(([code, count]) => (
                  <span key={code} className="dshAcCode">
                    {code} ×{count}
                  </span>
                ))}
              </div>
            ) : null}
          </>
        )}
      </section>
      <section className="dshAcPanel">
        <div className="dshAcPanelHead">
          <span className="dshAcPanelTitle">{t('recovery.title')}</span>
        </div>
        <p className="dshAcHint">{t('recovery.hint')}</p>
        {sessions.length === 0 ? <p className="dshAcHint">{t('recovery.empty')}</p> : (
          <ul className="dshAcPauseList">
            {sessions.map(sessionId => {
              const recent = attempts.filter(attempt => attempt.sessionId === sessionId);
              const latest = recent[0]!;
              return (
                <li key={sessionId}>
                  <div className="dshAcRecovery">
                    <span className="dshAcPauseId">{sessionId}</span>
                    <span>{t('recovery.count')}: {recent.length} · {t('recovery.consecutive')}: {latest.consecutive}</span>
                    <span>{t('recovery.latest')}: {t(`recovery.reason.${latest.reason}`)}</span>
                    <time className="dshAcHint" dateTime={new Date(latest.at).toISOString()}>{new Date(latest.at).toLocaleString()}</time>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="dshAcPanel">
        <div className="dshAcPanelHead">
          <span className="dshAcPanelTitle">{t('pause.title')}</span>
          {paused.length > 0 ? (
            <button
              type="button"
              className="dshAcReset"
              onClick={() => {
                for (const item of paused) unpauseSession(item.sessionId);
                refresh((value) => value + 1);
              }}
            >
              {t('pause.clearAll')}
            </button>
          ) : null}
        </div>
        {paused.length === 0 ? (
          <p className="dshAcHint">{t('pause.none')}</p>
        ) : (
          <ul className="dshAcPauseList">
            {paused.map((item) => (
              <li key={item.sessionId}>
                <span className="dshAcPauseId">{item.sessionId.slice(0, 8)}…</span>
                <span className="dshAcHint">
                  {Math.max(1, Math.ceil((item.until - Date.now()) / 60000))} {t('pause.minutes')}
                </span>
                <button
                  type="button"
                  className="dshAcReset"
                  onClick={() => {
                    unpauseSession(item.sessionId);
                    refresh((value) => value + 1);
                  }}
                >
                  {t('pause.unpause')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/** Native category layout; the plugin manager above already owns the title, version and status. */
export function AutoContinueSettingsCard(props: AutoContinueSettingsCardProps) {
  const { t } = props;
  const state = props.useAutoContinueSettingsCard(snapshot => snapshot);
  const [active, setActive] = useState<Category>('general');
  const prefix = useId();
  const group = groups.find(item => item.id === active)!;
  const native = hasNativeSettings;
  if (!state.available) return null;
  return <li className="dshAcCard">
    <RepositoryInvite t={t} />
    {!native && !state.writable && <p className="dshAcReadOnly" role="status">{t('chrome.readOnly')}</p>}
    <div className="dshAcLayout">
      <div className="dshAcNav" role="tablist" aria-label={t('chrome.categories')}>
        {groups.map((item, index) => {
          const invalid = item.fields.some(name => state[name].invalid);
          const title = t(`category.${item.id}.title`);
          return <button type="button" role="tab" key={item.id} id={`${prefix}-tab-${item.id}`} data-category={item.id}
            aria-controls={`${prefix}-panel-${item.id}`} aria-selected={active === item.id} tabIndex={active === item.id ? 0 : -1}
            aria-label={invalid ? `${title}: ${t('chrome.invalidNumber')}` : title}
            onClick={() => setActive(item.id)} onKeyDown={event => {
              const offset = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 0;
              if (!offset && event.key !== 'Home' && event.key !== 'End') return;
              event.preventDefault();
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? groups.length - 1 : (index + offset + groups.length) % groups.length;
              setActive(groups[next]!.id);
              const button = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next];
              button?.focus();
              button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }}>{title}{invalid && <span className="dshAcInvalidMark" aria-hidden="true">!</span>}</button>;
        })}
      </div>
      <section className="dshAcCategory" role="tabpanel" id={`${prefix}-panel-${active}`} aria-labelledby={`${prefix}-tab-${active}`}>
        <div className="dshAcCategoryHeading"><h3>{t(`category.${active}.title`)}</h3><p>{t(`category.${active}.description`)}</p></div>
        {native ? (
          <NativeSettingsForm labels={{
            save: t('chrome.save'), saving: t('chrome.saving'), saveFailed: t('chrome.saveFailed'),
            readOnly: t('chrome.readOnly'), unavailable: t('chrome.unavailable'),
          }} state={state} onSave={props.save} onDiscard={props.discard}>
            <div className="dshAcNativeFields">
              {group.fields.map(name => <NativeSettingField key={name} name={name} id={`${prefix}-${name}`} state={state[name]} actions={props} disabled={!state.writable} t={t} />)}
              {active === 'status' && <LivePanels t={t} />}
            </div>
          </NativeSettingsForm>
        ) : (
          <>
            {group.fields.map(name => <SettingField key={name} name={name} id={`${prefix}-${name}`} state={state[name]} actions={props} disabled={!state.writable} t={t} />)}
            {active === 'status' && <LivePanels t={t} />}
            <footer className="dshAcFooter" data-dirty={state.dirty}>
              <p className={state.failed || state.invalid ? 'dshAcInvalid' : 'dshAcHint'} role="status">{t(state.failed ? 'chrome.saveFailed' : state.invalid ? 'chrome.invalidNumber' : state.saving ? 'chrome.saving' : state.dirty ? 'chrome.unsaved' : state.notificationFeedback ?? 'chrome.saved')}</p>
              <div><button type="button" className="dshAcDiscard" disabled={!state.dirty || state.saving} onClick={props.discard}>{t('chrome.discard')}</button><button type="button" className="dshAcSave" disabled={!state.dirty || state.invalid || state.saving || !state.writable} onClick={props.save}>{t(state.saving ? 'chrome.saving' : 'chrome.save')}</button></div>
            </footer>
          </>
        )}
      </section>
    </div>
  </li>;
}
