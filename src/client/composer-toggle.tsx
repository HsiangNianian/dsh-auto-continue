import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { SnapshotStore } from './dsh-store-compat.ts';
import { isSessionMode, sessionMode, type SessionMode, type SessionPolicy } from '../shared/core.ts';

export interface ComposerToggleState {
  visible: boolean;
  policy: SessionPolicy | undefined;
  writable: boolean;
  saving: ReadonlySet<string>;
  failed: ReadonlySet<string>;
}

export interface ComposerToggleFace {
  hooks: { autoContinueComposer: SnapshotStore<ComposerToggleState> };
  sessionId: string;
  setMode: (mode: SessionMode) => void;
}

export function AutoContinueComposerToggle(props: PropsLocale<'auto-continue'> & InjectFace<ComposerToggleFace>) {
  const state = props.useAutoContinueComposer((snapshot) => snapshot);
  if (!state.visible || !props.sessionId) return null;
  const saving = state.saving.has(props.sessionId);
  const policy = state.policy;
  const title = props.t(!policy ? 'composer.unavailable' : !state.writable ? 'chrome.readOnly' : saving ? 'composer.saving' : 'composer.scope');
  return (
    <div className="dshAcComposer" title={title}>
      <span className="dshAcComposerLabel">{props.t('composer.label')}</span>
      <select className="dshAcMode" aria-label={props.t('composer.label')} title={title}
        disabled={!state.writable || saving} value={sessionMode(policy?.modes ?? {}, props.sessionId)}
        onChange={event => { if (isSessionMode(event.target.value)) props.setMode(event.target.value); }}>
        <option value="default">{props.t('composer.default')}{policy ? ` (${props.t(`composer.${policy.defaultMode}`)})` : ''}</option>
        <option value="off">{props.t('composer.off')}</option>
        <option value="recover">{props.t('composer.recover')}</option>
        <option value="loop">{props.t('composer.loop')}</option>
      </select>
      {policy?.paused && <span className="dshAcComposerLabel">{props.t('composer.paused')}</span>}
      <span className="dshAcComposerError" role="status">
        {state.failed.has(props.sessionId) ? props.t('composer.saveFailed') : saving ? props.t('composer.saving') : !policy ? props.t('composer.unavailable') : null}
      </span>
    </div>
  );
}
