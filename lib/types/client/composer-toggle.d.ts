import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { SnapshotStore } from './dsh-store-compat.ts';
export interface ComposerToggleState {
    visible: boolean;
    enabled: boolean;
    writable: boolean;
    saving: boolean;
    failed: boolean;
}
export interface ComposerToggleFace {
    hooks: {
        autoContinueComposer: SnapshotStore<ComposerToggleState>;
    };
    setEnabled: (enabled: boolean) => void;
}
export declare function AutoContinueComposerToggle(props: PropsLocale<'auto-continue'> & InjectFace<ComposerToggleFace>): import("react").JSX.Element | null;
