/** Exercise a published DSH cohort's Settings, Loader and HTTP services together. */
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';

const project = fileURLToPath(new URL('../', import.meta.url));
const cohort = process.argv[2] ?? '0.1.7';
const modules = join(project, `tests/fixtures/dsh-${cohort}/node_modules`);
const runtimeVersion = JSON.parse(readFileSync(join(modules, '@deepseek-ai/dsh-settings/package.json'), 'utf8')).version;
const load = (name) => import(pathToFileURL(join(modules, '@deepseek-ai', name, 'lib/index.js')).href);
const { Context } = await load('cordis');
const { default: Loader } = await load('cordis-plugin-loader');
const { default: Settings } = await load('dsh-settings');
const { default: WebServer } = await load('dsh-host-webserver');
const fixture = mkdtempSync(join(tmpdir(), 'auto-continue-live-settings-'));
mkdirSync(join(fixture, 'lib'));
copyFileSync(join(project, 'lib/index.js'), join(fixture, 'lib/index.js'));
copyFileSync(join(project, 'package.json'), join(fixture, 'package.json'));
symlinkSync(modules, join(fixture, 'node_modules'), 'dir');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ctx = new Context();
const base = { scanOnBoot: false, verbose: false, graceMs: 40, cooldownMs: 0 };
const followups = [];
const session = { id: 'settings-test', header: {}, snapshotEvents: () => [] };
const agent = { session, inbox: { nextTurn: [] }, followup: (message) => followups.push(message) };
const end = (turn) => ctx.emit('session/event', session, {
  type: 'turn/end', seq: turn * 10, time: Date.now(), data: { turn, reason: { kind: 'max-tokens' } },
});

try {
  await ctx.plugin(Loader);
  ctx.provide('profileContext', { name: 'test', home: fixture });
  // The persistence boundary is in memory; real Loader updates still parse and
  // publish live config references exactly as a profile edit does.
  ctx.provide('configEditor', {
    documentPath: join(fixture, 'profile.yml'),
    entries: () => [...ctx.loader.entries()],
    configuration: () => [...ctx.loader.entries()].map((entry) => ({ entry, inherited: base, override: entry.options.config })),
    async edit(entry, change) {
      await ctx.loader.update(entry.id, { config: change(entry.options.config ?? {}, base) });
      await ctx.loader.await();
    },
  });
  ctx.provide('agents', { list: () => [], get: (id) => id === session.id ? agent : undefined });
  await ctx.plugin(Settings);
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 });
  await ctx.loader.create({ id: 'auto-continue', name: pathToFileURL(join(fixture, 'lib/index.js')).href, config: base });
  await ctx.loader.await();
  const entry = ctx.loader.resolve('auto-continue');
  const uid = entry.fiber.uid;
  const form = () => ctx.settings.describe().find((row) => row.ns === 'auto-continue');
  assert.ok(form(), `the plugin exposes its settings in DSH ${runtimeVersion}`);
  assert.equal(form().value.paused, false);

  if (cohort === '0.2.1-rc.2') {
    const cordis = await load('cordis');
    const store = await load('dsh-client-store');
    const client = new Context();
    const entries = new Map();
    const wire = value => JSON.parse(JSON.stringify(value));
    const transport = {
      describe: async () => ({ ok: true, value: wire({ namespaces: ctx.settings.describe(), writable: ctx.settings.writable }) }),
      mutate: async (ns, ops, revision) => {
        await ctx.settings.mutate(ns, ops, revision);
        return { ok: true, value: wire(ctx.settings.describe().find(row => row.ns === ns)) };
      },
    };
    function browserModule(path) {
      let registration;
      vm.runInNewContext(readFileSync(path, 'utf8'), {
        AbortController, console, TextDecoder, URL, structuredClone, setTimeout, clearTimeout,
        fetch: async () => { throw new Error('HTTP bridge is tested separately'); },
        window: { __ModuleLoader__: { load: value => { registration = value; } } },
      });
      return registration.factory(name => {
        if (name === '@deepseek-ai/cordis') return cordis;
        if (name === '@deepseek-ai/dsh-client-store') return store;
        if (name === 'react') return React;
        if (name === 'react/jsx-runtime') return jsxRuntime;
        throw new Error(`Unexpected client module: ${name}`);
      });
    }
    client.provide('remote', { settings: transport, $on: () => () => {} });
    client.provide('remote.settings', transport);
    client.provide('locale', { getLocale: () => ({ active: 'en' }), register: () => () => {} });
    client.provide('slots', {
      inject(name, mount) { return ['plugins.bundle.config', 'conversation.input.left'].includes(name) ? client.effect(mount) : () => {}; },
      register(options) { entries.set(options.name, options.inject()); return () => entries.delete(options.name); },
    });
    try {
      await client.plugin(browserModule(join(modules, '@deepseek-ai/dsh-client-ui-settings/lib/client.js')));
      await client.plugin(browserModule(join(project, 'lib/client.js')));
      const flush = () => new Promise(resolve => setImmediate(resolve));
      for (let n = 0; n < 10; n++) await flush();
      const scope = client.configForms.get('auto-continue');
      assert.equal(scope.getSnapshot().status, 'ready');
      assert.equal(Object.hasOwn(scope.getSnapshot(), 'mode'), false, 'use the actual rc.2 snapshot contract');
      assert.equal(form().value.locale, 'en', 'locale mirror writes through the real form');
      const card = entries.get('plugins.bundle.config');
      card.edit('showComposerToggle', 'false');
      card.save();
      for (let n = 0; n < 10; n++) await flush();
      assert.equal(form().value.showComposerToggle, false);
      assert.equal(card.hooks.autoContinueSettingsCard.getSnapshot().dirty, false);
      await client.configForms.describe().load();
      assert.equal(scope.getSnapshot().value.showComposerToggle, false, 'a fresh Host read retains the saved setting');
      entries.get('conversation.input.left').setEnabled(false);
      for (let n = 0; n < 10; n++) await flush();
      assert.equal(form().value.paused, true, 'composer switch writes through the real form');
      card.resetField('showComposerToggle');
      card.save();
      for (let n = 0; n < 10; n++) await flush();
      assert.equal(form().value.showComposerToggle, true);
      await scope.set('paused', false);
    } finally {
      await client.fiber.dispose();
    }
    console.log('DSH rc.2 actual client forms: card save/reset, composer toggle, locale mirror and reload ✅');
  }

  const bridge = await fetch(`http://127.0.0.1:${ctx.webServer.port}/api/auto-continue-bridge`);
  assert.equal(bridge.status, 200);
  const reader = bridge.body.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /"type":"state"/);
  await reader.cancel();

  end(1);
  await ctx.settings.update('auto-continue', { paused: true });
  await sleep(80);
  assert.equal(followups.length, 0, 'pausing cancels an already queued continuation');
  assert.equal(entry.fiber.uid, uid, 'settings edits keep the same engine instance');
  await ctx.settings.update('auto-continue', { paused: false, locale: 'en', continueTextMaxTokens: 'Keep going' });
  end(2);
  await sleep(80);
  assert.equal(followups.length, 1);
  assert.equal(followups[0].content[0].text, 'Keep going', 'the engine reads the latest live text');
  assert.equal(entry.fiber.uid, uid);
  await ctx.settings.mutate('auto-continue', [{ op: 'unset', path: ['continueTextMaxTokens'] }]);
  end(3);
  await sleep(80);
  assert.equal(followups[1].content[0].text, 'Continue', 'reset restores the localized default');
  await ctx.loader.remove('auto-continue');
  assert.equal(form(), undefined, 'removing the plugin withdraws its settings');
  const removed = await fetch(`http://127.0.0.1:${ctx.webServer.port}/api/auto-continue-bridge`);
  assert.equal(removed.status, 404, 'removing the plugin withdraws the HTTP route');
  await removed.text();
  console.log(`DSH ${runtimeVersion} settings, live edits, HTTP bridge and teardown ✅`);
} finally {
  await ctx.fiber.dispose();
  rmSync(fixture, { recursive: true, force: true });
}
