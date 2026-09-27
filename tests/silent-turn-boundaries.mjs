import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { makeHost, turnEnd, turnStart } from './host-fixture.mjs';

mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
const flush = async (ms = 20) => {
  mock.timers.tick(ms);
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};
const hosts = [];
const host = (options) => { const h = makeHost({ scanOnBoot: false, ...options }); hosts.push(h); h.start(); return h; };
const message = (turn, content) => ({
  type: 'assistant/message', seq: turn * 10 - 5, time: Date.now(),
  data: { turn, step: 1, message: { role: 'assistant', content } },
});
const reasoning = (turn) => message(turn, [{ type: 'reasoning', text: 'Thinking' }]);

try {
  const h = host();
  const noop = h.agent('noop');
  h.emit(noop, turnStart(1));
  h.emit(noop, turnEnd(1, 'completed'));
  await flush();
  assert.equal(noop.followups.length, 0, 'a completed no-op is not a reasoning-only failure');
  const silent = h.agent('silent');
  h.emit(silent, turnStart(1));
  h.emit(silent, reasoning(1));
  h.emit(silent, turnEnd(1, 'completed'));
  await flush();
  assert.equal(silent.followups.length, 1, 'an observed reasoning-only turn is recovered');
  for (const part of [
    { type: 'image', mediaType: 'image/png', url: 'https://example.com/image.png' },
    { type: 'extension', name: 'rendered-result', value: {} },
  ]) {
    const visible = h.agent(part.type);
    h.emit(visible, turnStart(1));
    h.emit(visible, message(1, [part]));
    h.emit(visible, turnEnd(1, 'completed'));
    await flush();
    assert.equal(visible.followups.length, 0, `${part.type} output is not silently discarded`);
  }
  const streamed = h.agent('streamed');
  h.emit(streamed, turnStart(1));
  h.emit(streamed, { type: 'assistant/chunk', seq: 5, time: Date.now(), data: { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'Visible text' } } });
  h.emit(streamed, reasoning(1));
  h.emit(streamed, turnEnd(1, 'completed'));
  await flush();
  assert.equal(streamed.followups.length, 0, 'streamed visible output survives a reasoning-only final message');
  const toggled = host();
  const cancelled = toggled.agent('cancelled');
  toggled.emit(cancelled, turnStart(1));
  toggled.emit(cancelled, reasoning(1));
  toggled.emit(cancelled, turnEnd(1, 'completed'));
  toggled.config.resumeSilentTurns = false;
  await flush();
  assert.equal(cancelled.followups.length, 0, 'disabling silent recovery during grace cancels the send');
  const capped = host({ maxConsecutive: 1 });
  const repeats = capped.agent('repeats');
  const silentTurn = (turn) => {
    capped.emit(repeats, turnStart(turn));
    capped.emit(repeats, reasoning(turn));
    capped.emit(repeats, turnEnd(turn, 'completed'));
  };
  silentTurn(1);
  await flush();
  capped.config.resumeSilentTurns = false;
  silentTurn(2);
  capped.config.resumeSilentTurns = true;
  silentTurn(3);
  await flush();
  assert.equal(repeats.followups.length, 1, 'a disabled silent turn cannot reset the consecutive cap');
  capped.emit(repeats, turnEnd(4, 'completed'));
  silentTurn(5);
  await flush();
  assert.equal(repeats.followups.length, 1, 'an unobserved completed turn is not proof of recovery');
  capped.emit(repeats, turnStart(6));
  capped.emit(repeats, message(6, [{ type: 'text', text: 'Recovered' }]));
  capped.emit(repeats, turnEnd(6, 'completed'));
  silentTurn(7);
  await flush();
  assert.equal(repeats.followups.length, 2, 'confirmed visible output resets the cap');
  const unknown = h.agent('unknown');
  h.emit(unknown, reasoning(1));
  h.emit(unknown, turnEnd(1, 'completed'));
  await flush();
  assert.equal(unknown.followups.length, 0, 'joining a turn midway is not proof of silence');
  const stale = h.agent('stale');
  h.emit(stale, turnStart(2));
  h.emit(stale, reasoning(2));
  h.emit(stale, message(1, [{ type: 'text', text: 'Old output' }]));
  h.emit(stale, turnEnd(2, 'completed'));
  await flush();
  assert.equal(stale.followups.length, 1, 'old output cannot hide the current silent turn');
  const step = h.agent('step');
  h.emit(step, turnStart(1));
  h.emit(step, { type: 'step/start', seq: 2, time: Date.now(), data: { turn: 1, step: 1 } });
  h.emit(step, turnEnd(1, 'completed'));
  await flush();
  assert.equal(step.followups.length, 1, 'a model step without output is distinct from a no-op');
  for (const enabled of [true, false]) {
    const startup = makeHost({ scanOnBoot: true, resumeSilentTurns: enabled });
    hosts.push(startup);
    const restored = startup.agent(`restored-${enabled}`, [turnEnd(1, 'no-visible-output')]);
    startup.start();
    await flush();
    assert.equal(restored.followups.length, Number(enabled), 'startup recovery respects the silent-turn flag');
  }
  console.log('Silent-turn evidence boundaries ✅');
} finally {
  for (const h of hosts) h.dispose();
  mock.timers.reset();
}
