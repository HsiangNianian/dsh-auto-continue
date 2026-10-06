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

let registration;
vm.runInNewContext(bundle, {
  AbortController,
  console,
  fetch: async () => {
    throw new Error('offline UI test');
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

function instantiate(reactModule = React) {
  return registration.factory((specifier) => {
    if (specifier === 'react') return reactModule;
    if (specifier === 'react/jsx-runtime') return jsxRuntime;
    if (specifier === '@deepseek-ai/dsh-client-store') return { createSnapshotStore };
    throw new Error(`unexpected UI dependency: ${specifier}`);
  });
}

let activeCategory = 'general';
const exported = instantiate({
  ...React,
  useState(initial) {
    const state = React.useState(initial);
    return initial === 'general' ? [activeCategory, state[1]] : state;
  },
});

let snapshot = {
  status: 'ready',
  value: { locale: 'en' },
  base: undefined,
  user: undefined,
  revision: 0,
  writable: true,
  mode: 'host',
};
const scope = {
  getSnapshot: () => snapshot,
  subscribe: () => () => {},
  async set(field, value) {
    snapshot = { ...snapshot, value: { ...snapshot.value, [field]: value } };
  },
  async unset() {},
};

let Card;
let face;
let dictionaries;
const ctx = {
  inject(deps, mount) {
    if (deps.every((name) => this[name])) mount(this);
  },
  effect(start) {
    return start();
  },
  locale: {
    getLocale: () => ({ active: 'en', locales: [], revision: 0 }),
    register: (_namespace, next) => {
      dictionaries = next;
      return () => {};
    },
  },
  on: () => () => {},
  settingsScope: { bind: () => scope },
  slots: {
    inject: (name, mount) => name === 'settings.plugin.item' ? mount() : () => {},
    register(spec, component) {
      Card = component;
      face = spec.inject();
      return () => {};
    },
  },
};
exported.apply(ctx);
assert.equal(typeof Card, 'function', 'public settings slot receives the card renderer');
assert.ok(face?.hooks?.autoContinueSettingsCard, 'public settings slot receives the card store');

function render(locale) {
  const store = face.hooks.autoContinueSettingsCard;
  return renderToStaticMarkup(React.createElement(Card, {
    ...face,
    t: (key) => dictionaries[locale][key],
    useAutoContinueSettingsCard: (select) => select(store.getSnapshot()),
  }));
}


for (const locale of ['en', 'zh']) {
  const html = render(locale);
  assert.match(html, /href="https:\/\/github\.com\/HsiangNianian\/dsh-auto-continue"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /HsiangNianian/);
  assert.match(html, /role="tablist"/);
  assert.equal([...html.matchAll(/role="tab"/g)].length, 6);
  assert.match(html, /role="tabpanel"/);
  assert.doesNotMatch(html, /dshAcJourney|pv-switcher|pv-root/);
  for (const button of html.matchAll(/<button\b[\s\S]*?<\/button>/g)) {
    assert.doesNotMatch(button[0], /<a\b/, 'external link must not be nested in a button');
  }
}
assert.match(render('zh'), /觉得好用的话，点个 Star 吧/);
assert.match(render('en'), /Finding it useful\? Leave a Star/);
assert.match(render('en'), /<button\b(?=[^>]*aria-label="Auto-continue")(?=[^>]*aria-checked="true")/);
face.edit('paused', 'true');
assert.match(render('en'), /<button\b(?=[^>]*aria-label="Auto-continue")(?=[^>]*aria-checked="false")/, 'positive switch correctly stages the inverse paused setting');
assert.match(render('en'), /dshAcStatus">Enabled</, 'header reports committed state until Save');
face.discard();

const expected = Object.entries(face.hooks.autoContinueSettingsCard.getSnapshot())
  .filter(([, value]) => value && typeof value === 'object' && 'text' in value).map(([key]) => key).sort();
const visible = [];
for (const category of ['general', 'recovery', 'startup', 'prompts', 'safety', 'status']) {
  activeCategory = category;
  for (const locale of ['en', 'zh']) {
    const html = render(locale);
    assert.match(html, new RegExp(`data-category="${category}"[^>]*aria-selected="true"`));
    assert.ok(html.includes(dictionaries[locale][`category.${category}.title`]));
    if (locale === 'en') visible.push(...[...html.matchAll(/data-field="([^"]+)"/g)].map(match => match[1]));
    if (category === 'recovery') assert.ok(html.includes(dictionaries[locale]['field.retryableErrorPatternsPlaceholder']));
    if (category === 'status') assert.ok(html.includes(dictionaries[locale]['stats.empty']));
  }
}
assert.deepEqual(visible.sort(), expected, 'each existing configuration field is reachable exactly once');

activeCategory = 'general';
face.edit('cooldownMs', 'not a number');
face.edit('continueText', 'Keep this draft');
assert.match(render('en'), /data-category="recovery"[^>]*aria-label="Retry strategy:/, 'invalid fields remain discoverable in an inactive category');
assert.match(render('en'), /class="dshAcSave" disabled=""/);
activeCategory = 'prompts';
assert.match(render('en'), />Keep this draft<\/textarea>/, 'category changes preserve drafts');
face.discard();
assert.doesNotMatch(render('en'), />Keep this draft<\/textarea>/);
console.log('category settings UI, staged switches, and GitHub invitation ✅');
