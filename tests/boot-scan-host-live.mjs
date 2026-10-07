/** Verify scan containment with released Cordis, Session and HTTP services, without an LLM request. */
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const pluginRoot = process.env.AUTO_CONTINUE_TEST_PACKAGE ?? project;
const cohort = process.argv[2] ?? '0.2.1';
const modules = join(project, `tests/fixtures/dsh-${cohort}/node_modules`);
const version = JSON.parse(readFileSync(join(modules, '@deepseek-ai/dsh-session/package.json'), 'utf8')).version;
const load = (name) => import(pathToFileURL(join(modules, '@deepseek-ai', name, 'lib/index.js')).href);
const { Context } = await load('cordis');
const { Session } = await load('dsh-session');
const { default: WebServer } = await load('dsh-host-webserver');
const fixture = mkdtempSync(join(tmpdir(), 'auto-continue-boot-scan-'));
mkdirSync(join(fixture, 'lib'));
copyFileSync(join(pluginRoot, 'lib/index.js'), join(fixture, 'lib/index.js'));
copyFileSync(join(pluginRoot, 'package.json'), join(fixture, 'package.json'));
symlinkSync(modules, join(fixture, 'node_modules'), 'dir');
const plugin = await import(pathToFileURL(join(fixture, 'lib/index.js')).href);
const createSession = (id, seed) => Session.create ? Session.create(id, seed) : new Session(id, seed);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

try {
  // These are host-boundary fault injections, not a claim that normal DSH loading emits null logs.
  const native = createSession('native-boundary');
  assert.ok(native.header, 'the real host supplies creation metadata');
  assert.throws(() => createSession('invalid-seed', [null]), 'the real host rejects a null seed entry');
  for (const fault of ['throwing-snapshot', 'null-entry', 'missing-header']) {
    const ctx = new Context();
    const agents = new Map();
    function agent(id) {
      const session = createSession(id);
      session.append('turn/start', { turn: 1 });
      session.append('turn/end', { turn: 1, reason: { kind: 'interrupted' } });
      const value = { session, followups: [], inbox: { nextTurn: [] }, followup(message) { this.followups.push(message); } };
      agents.set(id, value);
      return value;
    }
    const before = agent('healthy-before');
    const broken = agent('broken');
    const after = agent('healthy-after');
    if (fault === 'throwing-snapshot') broken.session.snapshotEvents = () => { throw new Error('injected history read failure'); };
    if (fault === 'null-entry') {
      const events = broken.session.snapshotEvents();
      broken.session.snapshotEvents = () => [...events, null];
    }
    if (fault === 'missing-header') broken.session.header = undefined;
    ctx.provide('agents', { list: () => [...agents.values()], get: id => agents.get(id) });
    try {
      await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 });
      await ctx.plugin(plugin, { scanOnBoot: true, verbose: false, graceMs: 5, cooldownMs: 0, freshMs: 1000 });
      const deadline = Date.now() + 500;
      while (Date.now() < deadline && (before.followups.length === 0 || after.followups.length === 0)) await sleep(10);
      assert.equal(before.followups.length, 1, `DSH ${version}: ${fault} must not block earlier sessions`);
      assert.equal(after.followups.length, 1, `DSH ${version}: ${fault} must not block later sessions`);
      assert.equal(broken.followups.length, 0, 'the damaged session is not resumed');
      const response = await fetch(`http://127.0.0.1:${ctx.webServer.port}/api/auto-continue-bridge`);
      assert.equal(response.status, 200);
      const reader = response.body.getReader();
      const state = JSON.parse(new TextDecoder().decode((await reader.read()).value).slice(6));
      assert.equal(state.stats.sent, 2, 'the host bridge reports both healthy recoveries');
      await reader.cancel();
    } finally {
      await ctx.fiber.dispose();
    }
    console.log(`DSH ${version}: ${fault} contained; both healthy sessions recovered ✅`);
  }
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
