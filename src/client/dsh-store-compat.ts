/**
 * Snapshot-store bridge across the two public DSH client module layouts.
 *
 * DSH 0.1.2 moved the store engine from the dynamic
 * `@deepseek-ai/dsh-client-runtime/client` row into the shell-seeded
 * `@deepseek-ai/dsh-client-store` platform module. Keep the probe dynamic so
 * esbuild does not turn both candidates into eager top-level requires: the
 * loader must only resolve the module that exists in the running DSH cohort.
 */

/** Writable observable snapshot used by the settings card. */
export interface SnapshotStore<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
  update(mutator: (draft: T) => void): void;
  set(next: T): void;
}

/** Settings state consumed by the staged form. */
export interface SettingsScopeSnapshot<T> {
  status: 'loading' | 'ready' | 'unavailable';
  value: T | undefined;
  base: unknown;
  user: unknown;
  revision: number | undefined;
  writable: boolean;
  mode: 'host' | 'memory';
}

/** Stable subset shared by the legacy and DSH 0.1.2 settings scopes. */
export interface SettingsScope<T> {
  getSnapshot(): SettingsScopeSnapshot<T>;
  subscribe(listener: () => void): () => void;
  set(field: string, value: unknown): Promise<void>;
  unset(field: string): Promise<void>;
}

interface SnapshotStoreModule {
  createSnapshotStore<T>(
    init: T,
    options?: { flush?: 'raf' | 'sync'; persist?: { name: string } },
  ): SnapshotStore<T>;
}

function resolveSnapshotStore(): SnapshotStoreModule {
  // String assembly is intentional: it preserves the lazy try/fallback in the
  // emitted client bundle instead of letting the bundler resolve both names.
  const current = ['@deepseek-ai/dsh-client', '-store'].join('');
  const legacy = ['@deepseek-ai/dsh-client-runtime', '/client'].join('');
  try {
    return require(current) as SnapshotStoreModule;
  } catch {
    return require(legacy) as SnapshotStoreModule;
  }
}

export const { createSnapshotStore } = resolveSnapshotStore();
