import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { AutoContinueSchema } from '../lib/index.js';

const bundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
// The composer's invisible select overlay must keep its own class: the
// settings card renders a visible <select class="dshAcMode">, and an unscoped
// absolute/inset rule would stretch it over the whole app.
assert.match(bundle, /\.dshAcComposerSelect\s*\{[^}]*position:\s*absolute/, 'the composer overlay keeps a scoped class');
assert.match(bundle, /\.dshAcCard \.dshAcMode\s*\{/, 'settings-card select styles stay scoped to the card');
assert.doesNotMatch(bundle, /(?:^|\n)\.dshAcMode\s*\{[^}]*position:\s*absolute/, 'the settings select is not made a full-screen overlay');
function host() {
  const streams = new Set();
  const writes = [];
  let policy = { modes: {}, defaultMode: 'recover', paused: false, writable: true };
  let behavior = 'ok', finish;
  const frame = () => new TextEncoder().encode(`data: ${JSON.stringify({ type: 'state', sessionPolicy: policy })}\n\n`);
  const publish = () => { for (const stream of streams) stream.enqueue(frame()); };
  return {
    writes, streams,
    policy: () => policy,
    update: change => { policy = { ...policy, ...change }; publish(); },
    behavior: value => { behavior = value; },
    finish: () => finish(),
    disconnect: () => { for (const stream of streams) stream.close(); streams.clear(); },
    oldHost: () => { policy = undefined; publish(); },
    async fetch(path, options) {
      if (path.endsWith('bridge')) return new Response(new ReadableStream({
        start(controller) {
          streams.add(controller);
          controller.enqueue(frame());
          options.signal.addEventListener('abort', () => {
            if (streams.delete(controller)) controller.close();
          }, { once: true });
        },
      }));
      const payload = JSON.parse(options.body);
      writes.push(payload);
      assert.equal(payload.action, 'set-session-mode');
      if (behavior === 'defer') await new Promise(resolve => { finish = resolve; });
      if (behavior === 'throw') throw new Error('offline');
      if (behavior === 'fail') return Response.json({ ok: false }, { status: 500 });
      if (behavior === 'old') return Response.json({ ok: true });
      policy = { ...policy, modes: { ...policy.modes, [payload.sessionId]: payload.mode } };
      publish();
      if (behavior === 'late-ack') await new Promise(resolve => { finish = resolve; });
      return Response.json({ ok: true, sessionId: payload.sessionId, mode: payload.mode });
    },
  };
}

function MockToast({ text }) {
  return React.createElement('div', { 'data-toast': '' }, text);
}

function MockMenu({ open, anchor, items, selectedId }) {
  return React.createElement('div', { 'data-menu': open ? 'open' : 'closed' },
    anchor,
    React.createElement('div', { role: 'menu' }, items.map(item => React.createElement('div', {
      key: item.id, role: 'menuitem', 'data-selected': String(item.id === selectedId),
    }, item.label))));
}

function fixture(service, server, hasComposerSlot = true, primitives = {}) {
  let registration, dictionaries;
  const cleanups = [], writes = [];
  const entries = new Map(), listeners = new Set();
  let snapshot = { status: 'loading', value: { locale: 'en' }, base: { showComposerToggle: true }, user: {}, writable: true, ...(service === 'settingsScope' ? { mode: 'host' } : {}), revision: 0 };
  const patch = value => { snapshot = { ...snapshot, ...value }; for (const listener of listeners) listener(); };
  const scope = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async set(field, value) {
      writes.push({ field, value });
      patch({ value: { ...snapshot.value, [field]: value }, user: { ...snapshot.user, [field]: value } });
      return true;
    },
    async unset(field) {
      const user = { ...snapshot.user };
      delete user[field];
      patch({ user, value: { ...snapshot.value, [field]: snapshot.base[field] } });
      return true;
    },
  };
  vm.runInNewContext(bundle, {
    AbortController, console, TextDecoder, URL, setTimeout: () => 0, clearTimeout() {}, fetch: server.fetch,
    window: { __ModuleLoader__: { load(value) { registration = value; } } },
  });
  const plugin = registration.factory(specifier => {
    if (specifier === 'react') return React;
    if (specifier === 'react/jsx-runtime') return jsxRuntime;
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives;
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
        if (options.name === 'conversation.input.left') assert.equal(options.id, 'auto-continue');
        assert.ok(!entries.has(options.name));
        entries.set(options.name, { component, face: options.inject('A'), inject: options.inject });
        return () => entries.delete(options.name);
      },
    },
  };
  plugin.apply(ctx);
  const composer = entries.get('conversation.input.left');
  const card = entries.get(settingsSlot).face;
  const state = () => composer.face.hooks.autoContinueComposer.getSnapshot();
  const render = (sessionId = 'A') => renderToStaticMarkup(React.createElement(composer.component, {
    ...composer.inject(sessionId), useAutoContinueComposer: select => select(state()), t: key => dictionaries.en[key],
  }));
  return {
    card, composer, state, writes, entries, listeners, render,
    ready: () => patch({ status: 'ready' }), patch, snapshot: () => snapshot,
    dispose: () => { for (const stop of cleanups.splice(0).reverse()) stop(); },
  };
}

assert.equal(AutoContinueSchema().showComposerToggle, true);
assert.deepEqual(AutoContinueSchema().sessionModes, {});
for (const service of ['configForms', 'settingsScope']) {
  const server = host();
  const test = fixture(service, server), tab = fixture(service, server);
  try {
    assert.equal(test.state().visible, false);
    test.ready(); tab.ready();
    await flush();
    assert.equal(test.state().visible, true);
    assert.match(test.render(), /role="switch"[^>]*aria-checked="true"/);
    assert.match(test.render(), /<select/);
    assert.match(test.render(), /aria-label="Auto-continue mode"/);
    assert.match(test.render(), /Follow default \(Recovery only\)/);
    assert.equal(test.render(''), '', 'no session identity means no control');
    test.card.edit('continueText', 'Keep the staged text');
    server.behavior('defer');
    test.composer.face.setMode('off');
    test.composer.face.setMode('off');
    assert.equal(server.writes.length, 1, 'deduplicate concurrent clicks for the same session');
    assert.ok(test.state().saving.has('A'));
    assert.equal(test.state().policy.modes.A, undefined, 'wait for the host, with no optimistic success');
    assert.match(test.render(), /disabled=""/);
    server.finish();
    await flush();
    assert.equal(test.state().policy.modes.A, 'off');
    assert.match(test.render(), /role="switch"[^>]*aria-checked="false"/);
    assert.equal(tab.state().policy.modes.A, 'off', 'another tab sees the same authoritative policy');
    assert.equal(tab.state().policy.modes.B, undefined, 'other sessions retain their own choice');
    assert.equal(test.state().failed.size, 0);
    assert.equal(test.writes.length, 0, 'the composer does not write the global pause field');
    assert.equal(test.card.hooks.autoContinueSettingsCard.getSnapshot().continueText.text, 'Keep the staged text');
    test.card.discard();

    for (const behavior of ['fail', 'throw', 'old']) {
      server.behavior(behavior);
      test.composer.face.setMode('loop');
      await flush();
      assert.equal(test.state().policy.modes.A, 'off');
      assert.ok(test.state().failed.has('A'));
      assert.match(test.render(), /Could not save/);
    }
    server.behavior('ok');
    test.composer.face.setMode('loop');
    tab.composer.inject('B').setMode('recover');
    await flush();
    assert.equal(test.state().policy.modes.A, 'loop');
    assert.match(test.render(), /role="switch"[^>]*aria-checked="true"/);
    assert.equal(test.state().policy.modes.B, 'recover', 'parallel session writes do not replace each other');
    assert.equal(test.state().failed.size, 0);
    server.update({ paused: true, defaultMode: 'loop' });
    await flush();
    assert.match(test.render(), /Globally paused/);
    assert.match(test.render(), /role="switch"[^>]*aria-checked="true"/, 'global pause does not replace the saved session choice');
    test.composer.face.setMode('default');
    await flush();
    assert.equal(test.state().policy.modes.A, 'default');
    assert.equal(test.state().policy.paused, true, 'a session choice never unpauses the profile');

    server.behavior('late-ack');
    test.composer.face.setMode('loop');
    await flush();
    server.behavior('ok');
    tab.composer.face.setMode('off');
    await flush();
    server.finish();
    await flush();
    assert.equal(test.state().policy.modes.A, 'off', 'an older POST acknowledgement cannot roll back a newer SSE update');

    const count = server.writes.length;
    test.patch({ writable: false });
    test.composer.face.setMode('off');
    test.patch({ writable: true, mode: 'memory' });
    test.composer.face.setMode('off');
    assert.equal(server.writes.length, count);
    test.patch({ mode: 'host' });
    test.card.edit('showComposerToggle', 'false');
    assert.equal(test.state().visible, true, 'visibility stays staged until Save');
    test.card.save();
    await flush();
    assert.equal(test.render(), '');
    test.card.resetField('showComposerToggle');
    test.card.save();
    await flush();
    assert.equal(test.state().visible, true);

    server.disconnect();
    await flush();
    assert.equal(test.state().writable, false);
    assert.match(test.render(), /title="Waiting for host"/);
    assert.match(test.render(), /role="switch"[^>]*aria-checked="false"[^>]*disabled=""/);
    test.composer.face.setMode('off');
    assert.equal(server.writes.length, count, 'disconnected controls do not save stale state');
  } finally {
    test.dispose(); tab.dispose();
    assert.equal(test.entries.size, 0);
    assert.equal(test.listeners.size, 0);
    assert.equal(server.streams.size, 0);
  }
}
const server = host();
const old = fixture('settingsScope', server);
old.ready();
server.oldHost();
await flush();
assert.equal(old.state().writable, false, 'an old host without session support cannot change the global setting');
old.dispose();
const pendingHost = host();
const pending = fixture('configForms', pendingHost);
pending.ready();
await flush();
pendingHost.behavior('defer');
pending.composer.face.setMode('off');
pending.dispose();
pendingHost.finish();
await flush();
assert.equal(pending.entries.size, 0);
assert.equal(pending.listeners.size, 0);
assert.equal(pendingHost.streams.size, 0, 'pending saves do not revive a disposed controller');
const noSlot = fixture('settingsScope', host(), false);
assert.equal(noSlot.entries.size, 1, 'hosts without the composer slot retain their settings page');
noSlot.dispose();
{
  const toastHost = host();
  const toastTest = fixture('settingsScope', toastHost, true, { Toast: MockToast });
  toastTest.ready();
  await flush();
  toastHost.behavior('fail');
  toastTest.composer.face.setMode('loop');
  await flush();
  assert.ok(toastTest.state().failed.has('A'));
  const html = toastTest.render();
  assert.match(html, /data-toast[^>]*>Could not save/, 'save failures surface through the host toast');
  assert.doesNotMatch(html, /dshAcComposerError/, 'hosts with Toast do not render inline error text');
  toastTest.dispose();
  toastHost.disconnect();
  assert.equal(toastHost.streams.size, 0);
}
{
  const nativeHost = host();
  const native = fixture('settingsScope', nativeHost, true, {
    Menu: MockMenu,
    IconChevronDownOutlineRegular: () => null,
  });
  native.ready();
  await flush();
  const html = native.render();
  assert.doesNotMatch(html, /<select/, 'hosts with Menu use it instead of the select fallback');
  assert.match(html, /aria-haspopup="menu"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-label="Auto-continue mode: Follow default \(Recovery only\)"/);
  assert.match(html, /role="menuitem"[^>]*data-selected="true"[^>]*>Follow default \(Recovery only\)/);
  assert.match(html, /Autonomous loop/);
  native.dispose();
  nativeHost.disconnect();
  assert.equal(native.entries.size, 0);
  assert.equal(nativeHost.streams.size, 0);
}
console.log('Composer session modes: isolated choices, two tabs, persisted acknowledgements, failures, visibility, disconnect and teardown ✅');
