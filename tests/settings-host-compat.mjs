import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { linkOrCopy } from './link-or-copy.mjs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testsRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(testsRoot, '..');
const fixtureRoot = mkdtempSync(join(tmpdir(), 'auto-continue-settings-compat-'));

try {
  mkdirSync(join(fixtureRoot, 'pkg'), { recursive: true });
  mkdirSync(join(fixtureRoot, 'node_modules', '@deepseek-ai'), { recursive: true });

  for (const packageName of ['cordis', 'schemastery', 'cosmokit']) {
    linkOrCopy(
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
  class MemorySettings extends SettingsProvider {
    writable = true;
    async load() {
      return { 'auto-continue': { paused: true, verbose: false, scanOnBoot: false, graceMs: 5, cooldownMs: 0 } };
    }
    async persist() {}
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
    await ctx.plugin(MemorySettings);
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
    await fiber.dispose();
    assert.equal(ctx.settings.get('auto-continue'), undefined);
    assert.equal(routes.size, 0);
    console.log('Legacy settings registration, live edits and teardown ✅');
  } finally {
    await ctx.fiber.dispose();
  }
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
