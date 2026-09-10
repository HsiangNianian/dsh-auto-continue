/** Keep the browser locale mirror bounded (regression guard for write storms). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = dirname(fileURLToPath(import.meta.url));
const bundle = readFileSync(join(root, '../lib/client.js'), 'utf8');

/** Per-page write budget the client must not exceed for one active locale. */
const MAX_WRITES_PER_LOCALE = 3;

function loadBundle() {
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
  return registration.factory((specifier) => {
    if (specifier === 'react' || specifier === 'react/jsx-runtime') return {};
    // Modern snapshot store: the compat shim probes the legacy runtime specifier
    // first and keeps whatever this cohort can resolve.
    if (specifier === '@deepseek-ai/dsh-client-store') {
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
            set(next) {
              value = next;
              for (const listener of listeners) listener();
            },
          };
        },
      };
    }
    throw new Error(`module unavailable in this test: ${specifier}`);
  });
}

/**
 * One simulated settings document shared by every open page. Notifications are
 * queued instead of delivered re-entrantly, so a client that writes from
 * inside a notification cannot recurse into the test driver.
 */
function makeStore(initial) {
  const store = {
    locale: initial,
    status: 'ready',
    writable: true,
    mode: 'host',
    listeners: new Set(),
    queue: [],
    snapshot: () => ({
      status: store.status,
      writable: store.writable,
      mode: store.mode,
      value: { locale: store.locale },
    }),
    notifyAll: () => {
      for (const listener of [...store.listeners]) store.queue.push(listener);
    },
    write: (field, value) => {
      store[field] = value;
      store.notifyAll();
    },
    /** Deliver queued notifications; `limit` keeps a runaway client from hanging the test. */
    drain: (limit = 500) => {
      let delivered = 0;
      while (store.queue.length > 0 && delivered < limit) {
        delivered += 1;
        store.queue.shift()();
      }
      return delivered;
    },
  };
  return store;
}

/** Open one page against `store`, mirroring `active` as its UI locale. */
function openClient(exports, store, active) {
  const writes = [];
  const scope = {
    getSnapshot: () => store.snapshot(),
    subscribe(listener) {
      store.listeners.add(listener);
      return () => store.listeners.delete(listener);
    },
    async set(field, value) {
      writes.push(value);
      store.write(field, value);
    },
    async unset() {},
  };
  exports.apply({
    effect: (start) => start(),
    locale: {
      getLocale: () => ({ active, locales: [], revision: 0 }),
      register: () => () => {},
    },
    on: () => () => {},
    settingsScope: { bind: () => scope },
    slots: { inject: (_name, mount) => mount(), register: () => () => {} },
  });
  return writes;
}

// 1. A stored value that never folds back must not be re-written forever.
{
  const exports = loadBundle();
  const store = makeStore('en');
  const writes = openClient(exports, store, 'en');
  // The stored value keeps reading back as another locale, exactly like the
  // 2026-09-04 incident where the fold lagged behind the document tick.
  store.snapshot = () => ({ status: 'ready', writable: true, mode: 'host', value: { locale: 'zh' } });
  store.notifyAll();
  store.drain();
  assert.ok(
    writes.length <= MAX_WRITES_PER_LOCALE,
    `a stale snapshot wrote ${writes.length} times (budget ${MAX_WRITES_PER_LOCALE})`,
  );
  store.notifyAll();
  store.drain();
  assert.ok(
    writes.length <= MAX_WRITES_PER_LOCALE,
    `a stale snapshot kept writing after the budget (${writes.length} writes)`,
  );
}

// 2. Two pages with different UI languages must not fight over the stored value.
{
  const exports = loadBundle();
  const store = makeStore('en');
  const english = openClient(exports, store, 'en');
  const chinese = openClient(exports, store, 'zh');
  for (let round = 0; round < 10; round += 1) {
    store.drain();
  }
  assert.ok(
    english.length <= MAX_WRITES_PER_LOCALE,
    `the english page wrote ${english.length} times while a chinese page was open`,
  );
  assert.ok(
    chinese.length <= MAX_WRITES_PER_LOCALE,
    `the chinese page wrote ${chinese.length} times while an english page was open`,
  );
}

// 3. A scope that is not ready yet must still mirror its locale once it is.
{
  const exports = loadBundle();
  const store = makeStore('zh');
  store.status = 'loading';
  store.writable = false;
  const writes = openClient(exports, store, 'en');
  assert.equal(writes.length, 0, 'a not-ready scope must not be written');
  store.status = 'ready';
  store.writable = true;
  store.notifyAll();
  store.drain();
  assert.deepEqual(writes, ['en'], 'the locale must be mirrored once the scope becomes ready');
}

console.log('bounded locale mirror ✅');
