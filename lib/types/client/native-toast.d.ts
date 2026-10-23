/**
 * DSH toast bridge.
 *
 * The composer reports a failed session-mode save with the host's own toast
 * instead of inline red text that shifts the input row. Hosts without the
 * primitive (older DSH, or the unit-test fixture) keep the inline fallback.
 */
import type { ComponentType, ReactNode } from 'react';
export interface ToastProps {
    text: string;
    icon?: ReactNode;
    tone?: 'success';
    onDone?: () => void;
}
export declare const NativeToast: ComponentType<ToastProps> | undefined;
export declare const hasNativeToast: boolean;
export declare function WarningIcon(): import("react").JSX.Element;
