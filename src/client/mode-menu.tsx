/**
 * Composer mode menu.
 *
 * Uses the host's own `Menu` and chevron primitives whenever the running DSH
 * exposes them, so the control looks and behaves like the composer's other
 * dropdowns (workspace permission, model picker). Legacy hosts, and the unit
 * tests' minimal module fixture, fall back to a native `<select>` over the
 * same compact label.
 */
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { isSessionMode, type SessionMode } from '../shared/core.ts';

export interface ModeMenuOption {
  id: SessionMode;
  label: string;
}

interface MenuProps {
  open: boolean;
  anchor: ReactNode;
  items: readonly ModeMenuOption[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  onClose?: () => void;
  side?: 'top' | 'bottom';
  portal?: boolean;
}

interface ChevronProps {
  className?: string;
}

const primitives = (() => {
  try {
    return require('@deepseek-ai/dsh-client-ui-primitives') as {
      Menu?: ComponentType<MenuProps>;
      IconChevronDownOutlineRegular?: ComponentType<ChevronProps>;
    };
  } catch {
    return {};
  }
})();

const HostMenu = primitives.Menu;
const HostChevron = primitives.IconChevronDownOutlineRegular;

function ChevronDown() {
  if (HostChevron) return <HostChevron />;
  return (
    <svg className="dshAcModeChevronFallback" viewBox="0 0 16 16" aria-hidden="true">
      <path d="m4.5 6.25 3.5 3.5 3.5-3.5" />
    </svg>
  );
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

export function ModeMenu(props: ModeMenuProps) {
  const [open, setOpen] = useState(false);
  const expanded = open && !props.disabled;

  useEffect(() => {
    if (props.disabled) setOpen(false);
  }, [props.disabled]);

  const choose = (id: string) => {
    setOpen(false);
    if (isSessionMode(id) && id !== props.mode) props.onChange(id);
  };

  if (HostMenu) {
    return (
      <HostMenu open={expanded} side="top" portal
        items={props.options} selectedId={props.mode}
        onSelect={choose} onClose={() => setOpen(false)}
        anchor={
          <button type="button" className="dshAcModeTrigger" disabled={props.disabled}
            aria-label={props.ariaLabel} aria-haspopup="menu" aria-expanded={expanded}
            title={props.title} onClick={() => setOpen(value => !value)}>
            <span className="dshAcModeTriggerLabel">{props.label}</span>
            <span className="dshAcModeChevron" data-open={expanded} aria-hidden="true"><ChevronDown /></span>
          </button>
        } />
    );
  }

  return (
    <span className="dshAcModeMenu" data-disabled={props.disabled} title={props.title}>
      <span className="dshAcModeTriggerLabel">{props.label}</span>
      <span className="dshAcModeChevron" aria-hidden="true"><ChevronDown /></span>
      <select className="dshAcComposerSelect" aria-label={props.selectLabel} disabled={props.disabled}
        value={props.mode}
        onChange={event => { if (isSessionMode(event.target.value)) props.onChange(event.target.value); }}>
        {props.options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </span>
  );
}
