import assert from 'node:assert/strict';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
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
  console.log('Host bundle supports DSH settings alpha.2+ export surface ✅');
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
