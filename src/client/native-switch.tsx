import type { ComponentType } from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  title?: string;
}

// DSH 0.1.0-rc.7 predates this export. Keep its settings page usable while
// current hosts render their own Switch, including the active theme's styles.
function legacySwitch(props: SwitchProps) {
  return (
    <button type="button" role="switch" className="dshAcSwitch"
      aria-checked={props.checked} aria-label={props.label} disabled={props.disabled}
      title={props.title} onClick={() => props.onChange(!props.checked)}>
      <span />
    </button>
  );
}

function resolveSwitch(): ComponentType<SwitchProps> {
  try {
    const { Switch } = require('@deepseek-ai/dsh-client-ui-primitives') as { Switch?: ComponentType<SwitchProps> };
    if (typeof Switch === 'function') return Switch;
  } catch {
    // Legacy hosts can omit the primitives module from their client graph.
  }
  return legacySwitch;
}

export const NativeSwitch = resolveSwitch();
