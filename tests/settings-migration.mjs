/** Legacy-file migration through real rc.2 Config, Loader and Settings services. */
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const modules = join(project, 'tests/fixtures/dsh-0.2.1-rc.2/node_modules');
const load = name => import(pathToFileURL(join(modules, '@deepseek-ai', name, 'lib/index.js')));
const { Context } = await load('cordis');
const { default: Loader } = await load('cordis-plugin-loader');
const { default: Settings } = await load('dsh-settings');
const fixture = mkdtempSync(join(tmpdir(), 'auto-continue-migration-'));
mkdirSync(join(fixture, 'lib'));
copyFileSync(join(project, 'lib/index.js'), join(fixture, 'lib/index.js'));
copyFileSync(join(project, 'package.json'), join(fixture, 'package.json'));
symlinkSync(modules, join(fixture, 'node_modules'), 'dir');
const plugin = pathToFileURL(join(fixture, 'lib/index.js')).href;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  for (let n = 0; n < 100 && !check(); n++) await sleep(10);
  assert.ok(check(), 'migration settled within one second');
}
const base = { scanOnBoot: false, verbose: false, graceMs: 1, cooldownMs: 0, locale: 'en' };
const source = 'auto-continue:\n  paused: true\n  continueTextMaxTokens: My saved prompt\n  cooldownMs: 99\n  futureOption: keep in old file\nother-plugin:\n  password: leave alone\n';

async function host(options = {}) {
  const ctx = new Context();
  const home = options.home ?? mkdtempSync(join(fixture, 'home-'));
  const legacy = join(home, 'settings-legacy.yaml');
  const profile = join(home, 'profile.json');
  if (options.source !== undefined) writeFileSync(legacy, options.source);
  if (options.unreadable) mkdirSync(legacy);
  const followups = [];
  let edits = 0;
  let turn = 0;
  const session = { id: 'migration', header: {}, snapshotEvents: () => [] };
  const agent = { session, inbox: { nextTurn: [] }, followup: message => followups.push(message) };
  await ctx.plugin(Loader);
  ctx.provide('profileContext', { name: 'test', home });
  const editor = {
    documentPath: profile,
    entries: () => [...ctx.loader.entries()],
    configuration: () => [...ctx.loader.entries()].map(entry => ({ entry, inherited: base, override: entry.options.config })),
    async edit(entry, change) {
      edits++;
      if (options.beforeEdit) await options.beforeEdit();
      if (options.failWrite) throw new Error('simulated read-only profile');
      // Model a concurrent edit arriving before the profile's write lock.
      const next = change({ ...entry.options.config, ...options.concurrent });
      // This test's disk boundary is JSON; the Loader and Settings are real.
      writeFileSync(profile, JSON.stringify(next));
      await ctx.loader.update(entry.id, { config: next });
      await ctx.loader.await();
      ctx.emit('app-boot/config-reload');
    },
  };
  if (!options.lateEditor) ctx.provide('configEditor', editor);
  ctx.provide('agents', { list: () => [], get: () => agent });
  ctx.provide('webServer', { register: () => () => {} });
  await ctx.plugin(Settings);
  await ctx.loader.create({ id: 'auto-continue', name: plugin, config: { ...base, ...options.config } });
  await ctx.loader.await();
  return {
    ctx, home, legacy, profile, followups,
    provideEditor: () => ctx.provide('configEditor', editor),
    edits: () => edits,
    value: () => ctx.settings?.describe().find(row => row.ns === 'auto-continue')?.value,
    end: () => ctx.emit('session/event', session, {
      type: 'turn/end', seq: ++turn * 10, time: Date.now(), data: { turn, reason: { kind: 'max-tokens' } },
    }),
    close: () => ctx.fiber.dispose(),
  };
}

try {
  const migrated = await host({ source });
  try {
    await until(() => migrated.value()?._legacySettingsImported === true);
    assert.equal(migrated.value().paused, true);
    assert.equal(migrated.value().continueTextMaxTokens, 'My saved prompt');
    assert.equal(migrated.value().cooldownMs, 0, 'existing profile config wins');
    assert.equal(migrated.ctx.loader.resolve('auto-continue').options.config.futureOption, undefined);
    assert.equal(readFileSync(migrated.legacy, 'utf8'), source, 'all legacy bytes remain intact');
    migrated.end();
    await sleep(30);
    assert.equal(migrated.followups.length, 0, 'imported pause controls the engine');
    await migrated.ctx.settings.update('auto-continue', { paused: false });
    migrated.end();
    await until(() => migrated.followups.length === 1);
    assert.equal(migrated.followups[0].content[0].text, 'My saved prompt');
    await migrated.ctx.settings.mutate('auto-continue', [{ op: 'unset', path: ['continueTextMaxTokens'] }]);
  } finally { await migrated.close(); }
  const restarted = await host({ home: migrated.home, config: JSON.parse(readFileSync(migrated.profile, 'utf8')) });
  try {
    assert.equal(restarted.value().paused, false);
    assert.equal(restarted.value().continueTextMaxTokens, '');
    assert.equal(restarted.edits(), 0, 'a fresh host does not reimport reset values');
  } finally { await restarted.close(); }
  console.log('Legacy pause/prompt import, profile precedence, engine behavior and restart after reset ✅');

  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const waiting = await host({ source, beforeEdit: () => gate, concurrent: { continueTextMaxTokens: 'New profile edit' } });
  try {
    await until(() => waiting.edits() === 1);
    waiting.end();
    await sleep(30);
    assert.equal(waiting.followups.length, 0, 'recovery waits while migration is pending');
    release();
    await until(() => waiting.value()?._legacySettingsImported === true);
    assert.equal(waiting.value().continueTextMaxTokens, 'New profile edit');
  } finally { release(); await waiting.close(); }
  console.log('Pending migration holds recovery and retains concurrent profile edits ✅');

  const delayed = await host({ source, lateEditor: true });
  try {
    delayed.end();
    await sleep(30);
    assert.equal(delayed.followups.length, 0, 'profile recovery waits for a late editor');
    delayed.provideEditor();
    await until(() => delayed.value()?._legacySettingsImported === true);
    assert.equal(delayed.value().paused, true);
  } finally { await delayed.close(); }
  console.log('Late profile editor cannot briefly enable recovery before importing a pause ✅');

  for (const [name, options] of [
    ['invalid YAML', { source: 'auto-continue: [broken' }],
    ['invalid section', { source: 'auto-continue: [true]' }],
    ['invalid setting', { source: 'auto-continue:\n  paused: not-a-boolean\n' }],
    ['unreadable file', { unreadable: true }],
    ['failed profile write', { source, failWrite: true }],
  ]) {
    const broken = await host(options);
    try {
      await sleep(60);
      broken.end();
      await sleep(30);
      assert.equal(broken.followups.length, 0, name);
      assert.equal(broken.value()._legacySettingsImported, false, name);
      if (options.source) assert.equal(readFileSync(broken.legacy, 'utf8'), options.source, name);
    } finally { await broken.close(); }
  }
  console.log('Malformed/unreadable legacy data and failed saves preserve files and hold recovery ✅');

  for (const options of [{}, { source: '' }, { source: '# no settings yet\n' }, { source: 'other-plugin: {}' }, { source: 'broken: [', config: { _legacySettingsImported: true } }]) {
    const clean = await host(options);
    try {
      await sleep(30);
      clean.end();
      await until(() => clean.followups.length === 1);
      assert.equal(clean.edits(), 0);
    } finally { await clean.close(); }
  }
  console.log('Missing legacy section and completed migrations need no profile write ✅');

  let finish;
  const unloading = await host({ source, beforeEdit: () => new Promise(resolve => { finish = resolve; }) });
  await until(() => unloading.edits() === 1);
  await unloading.ctx.loader.remove('auto-continue');
  finish();
  await sleep(30);
  assert.throws(() => readFileSync(unloading.profile), { code: 'ENOENT' });
  await unloading.close();
  console.log('Unload during migration prevents a late profile write ✅');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
