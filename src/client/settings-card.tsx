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
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type AutoContinueSettings } from './engine.ts';
import { createSnapshotStore, type SettingsScope, type SnapshotStore } from './dsh-store-compat.ts';
import {
  pausedSessions,
  readTodayStats,
  resetTodayStats,
  subscribeBridge,
  unpauseSession,
} from './bridge.ts';
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
    return { hooks: { autoContinueSettingsCard: this.store }, ...this.form.actions() };
  }
}

/** Props the renderer binds for the auto-continue plugin-configuration card. */
export type AutoContinueSettingsCardProps =
  PropsRuntime<'settings.plugin.item'> & PropsLocale<'auto-continue'> & InjectFace<AutoContinueSettingsCardFace>;

const REPOSITORY_URL = 'https://github.com/HsiangNianian/dsh-auto-continue';
const REPOSITORY_SLUG = 'HsiangNianian/dsh-auto-continue';

function RelayMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path className="dshAcRelayArc" d="M9 30c4-12 10-18 19-18 5 0 9 2 12 6" />
      <path className="dshAcRelayArc dshAcRelayArcEcho" d="M8 35c6 3 12 3 17 0 5-3 8-8 15-9" />
      <circle className="dshAcRelayNode dshAcRelayNodeStart" cx="9" cy="30" r="3" />
      <circle className="dshAcRelayNode dshAcRelayNodeEnd" cx="40" cy="18" r="3" />
      <circle className="dshAcRelayPulse" cx="28" cy="12" r="2.5" />
    </svg>
  );
}

function ChevronMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="m3.5 6 4.5 4 4.5-4" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2.4a9.8 9.8 0 0 0-3.1 19.1c.5.1.7-.2.7-.5v-1.9c-2.8.6-3.4-1.2-3.4-1.2-.5-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 0 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-4.9 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.5 9.5 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.8-2.3 4.6-4.6 4.9.4.3.7.9.7 1.8V21c0 .3.2.6.7.5A9.8 9.8 0 0 0 12 2.4Z" />
    </svg>
  );
}

function ExternalMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M6 3h7v7M13 3 7 9" />
      <path d="M11 9v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3" />
    </svg>
  );
}

function RelayJourney(props: { t: (key: SettingsCardKey) => string }) {
  return (
    <span className="dshAcJourney">
      <span className="dshAcJourneyStep dshAcJourneyInterrupted">
        <span className="dshAcJourneyDot" aria-hidden="true" />
        {props.t('flow.interrupted')}
      </span>
      <span className="dshAcJourneyLine" aria-hidden="true" />
      <span className="dshAcJourneyStep dshAcJourneyGrace">
        <span className="dshAcJourneyDot" aria-hidden="true" />
        {props.t('flow.grace')}
      </span>
      <span className="dshAcJourneyLine" aria-hidden="true" />
      <span className="dshAcJourneyStep dshAcJourneyContinue">
        <span className="dshAcJourneyDot" aria-hidden="true" />
        {props.t('flow.continue')}
      </span>
    </span>
  );
}

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
      <div className="dshAcHeaderFrame">
        <button
          type="button"
          className="dshAcHeader"
          aria-expanded={open}
          aria-label={`${props.t(open ? 'chrome.collapse' : 'chrome.expand')}: ${title}`}
          title={props.t(props.descriptionKey)}
          onClick={() => setOpen(!open)}
        >
          <span className="dshAcRelayMark"><RelayMark /></span>
          <span className="dshAcHeadText">
            <span className="dshAcEyebrow">{props.t('card.eyebrow')}</span>
            <span className="dshAcName">{title}</span>
            <span className="dshAcDescription">{props.t(props.descriptionKey)}</span>
            <RelayJourney t={props.t} />
          </span>
          {state.dirty ? (
            <span className="dshAcPending" title={props.t('chrome.unsaved')}>
              {props.t('chrome.unsaved')}
            </span>
          ) : null}
          <span className={open ? 'dshAcChevron dshAcChevronOpen' : 'dshAcChevron'}>
            <ChevronMark />
          </span>
        </button>
        <a
          className="dshAcGithub"
          href={REPOSITORY_URL}
          target="_blank"
          rel="noreferrer"
          aria-label={props.t('repo.aria')}
        >
          <span className="dshAcGithubIcon"><GitHubMark /></span>
          <span className="dshAcGithubText">
            <span className="dshAcGithubAction">{props.t('repo.star')}</span>
            <span className="dshAcGithubSlug">{REPOSITORY_SLUG}</span>
          </span>
          <span className="dshAcExternal"><ExternalMark /></span>
        </a>
      </div>
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
  wide?: boolean;
  text: string;
  overridden: boolean;
  invalid: boolean;
  disabled: boolean;
  t: (key: SettingsCardKey) => string;
  onEdit: (text: string) => void;
  onReset: () => void;
}

/** A staged value field; `numeric` only hints the keypad, which drafts a field accepts is decided by its spec. */
function ValueField(props: FieldProps & { numeric?: boolean; multiline?: boolean; placeholder?: string }) {
  const className = props.invalid ? 'dshAcInput dshAcInputInvalid' : 'dshAcInput';
  return (
    <div className={props.wide === true ? 'dshAcField dshAcFieldWide' : 'dshAcField'}>
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
      {props.multiline === true ? (
        <textarea
          id={props.id}
          className={`${className} dshAcTextArea`}
          aria-invalid={props.invalid || undefined}
          value={props.text}
          placeholder={props.placeholder ?? ''}
          disabled={props.disabled}
          rows={4}
          onChange={(event) => props.onEdit(event.target.value)}
        />
      ) : (
        <input
          id={props.id}
          className={className}
          type="text"
          inputMode={props.numeric === true ? 'numeric' : undefined}
          aria-invalid={props.invalid || undefined}
          value={props.text}
          placeholder={props.placeholder ?? ''}
          disabled={props.disabled}
          onChange={(event) => props.onEdit(event.target.value)}
        />
      )}
      <p className={props.invalid ? 'dshAcInvalid' : 'dshAcHint'}>
        {props.invalid ? props.t('chrome.invalidNumber') : props.hint}
      </p>
    </div>
  );
}

/** A staged boolean field: inherit / on / off. */
function BooleanField(props: FieldProps) {
  return (
    <div className={props.wide === true ? 'dshAcField dshAcFieldWide' : 'dshAcField'}>
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

type SettingsSectionTone = 'handoff' | 'safety' | 'recovery' | 'loop' | 'live';

/** A real behavior group, not a decorative divider: each section maps to one phase of the relay. */
function SettingsSection(props: {
  t: (key: SettingsCardKey) => string;
  titleKey: SettingsCardKey;
  descriptionKey: SettingsCardKey;
  tone: SettingsSectionTone;
  children: ReactNode;
}) {
  return (
    <section className={`dshAcFormSection dshAcFormSection-${props.tone}`}>
      <header className="dshAcSectionHead">
        <span className="dshAcSectionSignal" aria-hidden="true" />
        <span className="dshAcSectionCopy">
          <span className="dshAcSectionTitle">{props.t(props.titleKey)}</span>
          <span className="dshAcSectionDescription">{props.t(props.descriptionKey)}</span>
        </span>
      </header>
      <div className="dshAcSectionGrid">{props.children}</div>
    </section>
  );
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
      <div className="dshAcFormCanvas">
        <SettingsSection
          t={t}
          titleKey="section.handoff.title"
          descriptionKey="section.handoff.description"
          tone="handoff"
        >
          <BooleanField
            wide
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
            placeholder={t('default.continueText')}
            onReset={() => props.resetField('continueText')}
          />
          <ValueField
            id="auto-continue-continue-text-max-tokens"
            label={t('field.continueTextMaxTokens')}
            hint={t('field.continueTextMaxTokensHint')}
            {...shared}
            {...state.continueTextMaxTokens}
            onEdit={(text) => props.edit('continueTextMaxTokens', text)}
            placeholder={t('default.continueTextMaxTokens')}
            onReset={() => props.resetField('continueTextMaxTokens')}
          />
        </SettingsSection>

        <SettingsSection
          t={t}
          titleKey="section.safety.title"
          descriptionKey="section.safety.description"
          tone="safety"
        >
          <BooleanField
            wide
            id="auto-continue-guard-tools"
            label={t('field.guardTools')}
            hint={t('field.guardToolsHint')}
            {...shared}
            {...state.guardTools}
            onEdit={(text) => props.edit('guardTools', text)}
            onReset={() => props.resetField('guardTools')}
          />
          <ValueField
            wide
            id="auto-continue-guard-pending-text"
            label={t('field.guardPendingText')}
            hint={t('field.guardPendingTextHint')}
            {...shared}
            {...state.guardPendingText}
            onEdit={(text) => props.edit('guardPendingText', text)}
            placeholder={t('default.guardPendingText')}
            onReset={() => props.resetField('guardPendingText')}
          />
          <ValueField
            wide
            id="auto-continue-guard-done-text"
            label={t('field.guardDoneText')}
            hint={t('field.guardDoneTextHint')}
            {...shared}
            {...state.guardDoneText}
            onEdit={(text) => props.edit('guardDoneText', text)}
            placeholder={t('default.guardDoneText')}
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
        </SettingsSection>

        <SettingsSection
          t={t}
          titleKey="section.recovery.title"
          descriptionKey="section.recovery.description"
          tone="recovery"
        >
          <BooleanField
            id="auto-continue-scan-on-boot"
            label={t('field.scanOnBoot')}
            hint={t('field.scanOnBootHint')}
            {...shared}
            {...state.scanOnBoot}
            onEdit={(text) => props.edit('scanOnBoot', text)}
            onReset={() => props.resetField('scanOnBoot')}
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
            wide
            id="auto-continue-retryable-error-patterns"
            label={t('field.retryableErrorPatterns')}
            hint={t('field.retryableErrorPatternsHint')}
            multiline
            {...shared}
            {...state.retryableErrorPatterns}
            onEdit={(text) => props.edit('retryableErrorPatterns', text)}
            placeholder={t('field.retryableErrorPatternsPlaceholder')}
            onReset={() => props.resetField('retryableErrorPatterns')}
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
            id="auto-continue-verbose"
            label={t('field.verbose')}
            hint={t('field.verboseHint')}
            {...shared}
            {...state.verbose}
            onEdit={(text) => props.edit('verbose', text)}
            onReset={() => props.resetField('verbose')}
          />
        </SettingsSection>

        <SettingsSection
          t={t}
          titleKey="section.loop.title"
          descriptionKey="section.loop.description"
          tone="loop"
        >
          <BooleanField
            wide
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
            wide
            id="auto-continue-loop-text"
            label={t('field.loopText')}
            hint={t('field.loopTextHint')}
            {...shared}
            {...state.loopText}
            onEdit={(text) => props.edit('loopText', text)}
            placeholder={t('default.loopText')}
            onReset={() => props.resetField('loopText')}
          />
        </SettingsSection>

        <SettingsSection
          t={t}
          titleKey="section.live.title"
          descriptionKey="section.live.description"
          tone="live"
        >
          <LivePanels t={t} />
        </SettingsSection>
      </div>
    </SettingsCard>
  );
}
