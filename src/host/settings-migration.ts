import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import { parse } from 'yaml';
import type { AutoContinueSettings } from '../shared/core.ts';

/** Kept in the profile so resetting a field cannot reimport its old value. */
export const LEGACY_SETTINGS_IMPORTED = '_legacySettingsImported';
export type EntrySettings = AutoContinueSettings & { _legacySettingsImported?: boolean };
export type LiveEntrySettings = { get(): EntrySettings | undefined };

interface ProfileEntry {
  fiber?: unknown;
}

interface MigrationContext extends Context {
  profileContext: { home: string };
  configEditor: {
    entries(): ProfileEntry[];
    edit(entry: ProfileEntry, change: (current: Record<string, unknown>) => Record<string, unknown>): Promise<void>;
  };
  loader: { await(): Promise<void> };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Import the mixed desktop host's legacy document through the profile editor.
 * The original file stays untouched, including other plugins' settings.
 */
export function migrateLegacySettings(
  ctx: Context,
  config: LiveEntrySettings,
  fields: readonly string[],
  validate: (value: AutoContinueSettings) => unknown,
): () => EntrySettings | undefined {
  // A profile may compose its editor after this entry. Hold recovery from the
  // outset in that case; standalone hosts without a profile still work.
  let pending = ctx.get('profileContext') !== undefined;
  if (config.get()?._legacySettingsImported === true) return () => config.get();

  ctx.inject(['configEditor', 'profileContext', 'loader'], (injected) => {
    const migration = injected as MigrationContext;
    let disposed = false;
    pending = true;
    migration.effect(() => () => { disposed = true; });
    // Do not return this task to Cordis: profile edits require the owning entry
    // to be active, and Loader.await() must not wait for this migration itself.
    void (async () => {
      if (config.get()?._legacySettingsImported === true) return;
      let source: string;
      try {
        source = await readFile(join(migration.profileContext.home, 'settings-legacy.yaml'), 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }
      const document: unknown = parse(source);
      if (document === null || document === undefined) return;
      if (!record(document)) throw new Error('Legacy settings must be a mapping');
      const section = document['auto-continue'];
      if (section === undefined) return;
      if (!record(section)) throw new Error('Legacy auto-continue settings must be a mapping');
      const values = Object.fromEntries(fields.filter(key => Object.prototype.hasOwnProperty.call(section, key)).map(key => [key, section[key]]));
      validate(values);
      await migration.loader.await();
      if (disposed) return;
      const entry = migration.configEditor.entries().find(candidate => candidate.fiber === ctx.fiber);
      if (entry === undefined) throw new Error('Auto-continue profile entry is unavailable');
      await migration.configEditor.edit(entry, current => {
        if (disposed) throw new Error('Auto-continue was unloaded during settings migration');
        if (current[LEGACY_SETTINGS_IMPORTED] === true) return current;
        // Explicit profile values, including concurrent edits, take precedence.
        return { ...values, ...current, [LEGACY_SETTINGS_IMPORTED]: true };
      });
    })().then(() => {
      if (!disposed) pending = false;
    }, () => {
      if (disposed) return;
      // YAML errors may quote other plugins' secrets, so do not log the source
      // or parser exception. Leave the original document available for repair.
      migration.logger.error('[auto-continue] Could not import settings-legacy.yaml; automatic recovery and loop guard are held until the file/profile can be read and saved, then restart the host');
    });
  });

  // Startup recovery must not run with defaults while a stored pause is loading.
  return () => pending ? { ...config.get(), paused: true, loopGuard: false } : config.get();
}
