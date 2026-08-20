/**
 * `auto-continue` namespace dictionaries: copy for the plugin settings card
 * registered into the `settings.plugin.item` seat of the plugin-configuration
 * section. Includes the card-chrome keys the card component reads.
 */
/** 简体中文词典(键集的事实来源)。 */
export declare const zh: {
    'card.title': string;
    'card.description': string;
    'field.paused': string;
    'field.pausedHint': string;
    'field.continueText': string;
    'field.continueTextHint': string;
    'field.continueTextMaxTokens': string;
    'field.continueTextMaxTokensHint': string;
    'field.guardTools': string;
    'field.guardToolsHint': string;
    'field.guardPendingText': string;
    'field.guardPendingTextHint': string;
    'field.guardDoneText': string;
    'field.guardDoneTextHint': string;
    'field.graceMs': string;
    'field.graceMsHint': string;
    'field.cooldownMs': string;
    'field.cooldownMsHint': string;
    'field.maxConsecutive': string;
    'field.maxConsecutiveHint': string;
    'field.scanOnBoot': string;
    'field.scanOnBootHint': string;
    'field.scanLimit': string;
    'field.scanLimitHint': string;
    'field.freshMs': string;
    'field.freshMsHint': string;
    'field.reconnectScanDelayMs': string;
    'field.reconnectScanDelayMsHint': string;
    'field.reconnectBackoffMs': string;
    'field.reconnectBackoffMsHint': string;
    'field.verbose': string;
    'field.verboseHint': string;
    'field.classify': string;
    'field.classifyHint': string;
    'field.backoffFactor': string;
    'field.backoffFactorHint': string;
    'field.backoffMaxMs': string;
    'field.backoffMaxMsHint': string;
    'field.notify': string;
    'field.notifyHint': string;
    'stats.title': string;
    'stats.sent': string;
    'stats.skipped': string;
    'stats.recovered': string;
    'stats.failed': string;
    'stats.gaveUp': string;
    'stats.looped': string;
    'field.loopGuard': string;
    'field.loopGuardHint': string;
    'field.loopShortChars': string;
    'field.loopShortCharsHint': string;
    'field.loopWindowMs': string;
    'field.loopWindowMsHint': string;
    'field.loopShortCount': string;
    'field.loopShortCountHint': string;
    'field.loopRepeatText': string;
    'field.loopRepeatTextHint': string;
    'field.loopToolRepeat': string;
    'field.loopToolRepeatHint': string;
    'field.loopText': string;
    'field.loopTextHint': string;
    'stats.byCode': string;
    'stats.empty': string;
    'stats.reset': string;
    'pause.title': string;
    'pause.none': string;
    'pause.clearAll': string;
    'pause.unpause': string;
    'pause.minutes': string;
    'chrome.collapse': string;
    'chrome.expand': string;
    'chrome.unsaved': string;
    'chrome.readOnly': string;
    'chrome.saveFailed': string;
    'chrome.discard': string;
    'chrome.saving': string;
    'chrome.save': string;
    'chrome.overridden': string;
    'chrome.reset': string;
    'chrome.invalidNumber': string;
    'chrome.inherit': string;
    'chrome.on': string;
    'chrome.off': string;
};
/** 本插件的键联合。 */
export type SettingsCardKey = keyof typeof zh;
/** English dictionary, checked complete against the zh key set. */
export declare const en: Record<SettingsCardKey, string>;
