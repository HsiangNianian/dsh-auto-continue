/** Exercise activation through Cordis, including DSH 0.1.7 without settingsScope. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Context, Service } from '@deepseek-ai/cordis';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

const bundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
const flush = () => new Promise((resolve) => setImmediate(resolve));

function createSnapshotStore(initial) {
  let snapshot = initial;
  const listeners = new Set();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      snapshot = next;
      for (const listener of listeners) listener();
    },
    update(mutator) {
      mutator(snapshot);
      for (const listener of listeners) listener();
    },
  };
}

async function scenario(service, slot, { delayed = false } = {}) {
  let registration;
  let bridgeStarts = 0;
  let bridgeStops = 0;
  vm.runInNewContext(bundle, {
    AbortController, console, TextDecoder, URL,
    setTimeout: () => 0,
    clearTimeout: () => {},
    fetch: (_url, { signal }) => {
      bridgeStarts += 1;
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => {
        bridgeStops += 1;
        reject(new Error('bridge disposed'));
      }));
    },
    window: { __ModuleLoader__: { load: (value) => { registration = value; } } },
  });
  const plugin = registration.factory((specifier) => {
    if (specifier === 'react') return React;
    if (specifier === 'react/jsx-runtime') return jsxRuntime;
    if (specifier === '@deepseek-ai/dsh-client-store') return { createSnapshotStore };
    throw new Error(`unexpected client dependency: ${specifier}`);
  });

  const ctx = new Context();
  const entries = new Map();
  class Slots extends Service {
    constructor(ctx) { super(ctx, 'slots'); }
    inject(name, mount) {
      if (name === slot) return this.ctx.effect(mount);
      return () => {};
    }
    register(options, component) {
      assert.equal(options.name, slot);
      assert.equal(options.key, slot === 'plugins.bundle.config'
        ? 'dsh-client-auto-continue' : 'auto-continue');
      assert.equal(entries.size, 0, 'one settings card per active plugin');
      entries.set(options.key, { options, component });
      return () => entries.delete(options.key);
    }
  }
  new Slots(ctx);
  let dictionaries;
  let activeLocale = 'en';
  ctx.provide('locale', {
    getLocale: () => ({ active: activeLocale }),
    register: (_namespace, value) => {
      dictionaries = value;
      return () => {};
    },
  });
  const listeners = new Set();
  const writes = [];
  let snapshot = {
    status: 'ready', value: { locale: 'zh', graceMs: 5000 },
    base: { graceMs: 5000 }, user: {}, revision: 0, writable: true, mode: 'host',
  };
  const notify = () => { for (const listener of listeners) listener(); };
  const scope = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async set(field, value) {
      writes.push({ field, value });
      snapshot = {
        ...snapshot, value: { ...snapshot.value, [field]: value },
        user: { ...snapshot.user, [field]: value }, revision: snapshot.revision + 1,
      };
      notify();
      return service === 'configForms' ? true : undefined;
    },
    async unset(field) {
      delete snapshot.user[field];
      snapshot = { ...snapshot, value: { ...snapshot.value, [field]: snapshot.base[field] } };
      notify();
      return service === 'configForms' ? true : undefined;
    },
  };
  const provideSettings = () => ctx.plugin((provider) => {
    provider.provide(service, service === 'configForms' ? {
      get(namespace) { assert.equal(namespace, 'auto-continue'); return scope; },
    } : {
      bind({ namespace }) { assert.equal(namespace, 'auto-continue'); return scope; },
    });
  });

  try {
    let provider;
    if (!delayed) provider = await provideSettings();
    // Do not await a pending fiber: that would mask the original boot hang.
    const fiber = ctx.plugin(plugin);
    await flush();
    assert.equal(fiber.state, 2, `${service}: browser entry activates without the other settings service`);
    assert.equal(bridgeStarts, 1, 'host bridge starts exactly once');
    if (delayed) {
      assert.equal(entries.size, 0);
      provider = await provideSettings();
      await flush();
    }
    assert.equal(entries.size, 1, 'settings surface is reachable in this DSH layout');
    assert.deepEqual(writes, [{ field: 'locale', value: 'en' }]);
    const { options, component } = [...entries.values()][0];
    const face = options.inject();
    const state = () => face.hooks.autoContinueSettingsCard.getSnapshot();
    const html = renderToStaticMarkup(React.createElement(component, {
      ...face, view: 'page', t: (key) => dictionaries.en[key],
      useAutoContinueSettingsCard: (select) => select(state()),
    }));
    assert.match(html, /Auto.Continue/i, 'the registered settings component renders');
    if (slot === 'plugins.bundle.config') assert.match(html, /^<ul\b/, 'bundle page owns the card list');

    face.edit('graceMs', '1234');
    assert.equal(writes.length, 1, 'edits are staged until Save');
    face.save();
    await flush();
    assert.equal(snapshot.value.graceMs, 1234);
    assert.equal(state().dirty, false);
    face.resetField('graceMs');
    face.save();
    await flush();
    assert.equal(snapshot.value.graceMs, 5000, 'Reset restores inherited settings');
    activeLocale = 'zh';
    ctx.emit('locale/change');
    assert.equal(snapshot.value.locale, 'zh', 'locale changes still reach the Host');

    await provider.dispose();
    await flush();
    assert.equal(entries.size, 0, 'service removal withdraws the card');
    assert.equal(listeners.size, 0, 'consumer subscriptions detach from shared forms');
    provider = await provideSettings();
    await flush();
    assert.equal(entries.size, 1, 'service replacement remounts exactly one card');
    assert.equal(listeners.size, 2, 'only the locale mirror and current card subscribe');
    await fiber.dispose();
    assert.equal(entries.size, 0);
    assert.equal(listeners.size, 0);
    assert.equal(bridgeStops, 1, 'plugin teardown closes its host bridge');
  } finally {
    await ctx.fiber.dispose();
  }
}

await scenario('configForms', 'plugins.bundle.config');
await scenario('configForms', 'plugins.bundle.config', { delayed: true });
await scenario('settingsScope', 'settings.plugin.item');
await scenario('settingsScope', 'settings.plugin.item', { delayed: true });
console.log('Cordis settings activation, editing, service replacement, and teardown ✅');
