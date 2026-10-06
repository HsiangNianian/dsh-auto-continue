/**
 * Styles for the auto-continue settings card, injected at factory
 * materialization so the client module system's style bookkeeping (HMR) owns
 * them. Uses the DSH design tokens (`--dsw-alias-*`) so the card follows the
 * active theme.
 */

const css = `
.dshAcComposer { display: inline-flex; align-items: center; gap: 7px; min-height: 32px; flex: 0 0 auto; font: inherit; }
.dshAcComposerLabel { color: var(--dsw-alias-label-secondary); font-size: 12px; white-space: nowrap; }
.dshAcSwitchTarget { display: inline-flex; align-items: center; min-height: 32px; }
.dshAcSwitchTarget > button { position: relative; }
.dshAcSwitchTarget > button::before { content: ''; position: absolute; inset: -6px -3px; }
.dshAcComposerError { color: var(--dsw-alias-state-error-primary, var(--dsw-alias-label-secondary)); font-size: 12px; max-width: 160px; }
.dshAcComposerError:empty { display: none; }
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
.dshAcHeaderFrame { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr); align-items: center; gap: 24px; margin: 20px 0; padding: 16px 18px; border-radius: 9px; color: #f9fafb; background: #23262c; }
.dshAcIntroduction { min-width: 0; }
.dshAcTitleLine { display: flex; align-items: center; gap: 10px; }
.dshAcTitleLine h2 { font-size: 17px; font-weight: 620; line-height: 1.4; white-space: nowrap; }
.dshAcStatus { white-space: nowrap; font-size: 11px; color: #dce0e6; background: #ffffff14; border-radius: 5px; padding: 2px 7px; }
.dshAcIntroduction p { margin-top: 5px; color: #b9bec8; font-size: 12px; line-height: 1.6; }
.dshAcRepository { display: flex; align-items: center; gap: 12px; min-width: 0; }
.dshAcStar { display: grid; place-items: center; flex: none; width: 34px; height: 34px; border: 1px solid #625032; border-radius: 50%; background: #302c25; color: #e9be6d; }
.dshAcStar svg { width: 18px; height: 18px; fill: #e9be6d12; stroke: currentColor; stroke-width: 1.5; stroke-linejoin: round; }
.dshAcRepositoryCopy { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 5px; }
.dshAcRepositoryCopy strong { font-size: 13px; font-weight: 560; line-height: 1.5; }
.dshAcRepositoryCopy > span { color: #b9bec8; font-size: 10px; line-height: 1.6; }
.dshAcRepositoryCopy > * { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.dshAcCard a.dshAcGithub { display: inline-flex; align-items: center; justify-content: center; gap: 8px; flex: none; min-height: 38px; padding: 9px 11px; border: 1px solid transparent; border-radius: 6px; color: #202329; background: #f4f5f7; text-decoration: none; font-size: 12px; font-weight: 550; white-space: nowrap; transition: background-color 140ms ease, box-shadow 140ms ease; }
.dshAcCard a.dshAcGithub:hover { background: #fff; box-shadow: 0 0 0 3px #ffffff18; }
.dshAcCard a.dshAcGithub:focus-visible { outline-color: #e9be6d; }
.dshAcGithub > svg { flex: none; width: 17px; height: 17px; fill: currentColor; }
.dshAcGithub > svg.dshAcExternal { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; margin-left: 2px; }
.dshAcGithubShort { display: none; }
.dshAcReadOnly { padding: 10px 0; color: var(--dsh-ac-muted); }
.dshAcLayout { display: grid; grid-template-columns: 164px minmax(0, 1fr); border-top: 1px solid var(--dsh-ac-line); min-height: 462px; }
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
@container auto-continue-settings (max-width: 760px) {
  .dshAcHeaderFrame { grid-template-columns: minmax(0, 1fr) auto; gap: 16px; }
  .dshAcRepositoryCopy { display: none; }
  .dshAcRepository { gap: 10px; }
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
@container auto-continue-settings (max-width: 440px) {
  .dshAcHeaderFrame { gap: 12px; padding: 14px; }
  .dshAcTitleLine { gap: 6px; }
  .dshAcTitleLine h2 { font-size: 15px; white-space: normal; }
  .dshAcStatus { padding: 2px 5px; font-size: 10px; }
  .dshAcIntroduction p { font-size: 11px; }
  .dshAcStar, .dshAcGithubLong { display: none; }
  .dshAcGithubShort { display: inline; }
  .dshAcCard a.dshAcGithub { gap: 6px; padding: 8px; font-size: 11px; }
  .dshAcGithub > svg.dshAcExternal { display: none; }
}
@media (prefers-reduced-motion: reduce) { .dshAcCard a.dshAcGithub { transition: none; } }

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
