import assert from 'node:assert/strict';
import test from 'node:test';
import { makeHost, turnEnd, turnStart } from './host-fixture.mjs';

const malformed = command => ({
  code: 'MALFORMED_RESPONSE',
  message: `Tool call "bash": Unexpected non-whitespace character after JSON\n\nReceived arguments:\n${JSON.stringify({ command })} trailing`,
});
const cases = [
  ...['pwd', 'gh auth status', 'grep permission app.log', 'echo author', 'echo api_key',
    'echo quota exceeded', 'echo model_not_found', 'echo context limit', 'echo invalid_request']
    .map(command => [command, malformed(command), 1]),
  ['real auth', { code: 'INVALID_API_KEY', message: 'Invalid credentials', status: 401 }, 0],
  ['real permission', { code: 'FORBIDDEN', message: 'Permission denied', status: 403 }, 0],
  ['real quota', { code: 'UPSTREAM', message: 'Insufficient quota' }, 0],
  ['real model', { code: 'MODEL_NOT_FOUND', message: 'Unknown model' }, 0],
  ['real context', { code: 'CONTEXT_LENGTH_EXCEEDED', message: 'context length exceeded' }, 0],
  ['real request', { code: 'INVALID_REQUEST', message: 'Invalid request' }, 0],
  ...[401, 403].map(status => [`malformed HTTP ${status}`, { ...malformed('pwd'), status }, 0]),
];

function scenario(t, config) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
  const host = makeHost(config);
  t.after(() => host.dispose());
  const tick = async (ms = 20) => {
    t.mock.timers.tick(ms);
    for (let i = 0; i < 400; i++) { t.mock.timers.tick(0); await Promise.resolve(); }
  };
  return { host, tick };
}

for (const path of ['live', 'boot-live', 'boot-stored']) {
  test(`malformed arguments recover without weakening permanent errors (${path})`, async t => {
    const { host, tick } = scenario(t, { scanOnBoot: path !== 'live', scanLimit: cases.length });
    const histories = new Map(cases.map(([id, error]) => [id, [turnStart(1), turnEnd(1, 'error', { error })]]));
    if (path === 'boot-stored') {
      host.provide('sessionQuery', {
        listSessions: async () => [...histories.keys()].map(id => ({ header: { id }, live: false })),
        observeSession: async id => ({ events: histories.get(id), header: { id }, [Symbol.dispose]() {} }),
      });
      for (const [id, events] of histories) host.onResume(id, events);
    } else {
      for (const [id, events] of histories) host.agent(id, path === 'live' ? [] : events);
    }
    host.start();
    if (path === 'live') for (const [id, events] of histories) for (const event of events) host.emit(host.agents.get(id), event);
    await tick(); await tick(3000); await tick();
    for (const [id, , expected] of cases) assert.equal(host.agents.get(id)?.followups.length ?? 0, expected, id);
    assert.equal(host.stats().sent, 9);
    assert.equal(host.stats().skipped, cases.length - 9);
  });
}

test('malformed recovery still obeys the consecutive limit', async t => {
  const { host, tick } = scenario(t, { scanOnBoot: false, maxConsecutive: 1 });
  host.start();
  const agent = host.agent('capped');
  for (const turn of [1, 2]) {
    host.emit(agent, turnStart(turn));
    host.emit(agent, turnEnd(turn, 'error', { error: malformed('gh auth status') }));
    await tick();
  }
  assert.equal(agent.followups.length, 1);
});

test('explicit retryable patterns retain precedence over built-in classification', async t => {
  const { host, tick } = scenario(t, { scanOnBoot: false, retryableErrorPatterns: 'other text\nprovider retry allowed' });
  host.start();
  const agent = host.agent('override');
  host.emit(agent, turnStart(1));
  host.emit(agent, turnEnd(1, 'error', { error: { code: 'UPSTREAM', status: 403, message: 'Provider retry allowed' } }));
  await tick();
  assert.equal(agent.followups.length, 1);
});
