import assert from 'node:assert/strict';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testsRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(testsRoot, '..');
const fixtureRoot = mkdtempSync(join(tmpdir(), 'auto-continue-settings-compat-'));

try {
  mkdirSync(join(fixtureRoot, 'pkg'), { recursive: true });
  mkdirSync(join(fixtureRoot, 'node_modules', '@deepseek-ai'), { recursive: true });

  for (const packageName of ['cordis', 'schemastery']) {
    symlinkSync(
      join(projectRoot, 'node_modules', '@deepseek-ai', packageName),
      join(fixtureRoot, 'node_modules', '@deepseek-ai', packageName),
      'dir',
    );
  }

  const settingsRoot = join(fixtureRoot, 'node_modules', '@deepseek-ai', 'dsh-settings');
  mkdirSync(settingsRoot, { recursive: true });
  writeFileSync(
    join(settingsRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: '@deepseek-ai/dsh-settings',
        version: '0.1.2-alpha.3',
        type: 'module',
        exports: './index.js',
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(settingsRoot, 'index.js'),
    [
      'export class SettingsConflictError extends Error {}',
      'export class SettingsProvider {}',
      'export function redactSecrets(value) { return value; }',
      'export default SettingsProvider',
      '',
    ].join('\n'),
  );

  writeFileSync(join(fixtureRoot, 'package.json'), '{"type":"module"}\n');
  copyFileSync(join(projectRoot, 'lib', 'index.js'), join(fixtureRoot, 'pkg', 'index.js'));

  const loaded = await import(pathToFileURL(join(fixtureRoot, 'pkg', 'index.js')).href);
  assert.equal(typeof loaded.apply, 'function');
  console.log('Host bundle loads without a dependency on the legacy settings surface ✅');

  const { Context } = await import('@deepseek-ai/cordis');
  const { SettingsProvider } = await import('@deepseek-ai/dsh-settings');
  const settingsFile = join(fixtureRoot, 'settings.json');
  writeFileSync(settingsFile, JSON.stringify({ 'auto-continue': { paused: true, verbose: false, scanOnBoot: false, graceMs: 5, cooldownMs: 0 } }));
  class FileSettings extends SettingsProvider {
    writable = true;
    async load() {
      return JSON.parse(readFileSync(settingsFile, 'utf8'));
    }
    async persist(ns, section) {
      const document = JSON.parse(readFileSync(settingsFile, 'utf8'));
      writeFileSync(settingsFile, JSON.stringify({ ...document, [ns]: section }));
    }
  }
  const ctx = new Context();
  const routes = new Map();
  const sent = [];
  const session = { id: 'legacy', header: {} };
  ctx.provide('agents', { list: () => [], get: () => ({ inbox: { nextTurn: [] }, followup: (message) => sent.push(message) }) });
  ctx.provide('webServer', {
    register(route) { routes.set(route.path, route); return () => routes.delete(route.path); },
  });
  try {
    await ctx.plugin(FileSettings);
    const fiber = ctx.plugin(loaded);
    await fiber;
    assert.equal(ctx.settings.get('auto-continue').paused, true, 'legacy stored settings are registered');
    const end = (turn) => ctx.emit('session/event', session, {
      type: 'turn/end', seq: turn * 10, time: Date.now(), data: { turn, reason: { kind: 'max-tokens' } },
    });
    end(1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(sent.length, 0, 'the legacy pause still prevents sends');
    await ctx.settings.update('auto-continue', { paused: false, continueTextMaxTokens: 'Legacy text' });
    end(2);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(sent[0].content[0].text, 'Legacy text', 'legacy live updates reach the engine');
    const result = await new Promise(resolve => {
      const handlers = new Map();
      routes.get('/api/auto-continue-action').handler({ on(name, handler) { handlers.set(name, handler); } }, {
        writeHead() {}, end(body) { resolve(JSON.parse(body)); },
      });
      handlers.get('data')(Buffer.from(JSON.stringify({ action: 'set-session-mode', sessionId: 'legacy', mode: 'off' })));
      handlers.get('end')();
    });
    assert.equal(result.ok, true);
    assert.equal(JSON.parse(readFileSync(settingsFile, 'utf8'))['auto-continue'].sessionModes.legacy, 'off');
    await fiber.dispose();
    assert.equal(ctx.settings.get('auto-continue'), undefined);
    assert.equal(routes.size, 0);
    console.log('Legacy settings registration, live edits and teardown ✅');
  } finally {
    await ctx.fiber.dispose();
  }
  const restarted = new Context();
  restarted.provide('agents', { list: () => [], get: () => ({ inbox: { nextTurn: [] }, followup: () => assert.fail('off must survive restart') }) });
  restarted.provide('webServer', { register() { return () => {}; } });
  try {
    await restarted.plugin(FileSettings);
    await restarted.plugin(loaded);
    assert.equal(restarted.settings.get('auto-continue').sessionModes.legacy, 'off');
    restarted.emit('session/event', session, { type: 'turn/end', seq: 30, time: Date.now(), data: { turn: 3, reason: { kind: 'max-tokens' } } });
    await new Promise(resolve => setTimeout(resolve, 20));
    console.log('Legacy session mode persists to disk and survives a fresh host context ✅');
  } finally { await restarted.fiber.dispose(); }
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
