import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SOURCE_PACKAGE_NAME = 'dsh-client-auto-continue';
export const GITHUB_PACKAGE_NAME = '@hsiangnianian/dsh-auto-continue';

const sourceEntry = `name: '${SOURCE_PACKAGE_NAME}'`;
const githubEntry = `name: '${GITHUB_PACKAGE_NAME}'`;

/** Rewrite the publish-only package identity and its DSH loader row together. */
export function prepareGitHubPackage(root) {
  const manifestPath = join(root, 'package.json');
  const patchPath = join(root, 'cordis.patch.yml');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const patch = readFileSync(patchPath, 'utf8');

  if (manifest.name !== SOURCE_PACKAGE_NAME) {
    throw new Error(`Expected package name ${SOURCE_PACKAGE_NAME}, received ${String(manifest.name)}`);
  }

  const entryCount = patch.split(sourceEntry).length - 1;
  if (entryCount !== 1) {
    throw new Error(`Cordis patch must reference ${SOURCE_PACKAGE_NAME} exactly once`);
  }

  manifest.name = GITHUB_PACKAGE_NAME;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(patchPath, patch.replace(sourceEntry, githubEntry));

  return { sourceName: SOURCE_PACKAGE_NAME, packageName: GITHUB_PACKAGE_NAME };
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const root = process.argv[2] ? resolve(process.argv[2]) : resolve(dirname(scriptPath), '..');
  const result = prepareGitHubPackage(root);
  console.log(`Prepared ${result.packageName} from ${result.sourceName}`);
}
