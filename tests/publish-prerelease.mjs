import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';

const workflow = parse(readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8'));
const steps = workflow.jobs.publish.steps;
const root = mkdtempSync(join(tmpdir(), 'auto-continue-release-'));
try {
  for (const [version, tag] of [['0.17.1', 'latest'], ['0.17.1-rc.1', 'next']]) {
    const cwd = join(root, version);
    for (const dir of ['bin', 'dist', 'docs/releases', 'scripts']) mkdirSync(join(cwd, dir), { recursive: true });
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'dsh-client-auto-continue', version }));
    writeFileSync(join(cwd, 'cordis.patch.yml'), "- insert:\n    - id: auto-continue\n      name: 'dsh-client-auto-continue'\n");
    writeFileSync(join(cwd, `docs/releases/v${version}.md`), 'Reviewed release notes\n');
    writeFileSync(join(cwd, 'dist/package.tgz'), 'test archive');
    writeFileSync(join(cwd, 'dist/package.zip'), 'test archive');
    copyFileSync(new URL('../scripts/prepare-github-package.mjs', import.meta.url), join(cwd, 'scripts/prepare-github-package.mjs'));
    for (const command of ['npm', 'gh']) {
      writeFileSync(join(cwd, 'bin', command), `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
appendFileSync(process.env.PUBLISH_COMMAND_LOG, JSON.stringify([${JSON.stringify(command)}, ...process.argv.slice(2)]) + '\\n');
`, { mode: 0o755 });
    }
    const env = {
      ...process.env, PATH: `${join(cwd, 'bin')}:${process.env.PATH}`,
      GITHUB_REF_NAME: `v${version}`, GITHUB_ENV: join(cwd, 'github-env'),
      PUBLISH_COMMAND_LOG: join(cwd, 'commands.jsonl'), archive: 'package.zip',
    };
    const run = name => {
      const step = steps.find(step => step.name === name);
      assert(step?.run, name);
      execFileSync('bash', ['-eo', 'pipefail', '-c', step.run], { cwd, env, stdio: 'pipe' });
    };
    run('Verify version and release notes');
    Object.assign(env, Object.fromEntries(readFileSync(env.GITHUB_ENV, 'utf8').trim().split('\n').map(line => line.split('='))));
    assert.equal(env.RELEASE_DIST_TAG, tag);
    run('Publish to npm');
    run('Publish to GitHub Packages');
    run('Create GitHub Release with artifacts');
    const commands = readFileSync(env.PUBLISH_COMMAND_LOG, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(commands.slice(0, 2), Array.from({ length: 2 }, () => ['npm', 'publish', '--access', 'public', '--tag', tag]));
    const release = commands[2];
    assert.deepEqual(release.slice(0, 4), ['gh', 'release', 'create', `v${version}`]);
    assert.equal(release.includes('--prerelease'), tag === 'next');
    assert.equal(release.includes('--latest=false'), tag === 'next');
    assert.equal(release[release.indexOf('--notes-file') + 1], `docs/releases/v${version}.md`);
  }
  console.log('Stable and prerelease publishing use separate dist-tags and reviewed notes ✅');
} finally {
  rmSync(root, { recursive: true, force: true });
}
