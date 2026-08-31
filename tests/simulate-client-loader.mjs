/** Verify browser bundle compatibility and locale-to-settings synchronization. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = dirname(fileURLToPath(import.meta.url));
const bundle = readFileSync(join(root, '../lib/client.js'), 'utf8');

function snapshotStoreModule() {
  return {
    createSnapshotStore(init) {
      let value = init;
      const listeners = new Set();
      return {
        getSnapshot: () => value,
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        update(mutator) {
          mutator(value);
          for (const listener of listeners) listener();
        },
        set(next) {
          value = next;
          for (const listener of listeners) listener();
        },
      };
    },
  };
}

function loadClient(availableStore) {
  let registration;
  vm.runInNewContext(bundle, {
    AbortController,
    console,
    fetch: async () => {
      throw new Error('offline test bridge');
    },
    setTimeout: () => 0,
    clearTimeout: () => {},
    TextDecoder,
    URL,
    window: {
      __ModuleLoader__: {
        load(next) {
          registration = next;
        },
      },
    },
  });
  assert.ok(registration, 'client bundle registers with the DSH module loader');

  const requests = [];
  const exported = registration.factory((specifier) => {
    requests.push(specifier);
    if (specifier === 'react' || specifier === 'react/jsx-runtime') return {};
    if (specifier === availableStore) return snapshotStoreModule();
    throw new Error(`module unavailable in this DSH cohort: ${specifier}`);
  });
  assert.equal(typeof exported.apply, 'function');
  return { exported, requests };
}

const current = loadClient('@deepseek-ai/dsh-client-store');
assert.ok(current.requests.includes('@deepseek-ai/dsh-client-store'));
assert.ok(!current.requests.includes('@deepseek-ai/dsh-client-runtime/client'));

const legacy = loadClient('@deepseek-ai/dsh-client-runtime/client');
assert.ok(legacy.requests.includes('@deepseek-ai/dsh-client-store'));
assert.ok(legacy.requests.includes('@deepseek-ai/dsh-client-runtime/client'));

const writes = [];
const listeners = new Set();
let snapshot = {
  status: 'ready',
  value: { locale: 'zh' },
  base: undefined,
  user: undefined,
  revision: 0,
  writable: true,
  mode: 'host',
};
const scope = {
  getSnapshot: () => snapshot,
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  async set(field, value) {
    writes.push({ field, value });
    snapshot = { ...snapshot, value: { ...snapshot.value, [field]: value } };
    for (const listener of listeners) listener();
  },
  async unset() {},
};
const localeHandlers = new Set();
let registeredDictionaries;
let activeLocale = 'en';
const ctx = {
  effect(start) {
    return start();
  },
  locale: {
    getLocale: () => ({ active: activeLocale, locales: [], revision: 0 }),
    register: (_namespace, dictionaries) => {
      registeredDictionaries = dictionaries;
      return () => {};
    },
  },
  on(event, handler) {
    if (event === 'locale/change') localeHandlers.add(handler);
    return () => localeHandlers.delete(handler);
  },
  settingsScope: { bind: () => scope },
  slots: {
    inject: (_name, mount) => mount(),
    register: () => () => {},
  },
};
current.exported.apply(ctx);
assert.deepEqual(writes, [{ field: 'locale', value: 'en' }]);
activeLocale = 'zh';
for (const handler of localeHandlers) handler();
assert.deepEqual(writes, [
  { field: 'locale', value: 'en' },
  { field: 'locale', value: 'zh' },
]);
assert.deepEqual(
  JSON.parse(JSON.stringify({
    zh: {
      continueText: registeredDictionaries?.zh?.['default.continueText'],
      continueTextMaxTokens: registeredDictionaries?.zh?.['default.continueTextMaxTokens'],
      guardPendingText: registeredDictionaries?.zh?.['default.guardPendingText'],
      guardDoneText: registeredDictionaries?.zh?.['default.guardDoneText'],
      loopText: registeredDictionaries?.zh?.['default.loopText'],
    },
    en: {
      continueText: registeredDictionaries?.en?.['default.continueText'],
      continueTextMaxTokens: registeredDictionaries?.en?.['default.continueTextMaxTokens'],
      guardPendingText: registeredDictionaries?.en?.['default.guardPendingText'],
      guardDoneText: registeredDictionaries?.en?.['default.guardDoneText'],
      loopText: registeredDictionaries?.en?.['default.loopText'],
    },
  })),
  {
    zh: {
      continueText: '继续',
      continueTextMaxTokens: '继续',
      guardPendingText: '(上一步工具「{tool}」可能未完成, 先确认状态再继续, 不要重复执行)',
      guardDoneText: '(上一步工具「{tool}」已完成, 结果: {result}; 不要重复执行, 直接继续)',
      loopText: '(检测到你可能陷入循环, 请停止重复刚才的动作, 换一种方式继续)',
    },
    en: {
      continueText: 'Continue',
      continueTextMaxTokens: 'Continue',
      guardPendingText:
        '(The previous tool "{tool}" may not have completed. Check its state before continuing and do not run it again.)',
      guardDoneText:
        '(The previous tool "{tool}" completed successfully. Result: {result}; do not run it again. Continue from there.)',
      loopText:
        '(You may be stuck in a loop. Stop repeating the last action and continue with a different approach.)',
    },
  },
);

console.log('client loader compatibility + browser locale sync ✅');
