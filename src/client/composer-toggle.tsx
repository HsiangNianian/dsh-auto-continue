import { useEffect, useState } from 'react';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { SnapshotStore } from './dsh-store-compat.ts';
import { sessionMode, type SessionMode, type SessionPolicy } from '../shared/core.ts';
import { ModeMenu, type ModeMenuOption } from './mode-menu.tsx';
import { AutoContinueIcon } from './auto-continue-icon.tsx';
import { NativeToast, WarningIcon, hasNativeToast } from './native-toast.tsx';

export interface ComposerToggleState {
  visible: boolean;
  policy: SessionPolicy | undefined;
  /** The bridge dropped; `policy` is the last known one and stays on screen, read-only. */
  reconnecting: boolean;
  writable: boolean;
  saving: ReadonlySet<string>;
  failed: ReadonlySet<string>;
}

const HOST_UNAVAILABLE_DELAY_MS = 3000;

function HostUnavailableToast({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), HOST_UNAVAILABLE_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!hasNativeToast || !visible) return null;
  const Toast = NativeToast!;
  return <Toast text={text} icon={<WarningIcon />} onDone={() => setVisible(false)} />;
}

function SaveFailureToast({ text }: { text: string }) {
  const [visible, setVisible] = useState(true);
  if (!hasNativeToast || !visible) return null;
  const Toast = NativeToast!;
  return <Toast text={text} icon={<WarningIcon />} onDone={() => setVisible(false)} />;
}

export interface ComposerToggleFace {
  hooks: { autoContinueComposer: SnapshotStore<ComposerToggleState> };
  sessionId: string;
  setMode: (mode: SessionMode) => void;
}

export function AutoContinueComposerToggle(props: PropsLocale<'auto-continue'> & InjectFace<ComposerToggleFace>) {
  const state = props.useAutoContinueComposer((snapshot) => snapshot);
  if (!state.visible || !props.sessionId) return null;
  const failed = state.failed.has(props.sessionId);
  const saving = state.saving.has(props.sessionId);
  const policy = state.policy;
  // A child with no mode of its own shows what it actually inherits; the host
  // resolves that alongside the explicit modes so the control never reports the
  // profile default while recovery is disabled by the main conversation.
  const ownMode = sessionMode(policy?.modes ?? {}, props.sessionId);
  const mode: SessionMode = ownMode === 'default'
    ? policy?.inheritedModes?.[props.sessionId] ?? 'default'
    : ownMode;
  const disabled = !policy || !state.writable || saving;
  const title = props.t(!policy ? 'composer.unavailable' : state.reconnecting ? 'composer.reconnecting'
    : !state.writable ? 'chrome.readOnly' : saving ? 'composer.saving' : 'composer.scope');
  const modeName = props.t(`composer.${mode}`);
  const defaultName = policy
    ? `${props.t('composer.default')} (${props.t(`composer.${policy.defaultMode}`)})`
    : props.t('composer.default');
  const fullModeLabel = mode === 'default' ? defaultName : modeName;
  const modeTitle = `${props.t('composer.mode')}: ${fullModeLabel}`;
  const options: readonly ModeMenuOption[] = [
    { id: 'default', label: defaultName },
    { id: 'off', label: props.t('composer.off') },
    { id: 'recover', label: props.t('composer.recover') },
    { id: 'loop', label: props.t('composer.loop') },
  ];
  const enabled = !!policy && mode !== 'off';
  // Turning on writes `default`, unless that would just inherit Off again (a child of an Off main chat).
  const onMode: SessionMode = policy?.inheritedModes?.[props.sessionId] === 'off' ? 'recover' : 'default';
  // One 28px icon switch plus a chevron-only mode menu: the mode name lives in the
  // menu, the tooltip and the accessible name instead of taking composer width (#86).
  return (
    <div className="dshAcComposer" title={title} aria-busy={saving || undefined}>
      <span className="dshAcComposerCore">
        <button type="button" role="switch" className="dshAcIconBtn" data-state={enabled ? 'on' : 'off'}
          data-stale={state.reconnecting || undefined} aria-checked={enabled}
          aria-label={`${props.t('composer.label')}: ${fullModeLabel}`} title={`${modeTitle}\n${title}`}
          disabled={disabled} onClick={() => props.setMode(enabled ? 'off' : onMode)}>
          <AutoContinueIcon />
        </button>
        <ModeMenu mode={mode} options={options} label={modeName}
          ariaLabel={modeTitle} selectLabel={props.t('composer.mode')} title={modeTitle}
          disabled={disabled} onChange={props.setMode} />
      </span>
      {policy?.paused && <span className="dshAcComposerLabel">{props.t('composer.paused')}</span>}
      {!policy && hasNativeToast && <HostUnavailableToast text={props.t('composer.unavailable')} />}
      {failed && hasNativeToast && <SaveFailureToast text={props.t('composer.saveFailed')} />}
      {failed && !hasNativeToast && <span className="dshAcComposerError" role="status">{props.t('composer.saveFailed')}</span>}
    </div>
  );
}
