/** Autonomous loop (resumeCompletedTurns) behavior: every completed turn hands
 * the thread back; the consecutive cap throttles failures only; user stops break
 * the loop; the loop continue text is distinct from the generic one. */
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { makeHost, turnEnd, turnStart } from './host-fixture.mjs';

mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
const flush = async (ms = 20) => {
  mock.timers.tick(ms);
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};
const hosts = [];
const host = (options) => {
  const h = makeHost({ scanOnBoot: false, ...options });
  hosts.push(h);
  h.start();
  return h;
};
const message = (turn, content) => ({
  type: 'assistant/message', seq: turn * 10 - 5, time: Date.now(),
  data: { turn, step: 1, message: { role: 'assistant', content } },
});
const text = (turn) => message(turn, [{ type: 'text', text: 'Visible answer' }]);
const reasoning = (turn) => message(turn, [{ type: 'reasoning', text: 'Thinking' }]);
const followupText = (agent, index) => agent.followups[index].content[0].text;

try {
  // 27a: off by default — a normal completed turn does not auto-continue.
  const plain = host();
  const off = plain.agent('off');
  plain.emit(off, turnStart(1));
  plain.emit(off, text(1));
  plain.emit(off, turnEnd(1, 'completed'));
  await flush();
  assert.equal(off.followups.length, 0, 'default: completed turns are not resumed');

  // 27b: on — every completed turn hands the thread back, visible or not.
  const loop = host({ resumeCompletedTurns: true });
  const runner = loop.agent('runner');
  for (const turn of [1, 2, 3]) {
    loop.emit(runner, turnStart(turn));
    loop.emit(runner, text(turn));
    loop.emit(runner, turnEnd(turn, 'completed'));
    await flush();
  }
  assert.equal(runner.followups.length, 3, 'every completed turn is continued');
  assert.equal(followupText(runner, 0), '继续', 'the loop continue text is used');

  // 27c: success never counts toward the consecutive cap (maxConsecutive: 1).
  const single = host({ resumeCompletedTurns: true, maxConsecutive: 1 });
  const survivor = single.agent('survivor');
  for (const turn of [1, 2]) {
    single.emit(survivor, turnStart(turn));
    single.emit(survivor, text(turn));
    single.emit(survivor, turnEnd(turn, 'completed'));
    await flush();
  }
  assert.equal(survivor.followups.length, 2, 'successes are never throttled by the cap');

  // 27d: a failure then still trips the cap — the cap throttles failures only.
  const failing = host({ resumeCompletedTurns: true, maxConsecutive: 1 });
  const broken = failing.agent('broken');
  failing.emit(broken, turnStart(1));
  failing.emit(broken, text(1));
  failing.emit(broken, turnEnd(1, 'completed'));
  await flush();
  failing.emit(broken, turnStart(2));
  failing.emit(broken, turnEnd(2, 'error', { error: { message: 'network down' } }));
  await flush();
  failing.emit(broken, turnStart(3));
  failing.emit(broken, turnEnd(3, 'error', { error: { message: 'network down' } }));
  await flush();
  assert.equal(broken.followups.length, 2, 'failures still hit the consecutive cap');

  // 27e: a user stop breaks the loop — aborted turns are never resumed.
  const stopped = host({ resumeCompletedTurns: true });
  const halted = stopped.agent('halted');
  stopped.emit(halted, turnStart(1));
  stopped.emit(halted, text(1));
  stopped.emit(halted, turnEnd(1, 'completed'));
  await flush();
  stopped.emit(halted, turnStart(2));
  stopped.emit(halted, text(2));
  stopped.emit(halted, turnEnd(2, 'aborted', { reason: 'user' }));
  await flush();
  assert.equal(halted.followups.length, 1, 'user abort stops the loop');

  // 27f: the loop text is customizable and falls back per locale.
  const custom = host({ resumeCompletedTurns: true, locale: 'en', continueTextLoop: 'KEEP GOING' });
  const stated = custom.agent('stated');
  custom.emit(stated, turnStart(1));
  custom.emit(stated, text(1));
  custom.emit(stated, turnEnd(1, 'completed'));
  await flush();
  assert.equal(followupText(stated, 0), 'KEEP GOING', 'custom loop text wins');
  const fallback = host({ resumeCompletedTurns: true, locale: 'en' });
  const english = fallback.agent('english');
  fallback.emit(english, turnStart(1));
  fallback.emit(english, text(1));
  fallback.emit(english, turnEnd(1, 'completed'));
  await flush();
  assert.equal(followupText(english, 0), 'Continue', 'empty loop text falls back to the locale default');

  // 27g: global pause halts the loop even when enabled.
  const paused = host({ resumeCompletedTurns: true, paused: true });
  const muted = paused.agent('muted');
  paused.emit(muted, turnStart(1));
  paused.emit(muted, text(1));
  paused.emit(muted, turnEnd(1, 'completed'));
  await flush();
  assert.equal(muted.followups.length, 0, 'paused stops the autonomous loop');

  // 27h: a no-op (empty) completed turn keeps the loop going but must not
  // erase the failure budget, or the consecutive cap could never trip.
  const budget = host({ resumeCompletedTurns: true, maxConsecutive: 2 });
  const keeper = budget.agent('keeper');
  for (const turn of [1, 2]) {
    budget.emit(keeper, turnStart(turn));
    budget.emit(keeper, turnEnd(turn, 'error', { error: { message: 'network down' } }));
    await flush();
  }
  assert.equal(keeper.followups.length, 2, 'two failures are retried up to the cap');
  budget.emit(keeper, turnStart(3));
  budget.emit(keeper, turnEnd(3, 'completed'));
  await flush();
  assert.equal(keeper.followups.length, 3, 'an empty completed turn still continues the loop');
  budget.emit(keeper, turnStart(4));
  budget.emit(keeper, turnEnd(4, 'error', { error: { message: 'network down' } }));
  await flush();
  assert.equal(keeper.followups.length, 3, 'the empty turn did not erase the failure budget');

  // 27i: an unobserved completed turn behaves the same way.
  budget.emit(keeper, turnEnd(5, 'completed')); // no turn/start -> unknown output
  await flush();
  assert.equal(keeper.followups.length, 4, 'an unobserved completed turn still continues the loop');
  budget.emit(keeper, turnStart(6));
  budget.emit(keeper, turnEnd(6, 'error', { error: { message: 'network down' } }));
  await flush();
  assert.equal(keeper.followups.length, 4, 'the unobserved turn did not erase the failure budget');

  // 27j: with the loop on, a silent turn still continues it even when
  // silent-turn resume itself is disabled (previously this stalled the loop).
  const silentLoop = host({ resumeCompletedTurns: true, resumeSilentTurns: false });
  const quiet = silentLoop.agent('quiet');
  silentLoop.emit(quiet, turnStart(1));
  silentLoop.emit(quiet, reasoning(1));
  silentLoop.emit(quiet, turnEnd(1, 'completed'));
  await flush();
  assert.equal(quiet.followups.length, 1, 'the loop covers silent turns with silent resume off');
  assert.equal(followupText(quiet, 0), '继续', 'the loop text is used for silent turns');

  // 27k: with both switches on, a silent turn still produces exactly one send.
  const both = host({ resumeCompletedTurns: true, resumeSilentTurns: true });
  const twice = both.agent('twice');
  both.emit(twice, turnStart(1));
  both.emit(twice, reasoning(1));
  both.emit(twice, turnEnd(1, 'completed'));
  await flush();
  assert.equal(twice.followups.length, 1, 'a silent turn in loop mode sends once, not twice');
  assert.equal(followupText(twice, 0), '继续', 'the loop text wins in loop mode');

  console.log('Autonomous loop behavior ✅');
} finally {
  for (const h of hosts) h.dispose();
  mock.timers.reset();
}
