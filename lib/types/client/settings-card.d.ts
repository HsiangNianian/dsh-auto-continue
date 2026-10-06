import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { type AutoContinueSettings } from './engine.ts';
import type { ComposerToggleFace } from './composer-toggle.tsx';
import { type SettingsScope, type SnapshotStore } from './dsh-store-compat.ts';
import type { SettingsCardKey } from './locales.ts';
import { type CardActions, type CardFieldState, type CardShell } from './settings-form.ts';
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
export declare class AutoContinueSettingsCardController {
    private readonly scope;
    private readonly getLocale;
    private readonly form;
    private readonly store;
    private readonly composer;
    private composerSaving;
    private composerFailed;
    private disposed;
    private saveSequence;
    private notificationFeedback;
    /**
     * @param scope - the bound settings scope for the `auto-continue` namespace.
     */
    constructor(scope: SettingsScope<AutoContinueSettings>, getLocale: () => string);
    private projection;
    /**
     * Build the face the card's slot registration injects.
     * @returns the card's snapshot and its form actions.
     */
    inject(): AutoContinueSettingsCardFace;
    private save;
    injectComposer(): ComposerToggleFace;
    private composerProjection;
    private setEnabled;
    /** Release this card's subscription to the provider-owned settings form. */
    dispose(): void;
}
/** Props the renderer binds for the auto-continue plugin-configuration card. */
export type AutoContinueSettingsCardProps = PropsLocale<'auto-continue'> & InjectFace<AutoContinueSettingsCardFace>;
/** The bundle page supplies no list container, unlike the legacy settings slot. */
export declare function AutoContinueSettingsPage(props: AutoContinueSettingsCardProps): import("react").JSX.Element;
/** Native category layout, with the selected B3 repository invitation beside the introduction. */
export declare function AutoContinueSettingsCard(props: AutoContinueSettingsCardProps): import("react").JSX.Element | null;
