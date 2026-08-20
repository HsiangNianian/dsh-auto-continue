import { type SettingsScope, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type AutoContinueSettings } from './engine.ts';
import { type CardActions, type CardFieldState, type CardShell } from './settings-form.ts';
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
export declare class AutoContinueSettingsCardController {
    private readonly form;
    private readonly store;
    /**
     * @param scope - the bound settings scope for the `auto-continue` namespace.
     */
    constructor(scope: SettingsScope<AutoContinueSettings>);
    private projection;
    /**
     * Build the face the card's slot registration injects.
     * @returns the card's snapshot and its form actions.
     */
    inject(): AutoContinueSettingsCardFace;
}
/** Props the renderer binds for the auto-continue plugin-configuration card. */
export type AutoContinueSettingsCardProps = PropsRuntime<'settings.plugin.item'> & PropsLocale<'auto-continue'> & InjectFace<AutoContinueSettingsCardFace>;
/**
 * Render the auto-continue card.
 * @param props - locale copy, the card snapshot, and its form actions.
 * @returns the card.
 */
export declare function AutoContinueSettingsCard(props: AutoContinueSettingsCardProps): import("react").JSX.Element;
