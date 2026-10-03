/** Resume now is the explicit pause exception; automatic follow-ups stay paused. */
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
  const h = makeHost({ scanOnBoot: false, resumeCompletedTurns: true, ...options });
  hosts.push(h);
  h.start();
  return h;
};
const visibleMessage = (turn) => ({
  type: 'assistant/message',
  seq: turn * 10 - 5,
  time: Date.now(),
  data: { turn, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: 'Finished.' }] } },
});

try {
  for (const pause of ['global', 'session']) {
    const paused = host(pause === 'global' ? { paused: true } : {});
    const agent = paused.agent(`paused-${pause}`);
    if (pause === 'session') {
      const response = await paused.postAction({ action: 'pause1h', sessionId: agent.session.id });
      assert.equal(response.ok, true, 'the session pause is set through the action route');
    }

    paused.emit(agent, turnEnd(1, 'error', { error: { message: 'network down' } }));
    await flush();
    assert.equal(agent.followups.length, 0, `${pause} pause blocks automatic recovery`);

    const response = await paused.postAction({ action: 'resume', sessionId: agent.session.id });
    assert.equal(response.ok, true, 'Resume now succeeds through the action route');
    assert.equal(agent.followups.length, 1, `${pause} pause allows one manual send`);

    if (pause === 'global') {
      // Successful loop sends also use force. Queue one while unpaused, then
      // pause before fire() to prove force alone cannot bypass the pause.
      paused.config.paused = false;
      paused.emit(agent, turnStart(2));
      paused.emit(agent, visibleMessage(2));
      paused.emit(agent, turnEnd(2, 'completed'));
      paused.config.paused = true;
    } else {
      paused.emit(agent, turnStart(2));
      paused.emit(agent, visibleMessage(2));
      paused.emit(agent, turnEnd(2, 'completed'));
    }
    await flush();
    assert.equal(agent.followups.length, 1, `${pause} pause still blocks the autonomous loop after Resume now`);

    paused.emit(agent, turnEnd(3, 'error', { error: { message: 'network down again' } }));
    await flush();
    assert.equal(agent.followups.length, 1, `${pause} pause still blocks automatic recovery after Resume now`);
  }

  console.log('Resume now bypasses global and session pauses once; automatic recovery and looping remain paused ✅');
} finally {
  for (const h of hosts) h.dispose();
  mock.timers.reset();
}
