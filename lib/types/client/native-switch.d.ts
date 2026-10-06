import type { ComponentType } from 'react';
interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    disabled?: boolean;
    title?: string;
}
export declare const NativeSwitch: ComponentType<SwitchProps>;
export {};
