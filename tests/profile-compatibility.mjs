/** Exercise the DSH 0.2 profile admission gate before any plugin code loads. */
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const runtime = join(project, 'tests/fixtures/dsh-0.2.0');
const { evaluatePluginCompatibility, getDshRuntimeVersion, loadProfileDirectory } = await import(
  pathToFileURL(join(runtime, 'node_modules/@deepseek-ai/dsh-app-boot/lib/index.js')).href
);
assert.equal(getDshRuntimeVersion(), '0.2.0-rc.1');
const manifest = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'));
const fixture = mkdtempSync(join(tmpdir(), 'auto-continue-profile-compat-'));
const bundle = join(fixture, 'node_modules', manifest.name);
const load = () => loadProfileDirectory('dsh', fixture, join(runtime, 'package.json'));

try {
  mkdirSync(bundle, { recursive: true });
  writeFileSync(join(fixture, 'package.json'), JSON.stringify({
    name: 'auto-continue-profile-test', private: true,
    dsh: { profile: { bundles: [manifest.name] } },
  }));
  copyFileSync(join(project, 'cordis.patch.yml'), join(bundle, 'cordis.patch.yml'));

  // #50: even an optional DSH peer is checked; the old manifest skips the
  // entire bundle before either the host engine or the client can activate.
  const oldManifest = structuredClone(manifest);
  oldManifest.peerDependencies['@deepseek-ai/dsh-settings'] = '^0.1.0-rc.7 || ^0.1.7-0';
  writeFileSync(join(bundle, 'package.json'), JSON.stringify(oldManifest));
  const rejected = load();
  assert.equal(rejected.layers.length, 0);
  assert.equal(rejected.skippedBundles.length, 1);
  assert.match(rejected.skippedBundles[0].reason, /incompatible with dsh 0\.2\.0-rc\.1/);

  // The actual release manifest must load without compatibility exemptions.
  copyFileSync(join(project, 'package.json'), join(bundle, 'package.json'));
  const accepted = load();
  assert.deepEqual(accepted.skippedBundles, [], 'the release must pass the DSH profile gate');
  assert.equal(accepted.layers.length, 1);
  assert.equal(accepted.layers[0].packageName, manifest.name);
  assert.ok(accepted.layers[0].patches.length > 0, 'the host plugin row is admitted');
  for (const version of ['0.1.0-rc.7', '0.1.7-rc.2', '0.2.0-rc.1', '0.2.0']) {
    assert.equal(evaluatePluginCompatibility(manifest, {}, version), undefined, version);
  }
  assert.ok(evaluatePluginCompatibility(manifest, {}, '0.3.0'), 'future minor versions need review');
  console.log('DSH 0.2 profile admission, optional-peer rejection and supported versions ✅');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
