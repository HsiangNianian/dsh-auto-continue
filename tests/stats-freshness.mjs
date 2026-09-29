/** Regression: today's stats must reach the status bridge on every bump.
 *
 * The host only pushes bridge state from emitState(). Stat bumps used to
 * mutate the in-memory bucket without publishing, so an open settings card
 * only ever saw the numbers it already had. Because notify defaults to false,
 * a plain auto-continue never emitted — leaving "Auto-continued" stuck at 0
 * while the engine kept sending.
 *
 * Note: host-fixture.stats() cannot detect this — it opens a *new* SSE
 * connection per call and therefore always reads a freshly-built snapshot.
 * This test keeps one long-lived client and inspects the pushed frames.
 */
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { apply } from '../lib/index.js';

mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
const flush = async (ms = 20) => {
  mock.timers.tick(ms);
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};

/** Host with an inspectable route table (host-fixture keeps routes private). */
function makeHost(configOverrides = {}) {
  const agents = new Map();
  const handlers = new Map();
  const routes = new Map();
  const cleanups = [];
  const ctx = {
    agents: { list: () => [...agents.values()], get: (id) => agents.get(id) },
    webServer: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path); } },
    on(name, cb) { const s = handlers.get(name) ?? new Set(); handlers.set(name, s); s.add(cb); return () => s.delete(cb); },
    effect(start) { const stop = start(); if (typeof stop === 'function') cleanups.push(stop); },
    inject(deps, cb) { if (!deps.includes('settings')) cb(ctx); },
  };
  apply(ctx, { scanOnBoot: false, verbose: false, graceMs: 10, cooldownMs: 0, ...configOverrides });
  return {
    emit(agent, event) { for (const cb of handlers.get('session/event') ?? []) cb(agent.session, event); },
    agent(id) {
      const agent = {
        session: { id, header: {}, events: [], snapshotEvents: () => [] },
        followups: [], inbox: { nextTurn: [] },
        followup(m) { this.followups.push(m); },
      };
      agents.set(id, agent);
      return agent;
    },
    /** Open one long-lived SSE client, recording every frame pushed to it. */
    client() {
      const frames = [];
      let closeCb;
      routes.get('/api/auto-continue-bridge').handler(
        { on(_name, cb) { closeCb = cb; } },
        { writeHead() {}, end() {}, write(frame) { frames.push(JSON.parse(frame.slice(6))); } },
      );
      return { stats: () => frames.at(-1).stats, pushed: () => frames.length, close: () => closeCb?.() };
    },
    dispose() { for (const stop of cleanups.splice(0).reverse()) stop(); },
  };
}

const text = (turn) => ({
  type: 'assistant/message', seq: turn * 10 - 5, time: Date.now(),
  data: { turn, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: 'Visible answer' }] } },
});
const turnEnd = (turn, kind, extra = {}) => ({
  type: 'turn/end', seq: turn * 10, time: Date.now(), data: { turn, reason: { kind, ...extra } },
});
const turnStart = (turn) => ({ type: 'turn/start', seq: turn * 10 - 9, time: Date.now(), data: { turn } });

const live = [];
try {
  // 28a: autonomous loop with notify OFF — the default, and the broken case.
  const quiet = makeHost({ resumeCompletedTurns: true });
  live.push(quiet);
  const agent = quiet.agent('quiet');
  const client = quiet.client();
  assert.equal(client.stats().sent, 0, 'initial snapshot starts at zero');

  for (const turn of [1, 2, 3]) {
    quiet.emit(agent, turnStart(turn));
    quiet.emit(agent, text(turn));
    quiet.emit(agent, turnEnd(turn, 'completed'));
    await flush();
  }
  assert.equal(agent.followups.length, 3, 'three auto-continues were sent');
  assert.equal(client.stats().sent, 3, 'every auto-continue is published to the bridge');
  // 2, not 3: recovery is credited when the *next* turn ends, so the third
  // send's outcome is still unresolved at this point.
  assert.equal(client.stats().recovered, 2, 'recoveries are published too');
  console.log('✓ notify=false: stats.sent tracks the engine (3/3)');

  // 28b: permanent (skipped) failures are published without notifications.
  const perm = makeHost({ graceMs: 10, cooldownMs: 0 });
  live.push(perm);
  const broken = perm.agent('broken');
  const permClient = perm.client();
  for (const turn of [1, 2]) {
    perm.emit(broken, turnStart(turn));
    perm.emit(broken, turnEnd(turn, 'error', { error: { message: 'insufficient quota', code: 'QUOTA' } }));
    await flush();
  }
  assert.equal(broken.followups.length, 0, 'permanent errors are never retried');
  assert.equal(permClient.stats().skipped, 2, 'permanent skips are published');
  assert.equal(permClient.stats().byCode.QUOTA, 2, 'error-code histogram is published');
  console.log('✓ permanent skips: skipped/byCode published (2 / QUOTA ×2)');

  // 28c: loop-guard restarts are published.
  const guard = makeHost({ graceMs: 10, cooldownMs: 0, loopShortCount: 2 });
  live.push(guard);
  const spinner = guard.agent('spinner');
  spinner.cancels = [];
  spinner.cancel = function (cause) { this.cancels.push(cause); };
  const guardClient = guard.client();
  // Two consecutive short messages with no tool call trip the guard, which
  // cancels the turn with our own cause; the matching turn/end then restarts.
  guard.emit(spinner, turnStart(1));
  for (const step of [1, 2]) {
    guard.emit(spinner, {
      type: 'assistant/message', seq: step, time: Date.now(),
      data: { turn: 1, step, message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } },
    });
  }
  await flush();
  assert.equal(spinner.cancels.length, 1, 'the guard cancelled the spinning turn');
  guard.emit(spinner, turnEnd(1, 'aborted', { reason: { kind: 'hook', reason: 'dsh-auto-continue:loop-guard' } }));
  await flush();
  assert.equal(guardClient.stats().looped, 1, 'loop-guard restarts are published');
  console.log('✓ loop guard: looped published (1)');

  console.log('Stats freshness ✅');
} finally {
  for (const h of live) h.dispose();
  mock.timers.reset();
}
