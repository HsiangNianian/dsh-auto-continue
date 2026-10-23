import { type SessionMode } from '../shared/core.ts';
export interface ModeMenuOption {
    id: SessionMode;
    label: string;
}
export interface ModeMenuProps {
    mode: SessionMode;
    options: readonly ModeMenuOption[];
    /** Short label shown on the trigger, e.g. 跟随默认. */
    label: string;
    /** Accessible name including the resolved mode, e.g. 自动继续模式: 跟随默认 (仅故障恢复). */
    ariaLabel: string;
    /** Plain menu name used by the legacy select fallback. */
    selectLabel: string;
    title: string;
    disabled: boolean;
    onChange: (mode: SessionMode) => void;
}
export declare function ModeMenu(props: ModeMenuProps): import("react").JSX.Element;
