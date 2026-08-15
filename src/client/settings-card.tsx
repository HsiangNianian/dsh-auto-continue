/**
 * The auto-continue settings card: edits the `auto-continue` namespace fields
 * from the plugin-configuration section (the `settings.plugin.item` seat).
 *
 * Self-contained card chrome (disclosure header, staged fields, save/discard
 * footer) following the plugin-card store pattern of the DSH plugin
 * configuration section; styles live in `styles.ts` and use the DSH design
 * tokens so the card follows the active theme.
 */
import { useState, type ReactNode } from 'react';
import { createSnapshotStore, type SettingsScope, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { AutoContinueSettings } from './engine.ts';
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
  continueText: CardFieldState;
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
      textField('continueText'),
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
    ]);
    this.store = this.form.bind(() => this.projection(), createSnapshotStore);
  }

  private projection(): AutoContinueSettingsCardState {
    return {
      ...this.form.shell(),
      continueText: this.form.field('continueText'),
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
      <ValueField
        id="auto-continue-continue-text"
        label={t('field.continueText')}
        hint={t('field.continueTextHint')}
        {...shared}
        {...state.continueText}
        onEdit={(text) => props.edit('continueText', text)}
        onReset={() => props.resetField('continueText')}
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
    </SettingsCard>
  );
}
