import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

const root = dirname(fileURLToPath(import.meta.url));
const bundle = readFileSync(join(root, '../lib/client.js'), 'utf8');

function createSnapshotStore(initial) {
  let snapshot = initial;
  const listeners = new Set();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(mutator) {
      mutator(snapshot);
      for (const listener of listeners) listener();
    },
    set(next) {
      snapshot = next;
      for (const listener of listeners) listener();
    },
  };
}

const primitives = {
  SettingsForm: props => React.createElement('div', { 'data-native-form': '' }, props.children,
    React.createElement('button', { type: 'button', 'data-native-save': '' }, props.labels.save)),
  SettingsValueField: props => React.createElement('input', {
    'data-native-value': '', value: props.text, readOnly: true, 'aria-label': props.label,
  }),
  SegmentedControl: props => React.createElement('div', { 'data-native-segmented': '', 'data-value': props.value },
    props.options.map(option => React.createElement('span', { key: option.value }, option.label))),
  Switch: props => React.createElement('button', {
    type: 'button', role: 'switch', 'aria-checked': props.checked, 'aria-label': props.label,
  }),
};

let registration;
vm.runInNewContext(bundle, {
  AbortController,
  console,
  fetch: async () => ({ ok: true, body: { getReader: () => ({ read: () => new Promise(() => {}) }) } }),
  setTimeout: () => 0,
  clearTimeout: () => {},
  TextDecoder,
  URL,
  window: { __ModuleLoader__: { load(next) { registration = next; } } },
});
assert.ok(registration, 'client bundle registers with the DSH module loader');

let activeCategory = 'general';
function useState(initial) {
  const state = React.useState(initial);
  return initial === 'general' ? [activeCategory, state[1]] : state;
}

const plugin = registration.factory((specifier) => {
  if (specifier === 'react') return { ...React, useState };
  if (specifier === 'react/jsx-runtime') return jsxRuntime;
  if (specifier === '@deepseek-ai/dsh-client-store') return { createSnapshotStore };
  if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives;
  throw new Error(`unexpected UI dependency: ${specifier}`);
});

const snapshot = {
  status: 'ready', value: { locale: 'en' }, base: undefined, user: undefined,
  revision: 0, writable: true, mode: 'host',
};
const scope = {
  getSnapshot: () => snapshot,
  subscribe: () => () => {},
  async set() {},
  async unset() {},
};

let Card, face, dictionaries;
const ctx = {
  inject(deps, mount) { if (deps.every(name => this[name])) mount(this); },
  effect(start) { return start(); },
  locale: {
    getLocale: () => ({ active: 'en', locales: [], revision: 0 }),
    register(_namespace, next) { dictionaries = next; return () => {}; },
  },
  on: () => () => {},
  settingsScope: { bind: () => scope },
  slots: {
    inject: (name, mount) => name === 'settings.plugin.item' ? mount() : () => {},
    register(_spec, component) { Card = component; face = _spec.inject(); return () => {}; },
  },
};
plugin.apply(ctx);
assert.ok(Card, 'native settings page registers');

function render(category) {
  activeCategory = category;
  const store = face.hooks.autoContinueSettingsCard;
  return renderToStaticMarkup(React.createElement(Card, {
    ...face,
    t: key => dictionaries.en[key],
    useAutoContinueSettingsCard: select => select(store.getSnapshot()),
  }));
}

const general = render('general');
assert.match(general, /data-native-form/, 'hosts with primitives render the native SettingsForm');
assert.match(general, /data-native-segmented[^>]*data-value="false"/, 'default mode uses the native segmented control');
assert.match(general, /Autonomous loop/);
assert.doesNotMatch(general, /<select\b/, 'the native path has no OS select');
assert.doesNotMatch(general, /dshAcField/, 'the native path does not render the legacy field rows');
assert.match(general, /href="https:\/\/github\.com\/HsiangNianian\/dsh-auto-continue"/);
assert.match(general, /data-native-save[^>]*>Save</, 'the native form owns the save button');
assert.ok((general.match(/role="switch"/g) ?? []).length >= 4, 'boolean fields use native switches');

const retry = render('recovery');
assert.match(retry, /data-native-value[^>]*aria-label="Grace period \(ms\)"/);
assert.match(retry, /<textarea/);
assert.match(retry, /role="switch"[^>]*aria-label="Classify errors"/);

const prompts = render('prompts');
assert.equal((prompts.match(/<textarea/g) ?? []).length, 8, 'prompt fields stay editable textareas');

console.log('native settings form: primitives, segmented mode, native fields, textareas and invite ✅');
