/** Exercise a published DSH cohort's Settings, Loader and HTTP services together. */
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
