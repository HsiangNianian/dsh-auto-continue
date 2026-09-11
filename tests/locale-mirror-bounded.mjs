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
 * A host settings document plus one independent mirror snapshot per open page.
 *
 * This reproduces the real `SettingsScopeController` ordering, which is what
 * makes the two-page case hard: `set()` awaits the host mutation and folds the
 * accepted namespace view into the WRITING page's own mirror before any other
 * page hears about it (`mirror.acceptView` -> scope `derive()` -> subscriber),
 * and only then does the host document-updated reach the other pages. A test
 * that shares one synchronously-mutated snapshot instead lets every page observe
 * the *other* page's latest value, which hides the ping-pong entirely.
 *
 * @param initial - stored locale the host starts with.
 */
function makeWorld(initial) {
  const host = { locale: initial };
  const pages = [];
  const pending = [];
  let hostWrites = 0;

  /** Open one page: its own mirror snapshot, its own subscriber set. */
  function openPage(active) {
    const page = {
      active,
      /** Values this page asked the host to store. */
      writes: [],
      status: 'ready',
      writable: true,
      /** Whether a successful write folds back into this page's own snapshot. */
      foldAck: true,
      locale: initial,
      listeners: new Set(),
      snapshot: () => ({
        status: page.status,
        writable: page.writable,
        mode: 'host',
        value: { locale: page.locale },
      }),
      /** Successful write acknowledgement: fold the accepted view into this page. */
      ack: (value) => {
        if (!page.foldAck) return;
        page.locale = value;
        page.notify();
      },
      /** settings/document-updated: re-read the host document into this page. */
      reload: () => {
        page.locale = host.locale;
        page.notify();
      },
      notify: () => {
        for (const listener of [...page.listeners]) listener();
      },
      set: (field, value) => {
        page.writes.push(value);
        hostWrites += 1;
        pending.push({ page, field, value });
      },
    };
    pages.push(page);
    return page;
  }

  /**
   * Apply queued writes in host order: mutate the document, acknowledge the
   * writer locally, then invalidate the other pages.
   * @param limit - cap so a runaway client cannot hang the test.
   * @returns number of writes applied.
   */
  function drain(limit = 200) {
    let applied = 0;
    while (pending.length > 0 && applied < limit) {
      applied += 1;
      const { page, field, value } = pending.shift();
      host[field] = value;
      page.ack(value);
      for (const other of pages) if (other !== page) other.reload();
    }
    return applied;
  }

  /** Deliver a host document tick to every page (queued, non-reentrant). */
  function tick() {
    for (const page of pages) page.notify();
  }

  return { host, pages, openPage, drain, tick, totalWrites: () => hostWrites, pending: () => pending.length };
}

/**
 * Open one page against `world`, mirroring its own `active` UI locale.
 * @param options - page overrides applied before the plugin's first sync.
 */
function openClient(exports, world, active, options = {}) {
  const page = world.openPage(active);
  Object.assign(page, options);
  const scope = {
    getSnapshot: () => page.snapshot(),
    subscribe(listener) {
      page.listeners.add(listener);
      return () => page.listeners.delete(listener);
    },
    async set(field, value) {
      page.set(field, value);
    },
    async unset() {},
  };
  exports.apply({
    effect: (start) => start(),
    locale: {
      getLocale: () => ({ active: page.active, locales: [], revision: 0 }),
      register: () => () => {},
    },
    on: () => () => {},
    settingsScope: { bind: () => scope },
    slots: { inject: (_name, mount) => mount(), register: () => () => {} },
  });
  return page;
}

// 1. A stored value that never folds back must not be re-written forever.
{
  const exports = loadBundle();
  const world = makeWorld('zh');
  // The write never folds back into this page's snapshot, exactly like the
  // 2026-09-04 incident where the fold lagged behind the document tick.
  const page = openClient(exports, world, 'en', { foldAck: false });
  for (let round = 0; round < 50; round += 1) {
    world.tick();
    world.drain();
  }
  assert.ok(
    page.writes.length <= MAX_WRITES_PER_LOCALE,
    `a stale snapshot wrote ${page.writes.length} times (budget ${MAX_WRITES_PER_LOCALE})`,
  );
  assert.equal(world.pending(), 0, 'a stale snapshot must go silent after the budget');
}

// 2. Two pages with different UI languages must not fight over the stored value.
//    Separate per-page snapshots, writer-local acknowledgement before cross-page
//    invalidation: this is the ordering the shared-snapshot test could not see.
{
  const exports = loadBundle();
  const world = makeWorld('en');
  const english = openClient(exports, world, 'en');
  const chinese = openClient(exports, world, 'zh');
  for (let round = 0; round < 10; round += 1) {
    world.drain();
    world.tick();
  }
  assert.ok(
    english.writes.length <= MAX_WRITES_PER_LOCALE,
    `the english page wrote ${english.writes.length} times while a chinese page was open`,
  );
  assert.ok(
    chinese.writes.length <= MAX_WRITES_PER_LOCALE,
    `the chinese page wrote ${chinese.writes.length} times while an english page was open`,
  );
  assert.ok(
    world.totalWrites() <= 2 * MAX_WRITES_PER_LOCALE,
    `the two pages together wrote ${world.totalWrites()} times (hard bound ${2 * MAX_WRITES_PER_LOCALE})`,
  );
  assert.equal(world.pending(), 0, 'the ping-pong must settle instead of queueing forever');
}

// 3. A scope that is not ready yet must still mirror its locale once it is.
{
  const exports = loadBundle();
  const world = makeWorld('zh');
  const page = openClient(exports, world, 'en', { status: 'loading', writable: false });
  assert.equal(page.writes.length, 0, 'a not-ready scope must not be written');
  page.status = 'ready';
  page.writable = true;
  world.tick();
  world.drain();
  assert.deepEqual(page.writes, ['en'], 'the locale must be mirrored once the scope becomes ready');
}

// 4. A genuine language switch still earns a fresh budget (the bound must not
//    permanently freeze a page whose mirror never converged).
{
  const exports = loadBundle();
  const world = makeWorld('zh');
  const page = openClient(exports, world, 'en', { foldAck: false });
  for (let round = 0; round < 20; round += 1) {
    world.tick();
    world.drain();
  }
  const spent = page.writes.length;
  assert.equal(spent, MAX_WRITES_PER_LOCALE, 'the budget must be spent before the switch');
  page.active = 'zh';
  world.tick();
  world.drain();
  page.active = 'en';
  world.tick();
  world.drain();
  assert.equal(page.writes.length, spent + 1, 'a real language switch must be able to write again');
  assert.equal(page.writes.at(-1), 'en', 'the switched-to locale must be the value written');
}

console.log('bounded locale mirror ✅');
