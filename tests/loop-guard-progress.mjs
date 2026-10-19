import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeHost, turnEnd, turnStart } from './host-fixture.mjs';

function scenario(t, config = {}) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
  const host = makeHost({ scanOnBoot: false, ...config });
  t.after(() => host.dispose());
  const agent = host.agent('working');
  agent.cancels = [];
  agent.cancel = cause => agent.cancels.push(cause);
  host.start();
  host.emit(agent, turnStart(1));
  const emit = (type, seq, data) => host.emit(agent, { type, seq, time: Date.now(), data: { turn: 1, step: seq, ...data } });
  const message = (text, seq) => emit('assistant/message', seq, { message: { role: 'assistant', content: [{ type: 'text', text }] } });
  const call = (seq, args = '{}') => emit('tool/call', seq, { callId: `c${seq}`, name: 'edit', arguments: args });
  return { host, agent, emit, message, call };
}

for (const text of ['\u200b', '\u200e\u200f\u2060\ufeff', '\u200c\u200d']) {
  test(`invisible-only text is not a repeated visible message (${JSON.stringify(text)})`, t => {
    const { agent, message } = scenario(t);
    for (let n = 0; n < 4; n++) message(text, n + 2);
    assert.equal(agent.cancels.length, 0);
  });
}

for (const text of ['\u200b', 'Done.']) {
  test(`new tool work breaks message repetition (${JSON.stringify(text)})`, t => {
    const { agent, message, call } = scenario(t);
    for (let n = 0; n < 16; n++) {
      message(text, n * 2 + 2);
      call(n * 2 + 3, JSON.stringify({ file: `file-${n}` }));
    }
    assert.equal(agent.cancels.length, 0);
  });
}

test('replayed tool calls cannot hide real repeated text', t => {
  const { agent, message, call } = scenario(t);
  for (let n = 0; n < 4; n++) {
    message('The same action without any progress.', n + 2);
    call(1);
  }
  assert.equal(agent.cancels.length, 1);
});

test('blank messages without tool progress still hit the short-output guard', t => {
  const { agent, message } = scenario(t);
  for (let n = 0; n < 12; n++) message('\u200b', n + 2);
  assert.equal(agent.cancels.length, 1);
});

test('pause stops automatic continuation but the independent loop guard still operates', t => {
  const { host, agent, message } = scenario(t, { paused: true });
  for (let n = 0; n < 4; n++) message('Repeated text with no progress.', n + 2);
  assert.equal(agent.cancels.length, 1);
  host.emit(agent, turnEnd(1, 'aborted', { reason: agent.cancels[0] }));
  t.mock.timers.tick(10000);
  assert.equal(agent.followups.length, 0);
});

test('disabling the loop guard stops all its cancellations', t => {
  const { agent, message } = scenario(t, { loopGuard: false });
  for (let n = 0; n < 20; n++) message('Same', n + 2);
  assert.equal(agent.cancels.length, 0);
});
