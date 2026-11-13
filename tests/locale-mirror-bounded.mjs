/** Keep the browser locale mirror bounded (regression guard for write storms). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { AutoContinueSchema } from '../lib/index.js';
import { makeHost, turnEnd } from './host-fixture.mjs';

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
        ...(page.mode === undefined ? {} : { mode: page.mode }),
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
    inject(deps, mount) {
      if (deps.every((name) => this[name])) mount(this);
    },
    effect: (start) => start(),
    locale: {
      getLocale: () => ({ active: page.active, locales: [], revision: 0 }),
      register: () => () => {},
    },
    on: () => () => {},
    settingsScope: { bind: () => scope },
    slots: {
      inject: (name, mount) => name === 'settings.plugin.item' ? mount() : () => {},
      register: () => () => {},
    },
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

for (const options of [{ writable: false }, { mode: 'memory' }]) {
  const world = makeWorld('zh');
  const page = openClient(loadBundle(), world, 'en', options);
  world.tick();
  assert.deepEqual(page.writes, [], 'read-only and legacy memory scopes must not mirror locale');
}

// 5. Client writes and host reads agree, including absent and legacy raw values.
assert.equal(AutoContinueSchema({}).locale, 'en', 'new profiles default to English');
for (const [active, target] of [
  [undefined, 'en'], [null, 'en'], [42, 'en'], ['', 'en'],
  ['fr', 'en'], ['en-US', 'en'], ['zhang', 'en'],
  ['zh', 'zh'], ['zh-CN', 'zh'], ['zh-TW', 'zh'], ['ZH-hant-TW', 'zh'],
  ['ru', 'ru'], ['ru-RU', 'ru'], ['RU', 'ru'],
]) {
  const world = makeWorld(target === 'en' ? 'zh' : 'en');
  const page = openClient(loadBundle(), world, active);
  world.tick();
  world.drain();
  assert.equal(world.host.locale, target, `mirror locale ${active}`);
  assert.ok(page.writes.length <= MAX_WRITES_PER_LOCALE);
  const host = makeHost({ scanOnBoot: false, locale: active });
  try {
    const agent = host.agent('locale');
    host.start();
    host.emit(agent, turnEnd(1, 'max-tokens'));
    await new Promise(resolve => setTimeout(resolve, 30));
    const expectedPrompt = target === 'zh' ? '继续' : target === 'ru' ? 'Продолжай' : 'Continue';
    assert.equal(agent.followups[0]?.content[0]?.text, expectedPrompt, `host locale ${active}`);
  } finally { host.dispose(); }
}

// 6. An old tab can exhaust both budgets and leave an unsupported raw value stored;
//    prompts still fall back to English for it.
{
  const world = makeWorld('fr');
  const oldPage = world.openPage('fr');
  oldPage.listeners.add(() => {
    if (oldPage.locale !== oldPage.active && oldPage.writes.length < MAX_WRITES_PER_LOCALE) {
      oldPage.set('locale', oldPage.active);
    }
  });
  const page = openClient(loadBundle(), world, 'fr');
  world.drain();
  assert.equal(oldPage.writes.length, MAX_WRITES_PER_LOCALE);
  assert.equal(page.writes.length, MAX_WRITES_PER_LOCALE);
  oldPage.listeners.clear();
  world.tick();
  world.drain();
  assert.equal(world.host.locale, 'fr', 'closing the old tab does not replenish the budget');
  assert.equal(world.pending(), 0);
  const host = makeHost({ scanOnBoot: false, ...world.host });
  try {
    const agent = host.agent('mixed-tabs');
    host.start();
    host.emit(agent, turnEnd(1, 'max-tokens'));
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(agent.followups[0]?.content[0]?.text, 'Continue', 'an unsupported raw locale falls back to English prompts');
  } finally { host.dispose(); }
}

console.log('bounded locale mirror ✅');
