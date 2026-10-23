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

interface IconProps {
  className?: string;
}

const primitives = (() => {
  try {
    return require('@deepseek-ai/dsh-client-ui-primitives') as {
      Toast?: ComponentType<ToastProps>;
      IconWarningOutlineRegular?: ComponentType<IconProps>;
    };
  } catch {
    return {};
  }
})();

export const NativeToast = primitives.Toast;
export const hasNativeToast = typeof NativeToast === 'function';

export function WarningIcon() {
  const Icon = primitives.IconWarningOutlineRegular;
  if (Icon) return <Icon />;
  return (
    <svg className="dshAcToastIcon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2.3 14.3 13H1.7L8 2.3Z" />
      <path d="M8 6.2v3.1M8 11.8v.1" />
    </svg>
  );
}
