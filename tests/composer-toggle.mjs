import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { AutoContinueSchema } from '../lib/index.js';

const bundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture(service, native = true, hasComposerSlot = true) {
  let registration;
  let dictionaries;
  const cleanups = [];
  const entries = new Map();
  const listeners = new Set();
  const writes = [];
  let mode = 'ok';
  let finish;
  let snapshot = { status: 'loading', value: { locale: 'en' }, base: { showComposerToggle: true }, user: {}, writable: true, mode: 'host', revision: 0 };
  const notify = () => { for (const listener of listeners) listener(); };
  const patch = (value) => { snapshot = { ...snapshot, ...value }; notify(); };
  const scope = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async set(field, value) {
      writes.push({ field, value });
      if (mode === 'defer') await new Promise(resolve => { finish = resolve; });
      if (mode === 'throw') throw new Error('write failed');
      if (mode === 'false') return false;
      patch({ value: { ...snapshot.value, [field]: value }, user: { ...snapshot.user, [field]: value } });
      return mode === 'void' ? undefined : true;
    },
    async unset(field) {
      const user = { ...snapshot.user };
      delete user[field];
      patch({ user, value: { ...snapshot.value, [field]: snapshot.base[field] } });
      return true;
    },
  };
  vm.runInNewContext(bundle, {
    AbortController, console, TextDecoder, URL, setTimeout: () => 0, clearTimeout() {},
    fetch: async () => { throw new Error('offline bridge fixture'); },
    window: { __ModuleLoader__: { load(value) { registration = value; } } },
  });
  const plugin = registration.factory(specifier => {
    if (specifier === 'react') return React;
    if (specifier === 'react/jsx-runtime') return jsxRuntime;
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') {
      return native ? { Switch: props => React.createElement('button', {
        role: 'switch', 'aria-label': props.label, 'aria-checked': props.checked,
        disabled: props.disabled, 'data-native': true,
      }) } : {};
    }
    if (specifier === '@deepseek-ai/dsh-client-store') return {
      createSnapshotStore(initial) {
        let value = initial;
        const subscribers = new Set();
        return {
          getSnapshot: () => value,
          subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
          set(next) { value = next; for (const fn of subscribers) fn(); },
        };
      },
    };
    throw new Error(`Unexpected dependency: ${specifier}`);
  });
  const settingsSlot = service === 'configForms' ? 'plugins.bundle.config' : 'settings.plugin.item';
  const ctx = {
    [service]: service === 'configForms' ? { get: () => scope } : { bind: () => scope },
    inject(deps, mount) { if (deps.every(dep => this[dep])) mount(this); },
    effect(start) { const stop = start(); if (typeof stop === 'function') cleanups.push(stop); },
    on() {},
    locale: {
      getLocale: () => ({ active: 'en' }),
      register(_namespace, value) { dictionaries = value; return () => {}; },
    },
    slots: {
      inject(name, mount) {
        if (name === settingsSlot || (hasComposerSlot && name === 'conversation.input.left')) ctx.effect(mount);
      },
      register(options, component) {
        if (options.name === 'conversation.input.left') assert.equal(options.id, 'auto-continue', 'use an additive list slot with an entry id');
        assert.ok(!entries.has(options.name));
        entries.set(options.name, { component, face: options.inject() });
        return () => entries.delete(options.name);
      },
    },
  };
  plugin.apply(ctx);
  const composer = entries.get('conversation.input.left');
  const card = entries.get(settingsSlot).face;
  const state = () => composer.face.hooks.autoContinueComposer.getSnapshot();
  return {
    card, composer, state, writes, entries, listeners,
    ready: () => patch({ status: 'ready' }), patch,
    snapshot: () => snapshot,
    mode: value => { mode = value; },
    finish: () => finish(),
    render: () => renderToStaticMarkup(React.createElement(composer.component, {
      ...composer.face, useAutoContinueComposer: select => select(state()), t: key => dictionaries.en[key],
    })),
    dispose: () => { for (const stop of cleanups.reverse()) stop(); },
  };
}

assert.equal(AutoContinueSchema().showComposerToggle, true, 'new and existing installations default to a visible switch');
for (const service of ['configForms', 'settingsScope']) {
  const test = fixture(service);
  try {
    assert.equal(test.state().visible, false, 'do not expose an unhydrated setting');
    test.ready();
    assert.equal(test.state().visible, true);
    assert.equal(test.state().enabled, true);
    assert.match(test.render(), /data-native="true"/, 'use the host Switch export');

    test.card.edit('continueText', 'Keep the staged text');
    test.mode('defer');
    test.composer.face.setEnabled(false);
    test.composer.face.setEnabled(false);
    assert.equal(test.writes.length, 1, 'deduplicate clicks while a save is in flight');
    assert.equal(test.state().saving, true);
    assert.equal(test.state().enabled, true, 'show committed state until the host accepts the write');
    assert.match(test.render(), /disabled=""/);
    test.finish();
    await flush();
    assert.equal(test.snapshot().value.paused, true);
    assert.equal(test.state().enabled, false);
    assert.equal(test.state().failed, false);
    assert.equal(test.card.hooks.autoContinueSettingsCard.getSnapshot().continueText.text, 'Keep the staged text');
    test.card.discard();

    for (const mode of ['false', 'throw']) {
      test.mode(mode);
      test.composer.face.setEnabled(true);
      await flush();
      assert.equal(test.state().enabled, false, 'failed writes must not show success');
      assert.equal(test.state().failed, true);
      assert.match(test.render(), /Could not save/);
    }
    test.mode('void');
    test.composer.face.setEnabled(true);
    await flush();
    assert.equal(test.state().enabled, true, 'legacy void-returning writes work');
    assert.equal(test.state().failed, false);

    const writeCount = test.writes.length;
    test.patch({ writable: false });
    test.composer.face.setEnabled(false);
    test.patch({ writable: true, mode: 'memory' });
    test.composer.face.setEnabled(false);
    assert.equal(test.writes.length, writeCount, 'read-only and memory-only scopes cannot change the host');
    test.patch({ mode: 'host' });

    test.card.edit('showComposerToggle', 'false');
    assert.equal(test.state().visible, true, 'visibility edits remain staged until Save');
    test.card.save();
    await flush();
    assert.equal(test.state().visible, false);
    assert.equal(test.snapshot().value.paused, false, 'hiding the switch leaves recovery enabled');
    assert.equal(test.render(), '');
    test.card.resetField('showComposerToggle');
    test.card.save();
    await flush();
    assert.equal(test.state().visible, true, 'Reset restores default visibility');
    test.patch({ value: { ...test.snapshot().value, paused: true } });
    assert.equal(test.state().enabled, false, 'external settings changes reach the composer');

    test.mode('defer');
    test.composer.face.setEnabled(true);
    test.dispose();
    assert.equal(test.entries.size, 0);
    assert.equal(test.listeners.size, 0);
    test.finish();
    await flush();
  } finally { if (test.entries.size) test.dispose(); }
}
const legacy = fixture('settingsScope', false);
legacy.ready();
assert.match(legacy.render(), /class="dshAcSwitch"/);
assert.match(legacy.render(), /role="switch"/);
legacy.dispose();
const noSlot = fixture('settingsScope', false, false);
assert.equal(noSlot.entries.size, 1, 'hosts without the composer slot retain their settings page');
noSlot.dispose();
console.log('Composer toggle: native/legacy UI, shared settings, save failures, pending writes, visibility, read-only and teardown ✅');
