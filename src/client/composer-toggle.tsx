import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { SnapshotStore } from './dsh-store-compat.ts';
import { NativeSwitch } from './native-switch.tsx';

export interface ComposerToggleState {
  visible: boolean;
  enabled: boolean;
  writable: boolean;
  saving: boolean;
  failed: boolean;
}

export interface ComposerToggleFace {
  hooks: { autoContinueComposer: SnapshotStore<ComposerToggleState> };
  setEnabled: (enabled: boolean) => void;
}

export function AutoContinueComposerToggle(props: PropsLocale<'auto-continue'> & InjectFace<ComposerToggleFace>) {
  const state = props.useAutoContinueComposer((snapshot) => snapshot);
  if (!state.visible) return null;
  const title = props.t(!state.writable ? 'chrome.readOnly' : state.saving ? 'composer.saving' : 'composer.scope');
  return (
    <div className="dshAcComposer" title={title}>
      <span className="dshAcComposerLabel">{props.t('composer.label')}</span>
      <span className="dshAcSwitchTarget">
        <NativeSwitch checked={state.enabled} onChange={props.setEnabled}
          disabled={!state.writable || state.saving} label={props.t('composer.label')} title={title} />
      </span>
      <span className="dshAcComposerError" role="status">
        {state.failed ? props.t('composer.saveFailed') : null}
      </span>
    </div>
  );
}
