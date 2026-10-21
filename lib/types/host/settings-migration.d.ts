import type { Context } from '@deepseek-ai/cordis';
import type { AutoContinueSettings } from '../shared/core.ts';
/** Recover an import interrupted between the profile save and completion file. */
export declare const LEGACY_SETTINGS_IMPORTED = "_legacySettingsImported";
export type EntrySettings = AutoContinueSettings & {
    _legacySettingsImported?: boolean;
};
export type LiveEntrySettings = {
    get(): EntrySettings | undefined;
};
/** Import the mixed desktop host's legacy document through the profile editor.
 * The original file stays untouched, including other plugins' settings.
 */
export declare function migrateLegacySettings(ctx: Context, config: LiveEntrySettings, fields: readonly string[], validate: (value: AutoContinueSettings) => unknown): () => EntrySettings | undefined;
