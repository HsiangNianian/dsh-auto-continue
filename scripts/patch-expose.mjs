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
 * This script adds the `auto-continue` namespace to that allowlist in the
 * RESOLVED installation (the same copy the profile's node_modules links to).
 * It is idempotent: re-running it after a dsh reinstall reapplies the patch.
 *
 * Usage: node scripts/patch-expose.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

/** The namespace this plugin's settings card edits. */
const NS = 'auto-continue';

/** Candidates, in loader resolution order: profile dir, then dsh installation. */
function resolveApiProxyPackageJson() {
  const requireFromProfile = createRequire(join(homedir(), '.dsh', 'profiles', 'web', 'package.json'));
  try {
    return requireFromProfile.resolve('@deepseek-ai/dsh-host-apiproxy/package.json');
  } catch {
    /* fall through to the dsh installation */
  }
  const requireFromDsh = createRequire(join(process.cwd(), 'package.json'));
  return requireFromDsh.resolve('@deepseek-ai/dsh-host-apiproxy/package.json');
}

const packageJson = resolveApiProxyPackageJson();
const bundlePath = join(dirname(packageJson), 'lib', 'index.js');
const source = readFileSync(bundlePath, 'utf8');

if (source.includes(`"${NS}"`)) {
  console.log(`[patch-expose] ${NS} already present in ${bundlePath} — nothing to do.`);
  process.exit(0);
}

const marker = `\t"web-search-deepseek"\n];`;
if (!source.includes(marker)) {
  console.error(`[patch-expose] could not locate the WEB_SETTINGS_NAMESPACES tail in ${bundlePath}`);
  process.exit(1);
}

const patched = source.replace(marker, `\t"web-search-deepseek",\n\t"${NS}"\n];`);
writeFileSync(bundlePath, patched);
console.log(`[patch-expose] added "${NS}" to WEB_SETTINGS_NAMESPACES in ${bundlePath}`);
console.log('[patch-expose] restart `dsh web` for the change to take effect.');
