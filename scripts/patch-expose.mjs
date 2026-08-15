#!/usr/bin/env node
/**
 * Vendor patch for a known DSH limitation (0.1.0-rc.6):
 *
 * The web settings surface only exposes namespaces listed in the hardcoded
 * `WEB_SETTINGS_NAMESPACES` / `PRODUCT_SETTINGS_NAMESPACES` allowlists inside
 * the installed `@deepseek-ai/dsh-host-apiproxy` bundle. Any other registered
 * namespace answers `settings-not-exposed`, so a third-party plugin's settings
 * section renders nothing even though its namespace registered fine (the
 * proxy's own comment calls moving exposure into `settings.register()` "deferred
 * work").
 *
 * This script makes the exposure REGISTRY-DRIVEN instead of hardcoded: it
 * patches `exposedNamespaces()` to also expose every namespace currently
 * registered with the settings provider. The patch contains NO plugin-specific
 * string, so the settings of ANY plugin that registers a namespace (and mounts
 * its own settings section) appear automatically — this plugin included.
 *
 * It is applied to every reachable dsh installation: the profile-linked copy
 * (pnpm store / npx cache), a global `npm i -g @deepseek-ai/dsh` install under
 * the active Node version, and the invoking directory's own install. Re-run it
 * after any dsh reinstall; it is idempotent and also removes the previous
 * per-plugin allowlist entry (pre-0.4.0 installs).
 *
 * Usage: node scripts/patch-expose.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

/** The registry-driven patch: expose every namespace the provider knows. */
const GENERIC_ADD = `\t\tconst settings = ctx.get("settings");
\t\tif (settings !== void 0) for (const descriptor of settings.describe()) exposed.add(String(descriptor.ns));`;

/** Marker proving the generic patch is already applied. */
const GENERIC_MARKER = 'for (const descriptor of settings.describe()) exposed.add(String(descriptor.ns))';

/** The hardcoded allowlist tail, as shipped (and as the old patch rewrote it). */
const ARRAY_TAIL_PLAIN = `\t"web-search-deepseek"\n];`;
const ARRAY_TAIL_OLD_PATCH = `\t"web-search-deepseek",\n\t"auto-continue"\n];`;

/**
 * Collect candidate dsh-host-apiproxy package.json paths: the profile-linked
 * copy, a global install under the active Node version's nvm layout
 * (`<nvm>/<version>/lib/node_modules/@deepseek-ai/dsh`), and the invoking
 * directory's own install. Deduplicated by real path.
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
  // 2. A global install under the active Node version's nvm layout.
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

let changedAny = false;
for (const packageJson of candidates) {
  const bundlePath = join(dirname(packageJson), 'lib', 'index.js');
  let source = readFileSync(bundlePath, 'utf8');
  let changed = false;

  // 1. Remove the previous per-plugin allowlist entry (pre-0.4.0 installs).
  if (source.includes(ARRAY_TAIL_OLD_PATCH)) {
    source = source.replace(ARRAY_TAIL_OLD_PATCH, ARRAY_TAIL_PLAIN);
    changed = true;
    console.log(`[patch-expose] removed per-plugin allowlist entry in ${bundlePath}`);
  }

  // 2. Make exposure registry-driven (idempotent).
  if (!source.includes(GENERIC_MARKER)) {
    const fnStart = source.indexOf('\tfunction exposedNamespaces() {');
    if (fnStart === -1) {
      console.error(`[patch-expose] could not locate exposedNamespaces() in ${bundlePath}`);
      continue;
    }
    const fnEnd = source.indexOf('\t}', fnStart);
    if (fnEnd === -1) {
      console.error(`[patch-expose] could not locate the end of exposedNamespaces() in ${bundlePath}`);
      continue;
    }
    const body = source.slice(fnStart, fnEnd);
    if (!body.includes('return exposed;')) {
      console.error(`[patch-expose] unexpected exposedNamespaces() body in ${bundlePath}`);
      continue;
    }
    const patchedBody = body.replace('\t\treturn exposed;', `${GENERIC_ADD}\n\t\treturn exposed;`);
    source = source.slice(0, fnStart) + patchedBody + source.slice(fnEnd);
    changed = true;
    console.log(`[patch-expose] made exposure registry-driven in ${bundlePath}`);
  } else {
    console.log(`[patch-expose] registry-driven exposure already present in ${bundlePath} — skipped.`);
  }

  if (changed) writeFileSync(bundlePath, source);
  changedAny = changedAny || changed;
}

if (changedAny) console.log('[patch-expose] restart `dsh web` for the change to take effect.');
