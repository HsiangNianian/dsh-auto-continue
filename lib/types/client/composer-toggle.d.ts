import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { SnapshotStore } from './dsh-store-compat.ts';
import { type SessionMode, type SessionPolicy } from '../shared/core.ts';
export interface ComposerToggleState {
    visible: boolean;
    policy: SessionPolicy | undefined;
    writable: boolean;
    saving: ReadonlySet<string>;
    failed: ReadonlySet<string>;
}
export interface ComposerToggleFace {
    hooks: {
        autoContinueComposer: SnapshotStore<ComposerToggleState>;
    };
    sessionId: string;
    setMode: (mode: SessionMode) => void;
}
export declare function AutoContinueComposerToggle(props: PropsLocale<'auto-continue'> & InjectFace<ComposerToggleFace>): import("react").JSX.Element | null;
