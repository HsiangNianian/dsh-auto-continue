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

const exported = instantiate();

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
    inject: (_name, mount) => mount(),
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

const en = render('en');
assert.match(en, /Continuity relay/);
assert.match(en, /Interrupted/);
assert.match(en, /Safe pause/);
assert.match(en, />Continue</);
assert.match(en, /Star on GitHub/);
assert.match(en, /HsiangNianian\/dsh-auto-continue/);
assert.match(en, /href="https:\/\/github\.com\/HsiangNianian\/dsh-auto-continue"/);
assert.match(en, /target="_blank"/);
assert.match(en, /rel="noreferrer"/);
for (const button of en.matchAll(/<button\b[\s\S]*?<\/button>/g)) {
  assert.doesNotMatch(button[0], /<a\b/, 'external link must not be nested inside the disclosure button');
}

const zh = render('zh');
assert.match(zh, /中断接力器/);
assert.match(zh, /检测中断/);
assert.match(zh, /安全等待/);
assert.match(zh, /发送继续/);
assert.match(zh, /去 GitHub 点 Star/);

const openReact = {
  ...React,
  useState(initial) {
    const state = React.useState(initial);
    return initial === false ? [true, state[1]] : state;
  },
};
const openExported = instantiate(openReact);
let OpenCard;
let openFace;
openExported.apply({
  ...ctx,
  slots: {
    ...ctx.slots,
    register(spec, component) {
      OpenCard = component;
      openFace = spec.inject();
      return () => {};
    },
  },
});
const openStore = openFace.hooks.autoContinueSettingsCard;
function renderOpen(locale) {
  return renderToStaticMarkup(React.createElement(OpenCard, {
    ...openFace,
    t: (key) => dictionaries[locale][key],
    useAutoContinueSettingsCard: (select) => select(openStore.getSnapshot()),
  }));
}

const expandedEn = renderOpen('en');
for (const heading of ['The handoff', 'Safety rhythm', 'Recovery radar', 'Loop breaker', 'Live signal']) {
  assert.match(expandedEn, new RegExp(`>${heading}<`));
}
assert.match(expandedEn, /placeholder="For example: Upstream rejected the request as invalid"/);

const expandedZh = renderOpen('zh');
for (const heading of ['接力方式', '安全节奏', '恢复雷达', '循环断路器', '现场状态']) {
  assert.match(expandedZh, new RegExp(`>${heading}<`));
}
assert.match(expandedZh, /placeholder="例如：Upstream rejected the request as invalid"/);

console.log('settings card relay + GitHub CTA ✅');
