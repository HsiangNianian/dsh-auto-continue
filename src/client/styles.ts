/**
 * Styles for the auto-continue settings card, injected at factory
 * materialization so the client module system's style bookkeeping (HMR) owns
 * them. Uses the DSH design tokens (`--dsw-alias-*`) so the card follows the
 * active theme.
 */

const css = `
.dshAcComposer { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 6px; min-width: 0; min-height: 32px; max-width: 100%; font: inherit; }
.dshAcComposerCore { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; }
.dshAcComposerCore > span { min-width: 0; }
.dshAcModeTrigger { display: inline-flex; align-items: center; gap: 3px; min-width: 0; max-width: 132px; height: 28px; margin-left: -1px; padding: 0 4px 0 7px; border: 0; border-radius: var(--dsw-radius-sm, 6px); background: none; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px; font-weight: 500; line-height: 20px; cursor: pointer; }
.dshAcModeTrigger:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dshAcModeTrigger:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); }
.dshAcModeTrigger:disabled { color: var(--dsw-alias-label-dimmed, var(--dsw-alias-label-tertiary)); cursor: default; }
.dshAcModeTriggerLabel { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshAcModeChevron { display: inline-flex; flex: none; color: var(--dsw-alias-label-caption, var(--dsw-alias-label-tertiary)); transition: transform .12s ease; }
.dshAcModeChevron > svg { display: block; width: 14px; height: 14px; }
.dshAcModeChevronFallback { fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
.dshAcModeChevron[data-open=true] { transform: rotate(180deg); }
.dshAcModeMenu { position: relative; display: inline-flex; align-items: center; gap: 3px; min-width: 0; max-width: 132px; height: 28px; margin-left: -1px; padding: 0 4px 0 7px; border-radius: var(--dsw-radius-sm, 6px); color: var(--dsw-alias-label-secondary); font-size: 13px; font-weight: 500; line-height: 20px; }
.dshAcModeMenu:hover:not([data-disabled=true]) { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); }
.dshAcModeMenu[data-disabled=true] { color: var(--dsw-alias-label-dimmed, var(--dsw-alias-label-tertiary)); }
.dshAcComposerSelect { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; }
.dshAcComposerSelect:disabled { cursor: default; }
/* Settings-card select (default session mode); kept scoped so the composer's
   invisible overlay cannot stretch it over the whole app. */
.dshAcCard .dshAcMode { min-height: 32px; max-width: 100%; padding: 4px 6px; border: 1px solid var(--dsh-ac-line); border-radius: 6px; background: var(--dsh-ac-bg); color: var(--dsh-ac-text); font: inherit; font-size: 12px; }
.dshAcCard .dshAcMode:disabled { opacity: .5; }
.dshAcCard .dshAcMode:focus-visible { outline: 2px solid var(--dsh-ac-text); outline-offset: 3px; }
.dshAcComposerLabel { display: inline-flex; align-items: center; gap: 5px; flex: none; color: var(--dsw-alias-label-secondary); font-size: 12px; white-space: nowrap; }
.dshAcComposerText { display: inline; }
.dshAcComposerIcon { display: inline-flex; flex: none; color: var(--dsw-alias-label-secondary); }
.dshAcComposerIcon > svg { display: block; width: 14px; height: 14px; }
.dshAcComposerIconFallback { fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
.dshAcSwitchTarget { display: inline-flex; align-items: center; flex: none; min-height: 32px; }
.dshAcSwitchTarget > button { position: relative; }
.dshAcSwitchTarget > button::before { content: ''; position: absolute; inset: -6px -3px; }
.dshAcComposerError { color: var(--dsw-alias-state-error-primary, var(--dsw-alias-label-secondary)); font-size: 12px; max-width: 160px; }
.dshAcComposerError:empty { display: none; }
.dshAcToastIcon { display: block; width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
.dshAcSwitch { position: relative; box-sizing: border-box; flex: none; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; background: var(--dsw-alias-border-l3); cursor: pointer; }
.dshAcSwitch[aria-checked='true'] { background: var(--dsw-alias-brand-primary); }
.dshAcSwitch > span { display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-label-primary-foreground); }
.dshAcSwitch[aria-checked='true'] > span { transform: translateX(16px); }
.dshAcSwitch[aria-checked='false'] > span { background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary-foreground)); }
.dshAcSwitch:disabled { opacity: .5; cursor: default; }
.dshAcSwitch:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dshAcCard {
  --dsh-ac-bg: var(--dsw-alias-bg-base, var(--dsw-alias-bg-layer-2));
  --dsh-ac-line: var(--dsw-alias-border-l2);
  --dsh-ac-text: var(--dsw-alias-label-primary);
  --dsh-ac-muted: var(--dsw-alias-label-tertiary);
  container: auto-continue-settings / inline-size;
  color: var(--dsh-ac-text);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  list-style: none;
  padding: 0;
}
.dshAcCard *, .dshAcCard *::before, .dshAcCard *::after { box-sizing: border-box; }
.dshAcCard :is(h2,h3,p) { margin: 0; }
.dshAcCard :is(button,input,textarea) { font: inherit; }
.dshAcCard button { cursor: pointer; }
.dshAcCard button:disabled { opacity: .4; cursor: default; }
.dshAcCard :is(a,button,input,textarea):focus-visible { outline: 2px solid var(--dsh-ac-text); outline-offset: 3px; }
.dshAcInvite { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; margin: 0 0 18px; color: var(--dsh-ac-muted); font-size: 12px; line-height: 1.6; }
.dshAcInviteStar { color: #e9be6d; font-size: 13px; line-height: 1; }
.dshAcRepoLink { display: inline-flex; align-items: center; gap: 5px; color: var(--dsh-ac-text); text-decoration: none; }
.dshAcRepoLink:hover { text-decoration: underline; }
.dshAcRepoLink > svg:first-child { width: 14px; height: 14px; fill: currentColor; }
.dshAcRepoLink > svg.dshAcExternal { width: 11px; height: 11px; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
.dshAcNativeFields { display: flex; flex-direction: column; min-width: 0; }
.dshAcNativeField { display: flex; flex-direction: column; gap: 6px; min-width: 0; padding: 12px 0; }
.dshAcNativeHead { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; }
.dshAcNativeLabel { color: var(--dsh-ac-text); font-size: 13px; font-weight: 500; line-height: 19.5px; }
.dshAcNativeHint { color: var(--dsh-ac-muted); font-size: 12px; line-height: 18px; }
.dshAcNativeToggleRow { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-width: 0; }
.dshAcNativeActions { display: inline-flex; align-items: center; flex: none; gap: 10px; }
.dshAcNativeReset { padding: 0; border: 0; background: none; color: var(--dsh-ac-muted); font-size: 11px; white-space: nowrap; }
.dshAcNativeReset:hover:not(:disabled) { color: var(--dsh-ac-text); text-decoration: underline; }
.dshAcNativeSegment { display: block; min-width: 0; }
.dshAcNativeSegment[data-disabled=true] { opacity: .5; pointer-events: none; }
.dshAcNativeTextarea { box-sizing: border-box; width: 100%; min-height: 66px; resize: vertical; padding: 8px 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-2, #353638); color: var(--dsh-ac-text); font: inherit; font-size: 13px; line-height: 19.5px; }
.dshAcNativeTextarea::placeholder { color: var(--dsh-ac-muted); opacity: .7; }
.dshAcNativeTextarea[aria-invalid=true] { border-color: var(--dsw-alias-state-error-primary); }
.dshAcReadOnly { padding: 10px 0; color: var(--dsh-ac-muted); }
.dshAcLayout { display: grid; grid-template-columns: 164px minmax(0, 1fr); min-height: 462px; }
.dshAcNav { display: flex; flex-direction: column; gap: 4px; padding: 16px 18px 16px 0; position: sticky; top: 16px; align-self: start; }
.dshAcNav > button { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 37px; padding: 8px 11px; border: 0; border-radius: 6px; text-align: left; background: none; color: var(--dsw-alias-label-secondary); }
.dshAcNav > button:hover, .dshAcNav > button[aria-selected=true] { color: var(--dsh-ac-text); background: var(--dsw-alias-interactive-bg-hover); }
.dshAcNav > button[aria-selected=true] { font-weight: 600; }
.dshAcInvalidMark { color: var(--dsw-alias-state-error-primary); font-weight: 600; }
.dshAcCategory { min-width: 0; padding: 20px 0 16px 26px; border-left: 1px solid var(--dsh-ac-line); }
.dshAcCategoryHeading { padding-bottom: 14px; }
.dshAcCategoryHeading h3 { font-size: 15px; font-weight: 620; }
.dshAcCategoryHeading p { color: var(--dsh-ac-muted); font-size: 12px; margin-top: 3px; }
.dshAcField { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px 24px; padding: 18px 0; border-bottom: 1px solid var(--dsh-ac-line); }
.dshAcField:last-child { border-bottom: 0; }
.dshAcFieldCopy { min-width: 0; }
.dshAcLabel { display: block; font-size: 14px; font-weight: 480; color: var(--dsh-ac-text); }
.dshAcHint { color: var(--dsh-ac-muted); font-size: 12px; line-height: 1.6; }
.dshAcFieldCopy p { margin-top: 4px; }
.dshAcFieldControl { display: flex; align-items: center; justify-content: flex-end; gap: 14px; }
.dshAcReset { padding: 0; border: 0; background: none; color: var(--dsh-ac-muted); font-size: 11px !important; white-space: nowrap; }
.dshAcReset:hover:not(:disabled) { color: var(--dsh-ac-text); text-decoration: underline; }
.dshAcInput { border: 1px solid var(--dsh-ac-line); border-radius: 6px; background: var(--dsh-ac-bg); color: var(--dsh-ac-text); padding: 8px 11px; }
.dshAcInput::placeholder { color: var(--dsh-ac-muted); opacity: .7; }
.dshAcInput[aria-invalid=true] { border-color: var(--dsw-alias-state-error-primary); }
.dshAcNumber { width: 132px; min-width: 0; font-variant-numeric: tabular-nums; }
.dshAcFieldText { display: block; }
.dshAcFieldText .dshAcFieldControl { margin-top: 10px; flex-direction: column-reverse; align-items: flex-end; gap: 6px; }
.dshAcTextArea { display: block; width: 100%; min-height: 66px; resize: vertical; line-height: 1.6; }
.dshAcInvalid, .dshAcFailed { color: var(--dsw-alias-state-error-primary); font-size: 12px; }
.dshAcFooter { display: flex; justify-content: space-between; align-items: center; gap: 14px; margin-top: 24px; padding: 13px 0; border-top: 1px solid var(--dsh-ac-line); background: var(--dsh-ac-bg); }
.dshAcFooter[data-dirty=true] { position: sticky; z-index: 8; bottom: 0; }
.dshAcFooter > div { display: flex; align-items: center; gap: 8px; }
.dshAcDiscard, .dshAcSave { padding: 7px 13px; border: 1px solid var(--dsh-ac-line); border-radius: 6px; font-size: 12px !important; background: var(--dsh-ac-bg); color: var(--dsh-ac-text); white-space: nowrap; }
.dshAcSave { background: var(--dsh-ac-text); color: var(--dsh-ac-bg); border-color: var(--dsh-ac-text); }
.dshAcDiscard:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dshAcSave:hover:not(:disabled) { opacity: .85; }
.dshAcPanel { padding: 20px 0; border-top: 1px solid var(--dsh-ac-line); }
.dshAcPanelHead { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.dshAcPanelTitle { font-weight: 550; }
.dshAcStats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin: 18px 0; }
.dshAcStats dt { font-size: 11px; color: var(--dsh-ac-muted); }
.dshAcStats dd { margin: 4px 0 0; font-size: 19px; font-weight: 550; font-variant-numeric: tabular-nums; }
.dshAcCodes { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dshAcCode { font: 11px ui-monospace, SFMono-Regular, monospace; border: 1px solid var(--dsh-ac-line); border-radius: 4px; padding: 3px 6px; }
.dshAcPauseList { list-style: none; margin: 0; padding: 0; }
.dshAcPauseList li { display: flex; align-items: center; gap: 12px; padding: 10px 0; }
.dshAcPauseId { flex: 1; font: 12px ui-monospace, SFMono-Regular, monospace; }
.dshAcRecovery { display: grid; gap: 4px; min-width: 0; overflow-wrap: anywhere; }
@container auto-continue-settings (max-width: 760px) {
  .dshAcLayout { grid-template-columns: 136px minmax(0, 1fr); }
  .dshAcCategory { padding-left: 20px; }
  .dshAcFieldControl { flex-direction: column-reverse; align-items: flex-end; gap: 6px; }
}
@container auto-continue-settings (max-width: 560px) {
  .dshAcLayout { display: block; min-height: 0; }
  .dshAcNav { flex-direction: row; overflow-x: auto; position: static; padding: 12px 0; border-bottom: 1px solid var(--dsh-ac-line); }
  .dshAcNav > button { flex: none; font-size: 12px; min-height: 34px; padding: 7px 10px; }
  .dshAcCategory { border-left: 0; padding: 20px 0; }
  .dshAcField { gap: 8px 14px; }
  .dshAcLabel { font-size: 13px; }
  .dshAcNumber { width: 98px; }
  .dshAcFooter { align-items: flex-start; flex-direction: column; gap: 10px; }
  .dshAcFooter > div { width: 100%; justify-content: flex-end; }
}
/* Match the composer's own pickers (permission/mode) instead of the viewport:
   the nearest query container is the composer row, so the label collapses at
   the same 460px threshold as the native permission picker. */
@container (width <= 640px) {
  .dshAcComposerCore { gap: 5px; }
  .dshAcModeTrigger, .dshAcModeMenu { max-width: 104px; padding: 0 3px 0 6px; }
}
@container (width <= 460px) {
  .dshAcComposerText { display: none; }
  .dshAcModeTrigger, .dshAcModeMenu { max-width: 28px; padding: 0 2px; }
  .dshAcModeTriggerLabel { display: none; }
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
