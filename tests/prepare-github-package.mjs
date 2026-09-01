import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  GITHUB_PACKAGE_NAME,
  prepareGitHubPackage,
  SOURCE_PACKAGE_NAME,
} from '../scripts/prepare-github-package.mjs';

function makeFixture(patchName = SOURCE_PACKAGE_NAME) {
  const root = mkdtempSync(join(tmpdir(), 'auto-continue-github-package-'));
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify({ name: SOURCE_PACKAGE_NAME, version: '1.2.3', private: false }, null, 2)}\n`,
  );
  writeFileSync(
    join(root, 'cordis.patch.yml'),
    `- insert:\n    - id: auto-continue\n      name: '${patchName}'\n`,
  );
  return root;
}

const root = makeFixture();
const result = prepareGitHubPackage(root);
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8');

assert.deepEqual(result, {
  sourceName: SOURCE_PACKAGE_NAME,
  packageName: GITHUB_PACKAGE_NAME,
});
assert.equal(manifest.name, GITHUB_PACKAGE_NAME);
assert.equal(manifest.version, '1.2.3');
assert.match(patch, new RegExp(`name: '${GITHUB_PACKAGE_NAME.replace('/', '\\/')}'`));
assert.doesNotMatch(patch, new RegExp(`name: '${SOURCE_PACKAGE_NAME}'`));

const invalidRoot = makeFixture('some-other-plugin');
assert.throws(
  () => prepareGitHubPackage(invalidRoot),
  /Cordis patch must reference dsh-client-auto-continue exactly once/,
);
assert.equal(
  JSON.parse(readFileSync(join(invalidRoot, 'package.json'), 'utf8')).name,
  SOURCE_PACKAGE_NAME,
  'validation failure must not partially rewrite the manifest',
);

console.log('GitHub Packages manifest transform ✅');
