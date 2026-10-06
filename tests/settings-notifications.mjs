/** Save notifications through the actual bundled client and its injected settings actions. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

const bundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(t, { service = 'configForms', locale = 'en', notify = false, permission = 'granted', hasApi = true, baseNotify = false } = {}) {
  let registration, entry, dictionaries, heldWrite, heldPermission, failedField;
  let throwWrite = false, throwNotification = false, permissionRequests = 0;
  let snapshot = { status: 'ready', value: { locale, notify }, user: { notify }, base: { notify: baseNotify }, mode: 'host', writable: true };
  const listeners = new Set(), cleanups = [], notices = [], writes = [], order = [];
  const patch = value => { snapshot = { ...snapshot, ...value }; for (const listener of listeners) listener(); };
  const write = async (field, value, clear = false) => {
    order.push('write');
    writes.push({ field, value, clear });
    if (heldWrite) { const pending = heldWrite; heldWrite = undefined; await pending.promise; }
    if (throwWrite) throw new Error('host unavailable');
    if (field === failedField) return false;
    const user = { ...snapshot.user };
    if (clear) delete user[field]; else user[field] = value;
    patch({ user, value: { ...snapshot.value, [field]: clear ? snapshot.base[field] : value } });
    return true;
  };
  const scope = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    set: (field, value) => write(field, value),
    unset: field => write(field, undefined, true),
  };
  class Notification {
    static permission = permission;
    static requestPermission() {
      order.push('permission');
      permissionRequests++;
      if (!heldPermission) return Promise.resolve(Notification.permission = 'granted');
      return heldPermission.promise.then(value => Notification.permission = value);
    }
    constructor(title, options) {
      if (throwNotification) throw new Error('platform notifications unavailable');
      notices.push({ title, ...options });
    }
  }
  vm.runInNewContext(bundle, {
    AbortController, console, TextDecoder, URL, setTimeout: () => 0, clearTimeout() {},
    ...(hasApi ? { Notification } : {}),
    fetch: async () => { throw new Error('offline notification fixture'); },
    window: { __ModuleLoader__: { load(value) { registration = value; } } },
  });
  const plugin = registration.factory(specifier => {
    if (specifier === 'react') return React;
    if (specifier === 'react/jsx-runtime') return jsxRuntime;
    if (specifier === '@deepseek-ai/dsh-client-store') return {
      createSnapshotStore(value) {
        const subscribers = new Set();
        return {
          getSnapshot: () => value,
          subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
          set(next) { value = next; for (const fn of subscribers) fn(); },
        };
      },
    };
    throw new Error(`Missing test module ${specifier}`);
  });
  const settingsSlot = service === 'configForms' ? 'plugins.bundle.config' : 'settings.plugin.item';
  const ctx = {
    [service]: service === 'configForms' ? { get: () => scope } : { bind: () => scope },
    inject(deps, mount) { if (deps.every(dep => this[dep])) mount(this); },
    effect(start) { const stop = start(); if (typeof stop === 'function') cleanups.push(stop); },
    on() {},
    locale: {
      getLocale: () => ({ active: locale }),
      register(_namespace, value) { dictionaries = value; return () => {}; },
    },
    slots: {
      inject(name, mount) { if (name === settingsSlot) ctx.effect(mount); },
      register(options, component) { entry = { face: options.inject(), component }; return () => {}; },
    },
  };
  plugin.apply(ctx);
  const dispose = () => { for (const stop of cleanups.splice(0).reverse()) stop(); };
  t.after(dispose);
  const state = () => entry.face.hooks.autoContinueSettingsCard.getSnapshot();
  return {
    face: entry.face, state, notices, writes, order, patch, dispose,
    snapshot: () => snapshot,
    requests: () => permissionRequests,
    fail: field => { failedField = field; },
    throwWrite: value => { throwWrite = value; },
    throwNotification: () => { throwNotification = true; },
    holdWrite() { heldWrite = deferred(); return heldWrite; },
    holdPermission() { heldPermission = deferred(); return heldPermission; },
    render: () => renderToStaticMarkup(React.createElement(entry.component, {
      ...entry.face, useAutoContinueSettingsCard: select => select(state()), t: key => dictionaries[locale][key],
    })),
  };
}

for (const service of ['configForms', 'settingsScope']) {
  test(`${service}: enabled, settings saved, disabled, then silent`, async t => {
    const f = fixture(t, { service });
    f.face.edit('notify', 'true');
    assert.equal(f.notices.length, 0, 'staging alone does not notify');
    const gate = f.holdWrite();
    f.face.save();
    f.face.save();
    assert.equal(f.notices.length, 0, 'wait for the host to accept the save');
    gate.resolve();
    await flush();
    assert.equal(f.notices.length, 1, 'duplicate clicks produce one notification');
    assert.match(f.notices[0].body, /notifications are on/);
    f.face.edit('continueText', 'A private prompt that must not appear in a notification');
    f.face.edit('cooldownMs', '22000');
    f.face.save();
    await flush();
    assert.equal(f.notices.length, 2, 'a multi-field save produces one notification');
    assert.equal(f.notices[1].body, 'Your auto-continue settings have been saved.');
    assert.doesNotMatch(JSON.stringify(f.notices), /private prompt/);
    f.face.edit('notify', 'false');
    f.face.save();
    await flush();
    assert.equal(f.notices.length, 3);
    assert.match(f.notices[2].body, /notifications are off/);
    f.face.edit('continueText', 'Changed while notifications are off');
    f.face.save();
    await flush();
    f.face.save();
    f.face.edit('notify', 'true');
    f.face.discard();
    await flush();
    assert.equal(f.notices.length, 3, 'off, no-op and discard never notify');
    assert.equal(f.requests(), 0, 'already granted permission does not prompt');
  });
}

test('requests permission during the click and saves without waiting for the answer', async t => {
  const f = fixture(t, { permission: 'default', locale: 'zh' });
  const permission = f.holdPermission();
  f.face.edit('notify', 'true');
  f.face.save();
  assert.deepEqual(f.order, ['permission', 'write']);
  await flush();
  assert.equal(f.snapshot().value.notify, true);
  assert.equal(f.state().saving, false);
  assert.equal(f.notices.length, 0);
  permission.resolve('granted');
  await flush();
  assert.deepEqual(f.notices, [{ title: '自动继续设置', body: '设置已保存，浏览器通知已开启。' }]);
});

test('a later save supersedes a pending permission confirmation', async t => {
  const f = fixture(t, { permission: 'default' });
  const permission = f.holdPermission();
  f.face.edit('notify', 'true');
  f.face.save();
  await flush();
  f.face.edit('continueText', 'Continue carefully');
  f.face.save();
  await flush();
  assert.equal(f.requests(), 1, 'reuse the open permission prompt');
  permission.resolve('granted');
  await flush();
  assert.equal(f.notices.length, 1);
  assert.match(f.notices[0].body, /settings have been saved/);
});

test('turning off during a permission prompt cannot emit a stale enabled message', async t => {
  const f = fixture(t, { permission: 'default' });
  const permission = f.holdPermission();
  f.face.edit('notify', 'true');
  f.face.save();
  await flush();
  f.face.edit('notify', 'false');
  f.face.save();
  await flush();
  permission.resolve('granted');
  await flush();
  assert.equal(f.notices.length, 0);
  assert.equal(f.requests(), 1);
  assert.equal(f.state().notificationFeedback, 'notification.disabled');
});

test('new drafts do not change the notification for the save still in flight', async t => {
  const f = fixture(t);
  const gate = f.holdWrite();
  f.face.edit('notify', 'true');
  f.face.save();
  f.face.edit('notify', 'false');
  gate.resolve();
  await flush();
  assert.equal(f.state().notify.text, 'false');
  assert.equal(f.state().dirty, true);
  assert.match(f.notices[0].body, /notifications are on/);
});

test('reset uses the inherited notification state', async t => {
  const f = fixture(t, { notify: false, baseNotify: true });
  f.face.resetField('notify');
  f.face.save();
  await flush();
  assert.match(f.notices[0].body, /notifications are on/);
  assert.equal(Object.hasOwn(f.snapshot().user, 'notify'), false);
});

test('partial and thrown saves do not send success, and can be retried', async t => {
  const f = fixture(t);
  f.fail('continueText');
  f.face.edit('notify', 'true');
  f.face.edit('continueText', 'Continue');
  f.face.save();
  await flush();
  assert.equal(f.snapshot().value.notify, true, 'one field landed but the save is incomplete');
  assert.equal(f.state().failed, true);
  assert.equal(f.notices.length, 0);
  f.fail(undefined);
  f.throwWrite(true);
  f.face.save();
  await flush();
  assert.equal(f.state().saving, false);
  assert.equal(f.notices.length, 0);
  f.throwWrite(false);
  f.face.save();
  await flush();
  assert.equal(f.state().failed, false);
  assert.equal(f.notices.length, 1);
});

test('invalid, read-only and external changes do not prompt or notify', async t => {
  const f = fixture(t, { permission: 'default' });
  f.face.edit('notify', 'true');
  f.face.edit('cooldownMs', '-1');
  f.face.save();
  f.face.discard();
  f.patch({ writable: false });
  f.face.edit('notify', 'true');
  f.face.save();
  f.face.discard();
  f.patch({ value: { locale: 'en', notify: true } });
  await flush();
  assert.equal(f.requests(), 0);
  assert.equal(f.notices.length, 0);
  assert.equal(f.writes.length, 0);
});

for (const permission of ['denied', 'default']) {
  test(`turning off with ${permission} permission never requests it`, async t => {
    const f = fixture(t, { permission, notify: true });
    f.face.edit('notify', 'false');
    f.face.save();
    await flush();
    assert.equal(f.requests(), 0);
    assert.equal(f.notices.length, 0);
    assert.equal(f.state().notificationFeedback, 'notification.disabled');
  });
}

test('denied permission reports the reason without failing or repeatedly prompting', async t => {
  const f = fixture(t, { permission: 'default' });
  const permission = f.holdPermission();
  f.face.edit('notify', 'true');
  f.face.save();
  permission.resolve('denied');
  await flush();
  assert.equal(f.state().failed, false);
  assert.equal(f.state().notificationFeedback, 'notification.blocked');
  assert.match(f.render(), /Settings saved, but browser notifications are not allowed/);
  f.face.edit('continueText', 'Continue');
  f.face.save();
  await flush();
  assert.equal(f.requests(), 1);
  assert.equal(f.notices.length, 0);
});

test('unsupported browsers and notification failures leave saved settings intact', async t => {
  for (const failure of ['missing-api', 'constructor', 'permission']) {
    const f = fixture(t, { hasApi: failure !== 'missing-api', permission: failure === 'permission' ? 'default' : 'granted' });
    const permission = failure === 'permission' ? f.holdPermission() : undefined;
    if (failure === 'constructor') f.throwNotification();
    f.face.edit('notify', 'true');
    f.face.save();
    permission?.reject(new Error('permission request failed'));
    await flush();
    assert.equal(f.state().failed, false);
    assert.equal(f.snapshot().value.notify, true);
    assert.equal(f.state().notificationFeedback, failure === 'missing-api' ? 'notification.unsupported' : 'notification.failed');
    assert.equal(f.notices.length, 0);
  }
});

test('provider teardown and external disable invalidate pending confirmations', async t => {
  for (const change of ['teardown', 'external']) {
    const f = fixture(t, { permission: 'default' });
    const permission = f.holdPermission();
    f.face.edit('notify', 'true');
    f.face.save();
    await flush();
    if (change === 'teardown') f.dispose();
    else f.patch({ value: { locale: 'en', notify: false } });
    permission.resolve('granted');
    await flush();
    assert.equal(f.notices.length, 0);
  }
});
