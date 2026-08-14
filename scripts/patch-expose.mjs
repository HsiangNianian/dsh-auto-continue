#!/usr/bin/env node
/**
 * Vendor patch for a known DSH limitation (0.1.0-rc.6):
 *
 * The web plugin-configuration section only exposes settings namespaces listed
 * in `WEB_SETTINGS_NAMESPACES`, hardcoded in the installed
 * `@deepseek-ai/dsh-host-apiproxy` bundle ("adding a section to that page is a
 * decision made here rather than by the registering plugin. Moving that
 * declaration to `settings.register()` ... is deferred work"). Without this
 * patch the browser half of a third-party plugin's settings card reads
 * `settings-not-exposed` and renders nothing.
 *
 * This script adds the `auto-continue` namespace to that allowlist in EVERY
 * reachable dsh installation: the profile-linked copy (pnpm store / npx cache)
 * and a global `npm i -g @deepseek-ai/dsh` install under the active Node
 * version, plus the invoking directory's own install. It is idempotent:
 * re-running it after any dsh reinstall reapplies the patch to the copies
 * that lack it.
 *
 * Usage: node scripts/patch-expose.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

/** The namespace this plugin's settings card edits. */
const NS = 'auto-continue';

/**
 * Collect candidate dsh-host-apiproxy package.json paths: the profile-linked
 * copy, a global install under the active Node version (nvm layout), and the
 * invoking directory's own install. Deduplicated by real path.
 */
function candidatePackageJsons() {
  const found = new Set();
  const add = (pkgJson) => {
    try {
      found.add(realpathSync(pkgJson));
    } catch {
      /* candidate not present */
    }
  };
  const tryResolve = (requireFn) => {
    try {
      add(requireFn.resolve('@deepseek-ai/dsh-host-apiproxy/package.json'));
    } catch {
      /* not resolvable from this anchor */
    }
  };

  // 1. The copy the profile's node_modules links to.
  tryResolve(createRequire(join(homedir(), '.dsh', 'profiles', 'web', 'package.json')));
  // 2. A global install under the active Node version's nvm layout
  //    (`<nvm>/<version>/lib/node_modules/@deepseek-ai/dsh`).
  try {
    const globalRoot = realpathSync(join(process.execPath, '..', '..', 'lib', 'node_modules'));
    tryResolve(createRequire(join(globalRoot, '@deepseek-ai', 'dsh', 'package.json')));
  } catch {
    /* not an nvm-style global root */
  }
  // 3. The invoking directory's own install.
  tryResolve(createRequire(join(process.cwd(), 'package.json')));
  return [...found];
}

const candidates = candidatePackageJsons();
if (candidates.length === 0) {
  console.error('[patch-expose] could not resolve any @deepseek-ai/dsh-host-apiproxy installation');
  process.exit(1);
}

let patchedAny = false;
for (const packageJson of candidates) {
  const bundlePath = join(dirname(packageJson), 'lib', 'index.js');
  const source = readFileSync(bundlePath, 'utf8');
  if (source.includes(`"${NS}"`)) {
    console.log(`[patch-expose] ${NS} already present in ${bundlePath} — skipped.`);
    continue;
  }
  const marker = `\t"web-search-deepseek"\n];`;
  if (!source.includes(marker)) {
    console.error(`[patch-expose] could not locate the WEB_SETTINGS_NAMESPACES tail in ${bundlePath}`);
    continue;
  }
  const patched = source.replace(marker, `\t"web-search-deepseek",\n\t"${NS}"\n];`);
  writeFileSync(bundlePath, patched);
  patchedAny = true;
  console.log(`[patch-expose] added "${NS}" to WEB_SETTINGS_NAMESPACES in ${bundlePath}`);
}

if (patchedAny) console.log('[patch-expose] restart `dsh web` for the change to take effect.');
