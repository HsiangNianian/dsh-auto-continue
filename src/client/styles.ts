/**
 * Styles for the auto-continue settings card, injected at factory
 * materialization so the client module system's style bookkeeping (HMR) owns
 * them. Uses the DSH design tokens (`--dsw-alias-*`) so the card follows the
 * active theme.
 */

const css = `
.dshAcCard {
  --dsh-ac-violet: #8b7cff;
  --dsh-ac-cyan: #45cce5;
  --dsh-ac-mint: #46d69d;
  --dsh-ac-amber: #f1b95c;
  isolation: isolate;
  position: relative;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-3);
  border-radius: 16px;
  list-style: none;
  box-shadow: 0 10px 34px rgb(0 0 0 / 8%);
  transition: border-color .2s ease, background .2s ease, box-shadow .2s ease, transform .2s ease;
}
.dshAcCard::before {
  content: "";
  z-index: 2;
  position: absolute;
  inset: 0 0 auto;
  height: 2px;
  pointer-events: none;
  opacity: .72;
  background: linear-gradient(90deg, transparent 1%, var(--dsh-ac-violet) 22%, var(--dsh-ac-cyan) 52%, var(--dsh-ac-mint) 80%, transparent 99%);
}
.dshAcCard::after {
  content: "";
  z-index: -1;
  position: absolute;
  width: 190px;
  height: 190px;
  top: -104px;
  left: -76px;
  pointer-events: none;
  border-radius: 999px;
  background: radial-gradient(circle, rgb(139 124 255 / 14%) 0, transparent 68%);
}
.dshAcCard:hover {
  border-color: color-mix(in srgb, var(--dsh-ac-violet) 48%, var(--dsw-alias-border-l2));
  box-shadow: 0 14px 42px rgb(0 0 0 / 12%);
  transform: translateY(-1px);
}
.dshAcCardOpen {
  background: var(--dsw-alias-bg-layer-2);
  border-color: color-mix(in srgb, var(--dsh-ac-violet) 42%, var(--dsw-alias-border-l2));
  box-shadow: 0 18px 54px rgb(0 0 0 / 14%);
  transform: none;
}
.dshAcHeaderFrame {
  align-items: stretch;
  flex-direction: column;
  display: flex;
}
.dshAcHeader {
  appearance: none;
  min-width: 0;
  flex: 1;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: none;
  border: 0;
  border-radius: 16px;
  align-items: center;
  gap: 14px;
  padding: 18px 18px 12px;
  display: flex;
}
.dshAcHeader:focus-visible { outline: 2px solid var(--dsh-ac-violet); outline-offset: -3px; }
.dshAcRelayMark {
  width: 54px;
  height: 54px;
  flex: none;
  place-items: center;
  display: grid;
  color: var(--dsh-ac-cyan);
  border: 1px solid color-mix(in srgb, var(--dsh-ac-violet) 42%, var(--dsw-alias-border-l2));
  border-radius: 17px;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 84%, var(--dsh-ac-violet) 16%);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 4%), 0 8px 24px rgb(62 51 153 / 16%);
}
.dshAcRelayMark svg { width: 44px; height: 44px; overflow: visible; }
.dshAcRelayArc { fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; }
.dshAcRelayArcEcho { opacity: .42; }
.dshAcRelayNode { stroke: var(--dsw-alias-bg-layer-3); stroke-width: 1.5; }
.dshAcRelayNodeStart { fill: var(--dsh-ac-amber); }
.dshAcRelayNodeEnd { fill: var(--dsh-ac-mint); }
.dshAcRelayPulse { fill: var(--dsh-ac-violet); opacity: .85; }
.dshAcCard:hover .dshAcRelayPulse, .dshAcCardOpen .dshAcRelayPulse {
  animation: dshAcRelayTravel 1.8s cubic-bezier(.4, 0, .2, 1) infinite;
}
.dshAcHeadText { flex-direction: column; flex: 1; gap: 3px; min-width: 0; display: flex; }
.dshAcEyebrow {
  color: color-mix(in srgb, var(--dsh-ac-violet) 76%, var(--dsw-alias-label-secondary));
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.dshAcName {
  color: var(--dsw-alias-label-primary);
  font-family: ui-rounded, "SF Pro Rounded", "Segoe UI", sans-serif;
  font-size: 18px;
  font-weight: 680;
  letter-spacing: -.015em;
  line-height: 1.35;
}
.dshAcDescription { max-width: 660px; color: var(--dsw-alias-label-tertiary); font-size: 13px; line-height: 1.5; }
.dshAcJourney { flex-wrap: wrap; align-items: center; gap: 7px; margin-top: 4px; display: flex; }
.dshAcJourneyStep {
  align-items: center;
  gap: 5px;
  color: var(--dsw-alias-label-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: .02em;
  display: inline-flex;
}
.dshAcJourneyDot { width: 5px; height: 5px; flex: none; border-radius: 999px; background: currentColor; box-shadow: 0 0 0 3px rgb(255 255 255 / 3%); }
.dshAcJourneyInterrupted .dshAcJourneyDot { color: var(--dsh-ac-amber); }
.dshAcJourneyGrace .dshAcJourneyDot { color: var(--dsh-ac-cyan); }
.dshAcJourneyContinue .dshAcJourneyDot { color: var(--dsh-ac-mint); }
.dshAcJourneyLine {
  width: 25px;
  height: 1px;
  flex: none;
  opacity: .7;
  background: linear-gradient(90deg, var(--dsh-ac-violet), var(--dsh-ac-cyan), var(--dsh-ac-mint));
  background-size: 220% 100%;
}
.dshAcCard:hover .dshAcJourneyLine, .dshAcCardOpen .dshAcJourneyLine { animation: dshAcSignalSweep 1.8s linear infinite; }
.dshAcChevron {
  width: 30px;
  height: 30px;
  color: var(--dsw-alias-label-tertiary);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  flex: none;
  place-items: center;
  display: grid;
  transition: color .18s ease, border-color .18s ease, transform .18s ease;
}
.dshAcChevron svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.dshAcHeader:hover .dshAcChevron { color: var(--dsh-ac-violet); border-color: color-mix(in srgb, var(--dsh-ac-violet) 48%, var(--dsw-alias-border-l2)); }
.dshAcChevronOpen { transform: rotate(180deg); }
.dshAcGithub {
  min-width: 0;
  max-width: none;
  align-self: stretch;
  align-items: center;
  gap: 10px;
  margin: 0 18px 16px;
  padding: 9px 11px;
  color: var(--dsw-alias-label-primary);
  text-decoration: none;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 13px;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 90%, var(--dsh-ac-violet) 10%);
  display: flex;
  transition: border-color .18s ease, background .18s ease, transform .18s ease;
}
.dshAcGithub:hover {
  border-color: color-mix(in srgb, var(--dsh-ac-violet) 58%, var(--dsw-alias-border-l2));
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 82%, var(--dsh-ac-violet) 18%);
  transform: translateY(-1px);
}
.dshAcGithub:focus-visible { outline: 2px solid var(--dsh-ac-violet); outline-offset: 2px; }
.dshAcGithubIcon { width: 23px; height: 23px; flex: none; color: var(--dsw-alias-label-primary); }
.dshAcGithubIcon svg { width: 100%; height: 100%; fill: currentColor; }
.dshAcGithubText { min-width: 0; flex: 1; flex-direction: column; gap: 1px; display: flex; }
.dshAcGithubAction { font-size: 12px; font-weight: 680; line-height: 1.4; }
.dshAcGithubAction::before { content: "★"; color: var(--dsh-ac-amber); margin-right: 5px; }
.dshAcGithubSlug {
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9.5px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshAcExternal { width: 15px; height: 15px; flex: none; color: var(--dsw-alias-label-tertiary); }
.dshAcExternal svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.25; stroke-linecap: round; stroke-linejoin: round; }
.dshAcBody { border-top: 1px solid var(--dsw-alias-border-l2); margin: 0 18px 12px; padding: 4px 0 0; }
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
.dshAcFormCanvas { flex-direction: column; gap: 14px; padding: 12px 0 8px; display: flex; }
.dshAcFormSection {
  --dsh-ac-section: var(--dsh-ac-violet);
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-3);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-3) 95%, var(--dsh-ac-section) 5%);
}
.dshAcFormSection-handoff { --dsh-ac-section: var(--dsh-ac-mint); }
.dshAcFormSection-safety { --dsh-ac-section: var(--dsh-ac-amber); }
.dshAcFormSection-recovery { --dsh-ac-section: var(--dsh-ac-cyan); }
.dshAcFormSection-loop { --dsh-ac-section: var(--dsh-ac-violet); }
.dshAcFormSection-live { --dsh-ac-section: color-mix(in srgb, var(--dsh-ac-violet) 60%, var(--dsh-ac-cyan)); }
.dshAcSectionHead {
  align-items: center;
  gap: 11px;
  padding: 13px 14px 11px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  display: flex;
}
.dshAcSectionSignal {
  width: 4px;
  height: 34px;
  flex: none;
  border-radius: 999px;
  background: var(--dsh-ac-section);
  box-shadow: 0 0 18px color-mix(in srgb, var(--dsh-ac-section) 55%, transparent);
}
.dshAcSectionCopy { min-width: 0; flex-direction: column; gap: 2px; display: flex; }
.dshAcSectionTitle {
  color: var(--dsw-alias-label-primary);
  font-family: ui-rounded, "SF Pro Rounded", "Segoe UI", sans-serif;
  font-size: 14px;
  font-weight: 680;
  line-height: 1.4;
}
.dshAcSectionDescription { color: var(--dsw-alias-label-tertiary); font-size: 11.5px; line-height: 1.45; }
.dshAcSectionGrid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 22px;
  padding: 0 14px 4px;
  display: grid;
}
.dshAcField { min-width: 0; flex-direction: column; gap: 6px; padding: 12px 0; border-top: 1px solid var(--dsw-alias-border-l2); display: flex; }
.dshAcSectionGrid > .dshAcField:first-child { border-top: 0; }
.dshAcFieldWide { grid-column: 1 / -1; }
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
  box-sizing: border-box;
  width: 100%;
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
.dshAcTextArea { box-sizing: border-box; height: auto; min-height: 84px; padding: 8px 12px; resize: vertical; }
.dshAcSelect {
  box-sizing: border-box;
  width: 100%;
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
.dshAcPanel { min-width: 0; flex-direction: column; gap: 8px; padding: 12px 0 14px; display: flex; }
.dshAcPanel + .dshAcPanel { border-left: 1px solid var(--dsw-alias-border-l2); padding-left: 20px; }
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
@keyframes dshAcRelayTravel {
  0% { opacity: 0; transform: translate(-19px, 18px) scale(.7); }
  18% { opacity: 1; }
  82% { opacity: 1; }
  100% { opacity: 0; transform: translate(12px, 6px) scale(1.15); }
}
@keyframes dshAcSignalSweep {
  from { background-position: 100% 0; }
  to { background-position: -120% 0; }
}
@media (max-width: 820px) {
  .dshAcSectionGrid { grid-template-columns: minmax(0, 1fr); }
  .dshAcFieldWide { grid-column: auto; }
  .dshAcPanel + .dshAcPanel {
    border-top: 1px solid var(--dsw-alias-border-l2);
    border-left: 0;
    padding-left: 0;
  }
}
@media (max-width: 560px) {
  .dshAcHeader { align-items: flex-start; gap: 11px; padding: 15px 13px 10px; }
  .dshAcRelayMark { width: 46px; height: 46px; border-radius: 14px; }
  .dshAcRelayMark svg { width: 38px; height: 38px; }
  .dshAcName { font-size: 16px; }
  .dshAcDescription { font-size: 12px; }
  .dshAcJourney { gap: 5px; }
  .dshAcJourneyLine { width: 13px; }
  .dshAcChevron { width: 27px; height: 27px; }
  .dshAcPending { display: none; }
  .dshAcGithub { margin: 0 13px 13px; }
  .dshAcBody { margin-right: 13px; margin-left: 13px; }
}
@media (prefers-reduced-motion: reduce) {
  .dshAcCard, .dshAcGithub, .dshAcChevron { transition: none; }
  .dshAcCard:hover, .dshAcGithub:hover { transform: none; }
  .dshAcRelayPulse, .dshAcJourneyLine { animation: none !important; }
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
