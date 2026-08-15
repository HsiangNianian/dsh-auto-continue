/**
 * Styles for the auto-continue settings card, injected at factory
 * materialization so the client module system's style bookkeeping (HMR) owns
 * them. Uses the DSH design tokens (`--dsw-alias-*`) so the card follows the
 * active theme.
 */

const css = `
.dshAcCard {
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-3);
  border-radius: 12px;
  list-style: none;
  transition: border-color .16s, background .16s;
}
.dshAcCard:hover { border-color: var(--dsw-alias-label-dimmed); }
.dshAcCardOpen {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-label-dimmed);
}
.dshAcHeader {
  appearance: none;
  width: 100%;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: none;
  border: 0;
  border-radius: 12px;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  display: flex;
}
.dshAcHeader:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.dshAcHeadText { flex-direction: column; flex: 1; gap: 4px; min-width: 0; display: flex; }
.dshAcName { color: var(--dsw-alias-label-primary); font-size: 15px; font-weight: 600; line-height: 1.4; }
.dshAcDescription { color: var(--dsw-alias-label-tertiary); font-size: 13px; line-height: 1.5; }
.dshAcChevron { color: var(--dsw-alias-label-tertiary); flex: none; transition: transform .16s; }
.dshAcChevronOpen { transform: rotate(180deg); }
.dshAcBody { border-top: 1px solid var(--dsw-alias-border-l2); margin: 0 16px; padding-bottom: 8px; }
.dshAcReadOnly { color: var(--dsw-alias-label-tertiary); margin: 12px 0 0; font-size: 12px; line-height: 1.5; }
.dshAcPending {
  white-space: nowrap;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
  border-radius: 999px;
  flex: none;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 500;
  line-height: 17px;
}
.dshAcFooter {
  border-top: 1px solid var(--dsw-alias-border-l2);
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  padding: 12px 0 4px;
  display: flex;
}
.dshAcFailed { min-width: 0; color: var(--dsw-alias-label-error); flex: 1; margin: 0; font-size: 12px; line-height: 1.5; }
.dshAcDiscard, .dshAcSave {
  appearance: none;
  font: inherit;
  cursor: pointer;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 5px 14px;
  font-size: 13px;
  line-height: 1.5;
}
.dshAcDiscard { border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); background: none; }
.dshAcDiscard:hover:not(:disabled) { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-dimmed); }
.dshAcSave { background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-layer-3); }
.dshAcDiscard:disabled, .dshAcSave:disabled { opacity: .4; cursor: default; }
.dshAcDiscard:focus-visible, .dshAcSave:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dshAcField { flex-direction: column; gap: 6px; padding: 12px 0; display: flex; }
.dshAcField + .dshAcField { border-top: 1px solid var(--dsw-alias-border-l2); }
.dshAcHead { align-items: center; gap: 8px; display: flex; }
.dshAcLabel { min-width: 0; color: var(--dsw-alias-label-primary); flex: 1; font-size: 13px; font-weight: 500; line-height: 1.5; }
.dshAcBadges { align-items: center; gap: 8px; display: inline-flex; }
.dshAcBadge {
  white-space: nowrap;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 500;
  line-height: 17px;
}
.dshAcReset {
  font: inherit;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
  font-size: 12px;
  line-height: 1.5;
}
.dshAcReset:hover:not(:disabled) { color: var(--dsw-alias-label-primary); }
.dshAcReset:disabled { cursor: default; }
.dshAcInput {
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-3);
  height: 34px;
  font: inherit;
  color: var(--dsw-alias-label-primary);
  border-radius: 8px;
  padding: 0 12px;
  font-size: 13px;
  line-height: 1.5;
}
.dshAcInput:focus-visible { border-color: var(--dsw-alias-brand-primary); outline: none; }
.dshAcInput:disabled { color: var(--dsw-alias-label-tertiary); cursor: default; }
.dshAcInputInvalid { border-color: var(--dsw-alias-label-error); }
.dshAcSelect {
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-3);
  height: 34px;
  font: inherit;
  color: var(--dsw-alias-label-primary);
  border-radius: 8px;
  padding: 0 8px;
  font-size: 13px;
  line-height: 1.5;
}
.dshAcSelect:focus-visible { border-color: var(--dsw-alias-brand-primary); outline: none; }
.dshAcSelect:disabled { color: var(--dsw-alias-label-tertiary); cursor: default; }
.dshAcInvalid { color: var(--dsw-alias-label-error); margin: 0; font-size: 12px; line-height: 1.5; }
.dshAcHint { color: var(--dsw-alias-label-tertiary); margin: 0; font-size: 12px; line-height: 1.5; }
.dshAcPanel { border-top: 1px solid var(--dsw-alias-border-l2); flex-direction: column; gap: 8px; padding: 12px 0; display: flex; }
.dshAcPanelHead { align-items: center; gap: 8px; display: flex; }
.dshAcPanelTitle { color: var(--dsw-alias-label-primary); flex: 1; font-size: 13px; font-weight: 600; line-height: 1.5; }
.dshAcStats { gap: 4px 16px; margin: 0; grid-template-columns: repeat(2, minmax(0, 1fr)); display: grid; }
.dshAcStats > div { justify-content: space-between; gap: 8px; display: flex; }
.dshAcStats dt { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.5; }
.dshAcStats dd { color: var(--dsw-alias-label-primary); margin: 0; font-size: 12px; font-weight: 600; line-height: 1.5; }
.dshAcCodes { flex-wrap: wrap; align-items: center; gap: 6px; display: flex; }
.dshAcCode {
  white-space: nowrap;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 500;
  line-height: 17px;
}
.dshAcPauseList { flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; display: flex; }
.dshAcPauseList li { align-items: center; gap: 8px; display: flex; }
.dshAcPauseId {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 1.5;
}
`;

/** Inject the stylesheet once; a no-op outside a browser environment. */
export function injectStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.querySelector('style[data-plugin-css="auto-continue/card"]') !== null) return;
  const tag = document.createElement('style');
  tag.dataset.plugin = 'dsh-client-auto-continue';
  tag.dataset.pluginCss = 'auto-continue/card';
  tag.textContent = css;
  document.head.appendChild(tag);
}
