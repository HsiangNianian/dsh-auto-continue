/**
 * The auto-continue settings card: edits the `auto-continue` namespace fields
 * from the plugin-configuration section (the `settings.plugin.item` seat).
 *
 * Self-contained card chrome (disclosure header, staged fields, save/discard
 * footer) following the plugin-card store pattern of the DSH plugin
 * configuration section; styles live in `styles.ts` and use the DSH design
 * tokens so the card follows the active theme.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { createSnapshotStore, type SettingsScope, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import {
  DEFAULT_CONFIG,
  pausedSessions,
  readTodayStats,
  resetTodayStats,
  unpauseSession,
  type AutoContinueSettings,
} from './engine.ts';
import type { SettingsCardKey } from './locales.ts';
import {
  booleanField,
  CardForm,
  numberField,
  textField,
  type CardActions,
  type CardFieldState,
  type CardShell,
} from './settings-form.ts';
import { injectStyles } from './styles.ts';

// Styles must land during factory materialization so the module system's
// style bookkeeping (HMR) owns them.
injectStyles();

/** What the auto-continue card renders. */
export interface AutoContinueSettingsCardState extends CardShell {
  paused: CardFieldState;
  continueText: CardFieldState;
  continueTextMaxTokens: CardFieldState;
  guardTools: CardFieldState;
  guardPendingText: CardFieldState;
  guardDoneText: CardFieldState;
  graceMs: CardFieldState;
  cooldownMs: CardFieldState;
  maxConsecutive: CardFieldState;
  scanOnBoot: CardFieldState;
  scanLimit: CardFieldState;
  freshMs: CardFieldState;
  reconnectScanDelayMs: CardFieldState;
  reconnectBackoffMs: CardFieldState;
  verbose: CardFieldState;
  classify: CardFieldState;
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

  /**
   * @param scope - the bound settings scope for the `auto-continue` namespace.
   */
  constructor(scope: SettingsScope<AutoContinueSettings>) {
    this.form = new CardForm(scope, [
      booleanField('paused'),
      textField('continueText'),
      textField('continueTextMaxTokens'),
      booleanField('guardTools'),
      textField('guardPendingText'),
      textField('guardDoneText'),
      numberField('graceMs', 0),
      numberField('cooldownMs', 0),
      numberField('maxConsecutive', 1),
      booleanField('scanOnBoot'),
      numberField('scanLimit', 1),
      numberField('freshMs', 0),
      numberField('reconnectScanDelayMs', 0),
      numberField('reconnectBackoffMs', 0),
      booleanField('verbose'),
      booleanField('classify'),
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
  }

  private projection(): AutoContinueSettingsCardState {
    return {
      ...this.form.shell(),
      paused: this.form.field('paused'),
      continueText: this.form.field('continueText'),
      continueTextMaxTokens: this.form.field('continueTextMaxTokens'),
      guardTools: this.form.field('guardTools'),
      guardPendingText: this.form.field('guardPendingText'),
      guardDoneText: this.form.field('guardDoneText'),
      graceMs: this.form.field('graceMs'),
      cooldownMs: this.form.field('cooldownMs'),
      maxConsecutive: this.form.field('maxConsecutive'),
      scanOnBoot: this.form.field('scanOnBoot'),
      scanLimit: this.form.field('scanLimit'),
      freshMs: this.form.field('freshMs'),
      reconnectScanDelayMs: this.form.field('reconnectScanDelayMs'),
      reconnectBackoffMs: this.form.field('reconnectBackoffMs'),
      verbose: this.form.field('verbose'),
      classify: this.form.field('classify'),
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
    return { hooks: { autoContinueSettingsCard: this.store }, ...this.form.actions() };
  }
}

/** Props the renderer binds for the auto-continue plugin-configuration card. */
export type AutoContinueSettingsCardProps =
  PropsRuntime<'settings.plugin.item'> & PropsLocale<'auto-continue'> & InjectFace<AutoContinueSettingsCardFace>;

/** Card chrome: a disclosure header naming the plugin and what its settings govern, the controls, and the save that writes them. */
function SettingsCard(props: {
  t: (key: SettingsCardKey) => string;
  titleKey: SettingsCardKey;
  descriptionKey: SettingsCardKey;
  state: CardShell;
  onSave: () => void;
  onDiscard: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { state } = props;
  if (!state.available) return null;
  const title = props.t(props.titleKey);
  const blocked = !state.dirty || state.invalid || state.saving;
  return (
    <li className={open ? 'dshAcCard dshAcCardOpen' : 'dshAcCard'}>
      <button
        type="button"
        className="dshAcHeader"
        aria-expanded={open}
        aria-label={`${props.t(open ? 'chrome.collapse' : 'chrome.expand')}: ${title}`}
        title={props.t(props.descriptionKey)}
        onClick={() => setOpen(!open)}
      >
        <span className="dshAcHeadText">
          <span className="dshAcName">{title}</span>
          <span className="dshAcDescription">{props.t(props.descriptionKey)}</span>
        </span>
        {state.dirty ? (
          <span className="dshAcPending" title={props.t('chrome.unsaved')}>
            {props.t('chrome.unsaved')}
          </span>
        ) : null}
        <span className={open ? 'dshAcChevron dshAcChevronOpen' : 'dshAcChevron'}>▾</span>
      </button>
      {open ? (
        <div className="dshAcBody">
          {!state.writable ? (
            <p className="dshAcReadOnly" role="status">{props.t('chrome.readOnly')}</p>
          ) : null}
          {props.children}
          <div className="dshAcFooter">
            {state.failed ? (
              <p className="dshAcFailed" role="status">{props.t('chrome.saveFailed')}</p>
            ) : null}
            <button
              type="button"
              className="dshAcDiscard"
              disabled={!state.dirty || state.saving}
              onClick={props.onDiscard}
            >
              {props.t('chrome.discard')}
            </button>
            <button type="button" className="dshAcSave" disabled={blocked} onClick={props.onSave}>
              {props.t(!state.saving ? 'chrome.save' : 'chrome.saving')}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/** Props every field control needs regardless of its value type. */
interface FieldProps {
  id: string;
  label: string;
  hint: string;
  text: string;
  overridden: boolean;
  invalid: boolean;
  disabled: boolean;
  t: (key: SettingsCardKey) => string;
  onEdit: (text: string) => void;
  onReset: () => void;
}

/** A staged value field; `numeric` only hints the keypad, which drafts a field accepts is decided by its spec. */
function ValueField(props: FieldProps & { numeric?: boolean; placeholder?: string }) {
  return (
    <div className="dshAcField">
      <div className="dshAcHead">
        <label className="dshAcLabel" htmlFor={props.id}>{props.label}</label>
        {props.overridden ? (
          <span className="dshAcBadges">
            <span className="dshAcBadge">{props.t('chrome.overridden')}</span>
            <button type="button" className="dshAcReset" disabled={props.disabled} onClick={props.onReset}>
              {props.t('chrome.reset')}
            </button>
          </span>
        ) : null}
      </div>
      <input
        id={props.id}
        className={props.invalid ? 'dshAcInput dshAcInputInvalid' : 'dshAcInput'}
        type="text"
        inputMode={props.numeric === true ? 'numeric' : undefined}
        aria-invalid={props.invalid || undefined}
        value={props.text}
        placeholder={props.placeholder ?? ''}
        disabled={props.disabled}
        onChange={(event) => props.onEdit(event.target.value)}
      />
      <p className={props.invalid ? 'dshAcInvalid' : 'dshAcHint'}>
        {props.invalid ? props.t('chrome.invalidNumber') : props.hint}
      </p>
    </div>
  );
}

/** A staged boolean field: inherit / on / off. */
function BooleanField(props: FieldProps) {
  return (
    <div className="dshAcField">
      <div className="dshAcHead">
        <label className="dshAcLabel" htmlFor={props.id}>{props.label}</label>
        {props.overridden ? (
          <span className="dshAcBadges">
            <span className="dshAcBadge">{props.t('chrome.overridden')}</span>
            <button type="button" className="dshAcReset" disabled={props.disabled} onClick={props.onReset}>
              {props.t('chrome.reset')}
            </button>
          </span>
        ) : null}
      </div>
      <select
        id={props.id}
        className="dshAcSelect"
        value={props.text}
        disabled={props.disabled}
        onChange={(event) => props.onEdit(event.target.value)}
      >
        <option value="">{props.t('chrome.inherit')}</option>
        <option value="true">{props.t('chrome.on')}</option>
        <option value="false">{props.t('chrome.off')}</option>
      </select>
      <p className="dshAcHint">{props.hint}</p>
    </div>
  );
}

/** 实时面板: 今日统计 + 已暂停会话。浏览器本地状态, 每 5 秒刷新一次。 */
function LivePanels(props: { t: (key: SettingsCardKey) => string }) {
  const { t } = props;
  const [, refresh] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => refresh((value) => value + 1), 5000);
    return () => clearInterval(timer);
  }, []);
  const stats = readTodayStats();
  const hasStats = stats.sent + stats.skipped + stats.recovered + stats.failed + stats.gaveUp + stats.looped > 0;
  const codes = Object.entries(stats.byCode)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const paused = pausedSessions();
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

/**
 * Render the auto-continue card.
 * @param props - locale copy, the card snapshot, and its form actions.
 * @returns the card.
 */
export function AutoContinueSettingsCard(props: AutoContinueSettingsCardProps) {
  const { t } = props;
  const state = props.useAutoContinueSettingsCard((snapshot) => snapshot);
  const disabled = !state.writable;
  const shared = { t, disabled };
  return (
    <SettingsCard
      t={t}
      titleKey="card.title"
      descriptionKey="card.description"
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
    >
      <BooleanField
        id="auto-continue-paused"
        label={t('field.paused')}
        hint={t('field.pausedHint')}
        {...shared}
        {...state.paused}
        onEdit={(text) => props.edit('paused', text)}
        onReset={() => props.resetField('paused')}
      />
      <ValueField
        id="auto-continue-continue-text"
        label={t('field.continueText')}
        hint={t('field.continueTextHint')}
        {...shared}
        {...state.continueText}
        onEdit={(text) => props.edit('continueText', text)}
        placeholder={DEFAULT_CONFIG.continueText}
        onReset={() => props.resetField('continueText')}
      />
      <ValueField
        id="auto-continue-continue-text-max-tokens"
        label={t('field.continueTextMaxTokens')}
        hint={t('field.continueTextMaxTokensHint')}
        {...shared}
        {...state.continueTextMaxTokens}
        onEdit={(text) => props.edit('continueTextMaxTokens', text)}
        placeholder={DEFAULT_CONFIG.continueTextMaxTokens}
        onReset={() => props.resetField('continueTextMaxTokens')}
      />
      <BooleanField
        id="auto-continue-guard-tools"
        label={t('field.guardTools')}
        hint={t('field.guardToolsHint')}
        {...shared}
        {...state.guardTools}
        onEdit={(text) => props.edit('guardTools', text)}
        onReset={() => props.resetField('guardTools')}
      />
      <ValueField
        id="auto-continue-guard-pending-text"
        label={t('field.guardPendingText')}
        hint={t('field.guardPendingTextHint')}
        {...shared}
        {...state.guardPendingText}
        onEdit={(text) => props.edit('guardPendingText', text)}
        placeholder={DEFAULT_CONFIG.guardPendingText}
        onReset={() => props.resetField('guardPendingText')}
      />
      <ValueField
        id="auto-continue-guard-done-text"
        label={t('field.guardDoneText')}
        hint={t('field.guardDoneTextHint')}
        {...shared}
        {...state.guardDoneText}
        onEdit={(text) => props.edit('guardDoneText', text)}
        placeholder={DEFAULT_CONFIG.guardDoneText}
        onReset={() => props.resetField('guardDoneText')}
      />
      <ValueField
        id="auto-continue-grace-ms"
        label={t('field.graceMs')}
        hint={t('field.graceMsHint')}
        numeric
        {...shared}
        {...state.graceMs}
        onEdit={(text) => props.edit('graceMs', text)}
        onReset={() => props.resetField('graceMs')}
      />
      <ValueField
        id="auto-continue-cooldown-ms"
        label={t('field.cooldownMs')}
        hint={t('field.cooldownMsHint')}
        numeric
        {...shared}
        {...state.cooldownMs}
        onEdit={(text) => props.edit('cooldownMs', text)}
        onReset={() => props.resetField('cooldownMs')}
      />
      <ValueField
        id="auto-continue-max-consecutive"
        label={t('field.maxConsecutive')}
        hint={t('field.maxConsecutiveHint')}
        numeric
        {...shared}
        {...state.maxConsecutive}
        onEdit={(text) => props.edit('maxConsecutive', text)}
        onReset={() => props.resetField('maxConsecutive')}
      />
      <BooleanField
        id="auto-continue-scan-on-boot"
        label={t('field.scanOnBoot')}
        hint={t('field.scanOnBootHint')}
        {...shared}
        {...state.scanOnBoot}
        onEdit={(text) => props.edit('scanOnBoot', text)}
        onReset={() => props.resetField('scanOnBoot')}
      />
      <ValueField
        id="auto-continue-scan-limit"
        label={t('field.scanLimit')}
        hint={t('field.scanLimitHint')}
        numeric
        {...shared}
        {...state.scanLimit}
        onEdit={(text) => props.edit('scanLimit', text)}
        onReset={() => props.resetField('scanLimit')}
      />
      <ValueField
        id="auto-continue-fresh-ms"
        label={t('field.freshMs')}
        hint={t('field.freshMsHint')}
        numeric
        {...shared}
        {...state.freshMs}
        onEdit={(text) => props.edit('freshMs', text)}
        onReset={() => props.resetField('freshMs')}
      />
      <ValueField
        id="auto-continue-reconnect-scan-delay"
        label={t('field.reconnectScanDelayMs')}
        hint={t('field.reconnectScanDelayMsHint')}
        numeric
        {...shared}
        {...state.reconnectScanDelayMs}
        onEdit={(text) => props.edit('reconnectScanDelayMs', text)}
        onReset={() => props.resetField('reconnectScanDelayMs')}
      />
      <ValueField
        id="auto-continue-reconnect-backoff"
        label={t('field.reconnectBackoffMs')}
        hint={t('field.reconnectBackoffMsHint')}
        numeric
        {...shared}
        {...state.reconnectBackoffMs}
        onEdit={(text) => props.edit('reconnectBackoffMs', text)}
        onReset={() => props.resetField('reconnectBackoffMs')}
      />
      <BooleanField
        id="auto-continue-verbose"
        label={t('field.verbose')}
        hint={t('field.verboseHint')}
        {...shared}
        {...state.verbose}
        onEdit={(text) => props.edit('verbose', text)}
        onReset={() => props.resetField('verbose')}
      />
      <BooleanField
        id="auto-continue-classify"
        label={t('field.classify')}
        hint={t('field.classifyHint')}
        {...shared}
        {...state.classify}
        onEdit={(text) => props.edit('classify', text)}
        onReset={() => props.resetField('classify')}
      />
      <ValueField
        id="auto-continue-backoff-factor"
        label={t('field.backoffFactor')}
        hint={t('field.backoffFactorHint')}
        numeric
        {...shared}
        {...state.backoffFactor}
        onEdit={(text) => props.edit('backoffFactor', text)}
        onReset={() => props.resetField('backoffFactor')}
      />
      <ValueField
        id="auto-continue-backoff-max"
        label={t('field.backoffMaxMs')}
        hint={t('field.backoffMaxMsHint')}
        numeric
        {...shared}
        {...state.backoffMaxMs}
        onEdit={(text) => props.edit('backoffMaxMs', text)}
        onReset={() => props.resetField('backoffMaxMs')}
      />
      <BooleanField
        id="auto-continue-notify"
        label={t('field.notify')}
        hint={t('field.notifyHint')}
        {...shared}
        {...state.notify}
        onEdit={(text) => props.edit('notify', text)}
        onReset={() => props.resetField('notify')}
      />
      <BooleanField
        id="auto-continue-loop-guard"
        label={t('field.loopGuard')}
        hint={t('field.loopGuardHint')}
        {...shared}
        {...state.loopGuard}
        onEdit={(text) => props.edit('loopGuard', text)}
        onReset={() => props.resetField('loopGuard')}
      />
      <ValueField
        id="auto-continue-loop-short-chars"
        label={t('field.loopShortChars')}
        hint={t('field.loopShortCharsHint')}
        numeric
        {...shared}
        {...state.loopShortChars}
        onEdit={(text) => props.edit('loopShortChars', text)}
        onReset={() => props.resetField('loopShortChars')}
      />
      <ValueField
        id="auto-continue-loop-window-ms"
        label={t('field.loopWindowMs')}
        hint={t('field.loopWindowMsHint')}
        numeric
        {...shared}
        {...state.loopWindowMs}
        onEdit={(text) => props.edit('loopWindowMs', text)}
        onReset={() => props.resetField('loopWindowMs')}
      />
      <ValueField
        id="auto-continue-loop-short-count"
        label={t('field.loopShortCount')}
        hint={t('field.loopShortCountHint')}
        numeric
        {...shared}
        {...state.loopShortCount}
        onEdit={(text) => props.edit('loopShortCount', text)}
        onReset={() => props.resetField('loopShortCount')}
      />
      <ValueField
        id="auto-continue-loop-tool-repeat"
        label={t('field.loopToolRepeat')}
        hint={t('field.loopToolRepeatHint')}
        numeric
        {...shared}
        {...state.loopToolRepeat}
        onEdit={(text) => props.edit('loopToolRepeat', text)}
        onReset={() => props.resetField('loopToolRepeat')}
      />
      <ValueField
        id="auto-continue-loop-repeat-text"
        label={t('field.loopRepeatText')}
        hint={t('field.loopRepeatTextHint')}
        numeric
        {...shared}
        {...state.loopRepeatText}
        onEdit={(text) => props.edit('loopRepeatText', text)}
        onReset={() => props.resetField('loopRepeatText')}
      />
      <ValueField
        id="auto-continue-loop-text"
        label={t('field.loopText')}
        hint={t('field.loopTextHint')}
        {...shared}
        {...state.loopText}
        onEdit={(text) => props.edit('loopText', text)}
        placeholder={DEFAULT_CONFIG.loopText}
        onReset={() => props.resetField('loopText')}
      />
      <LivePanels t={t} />
    </SettingsCard>
  );
}
