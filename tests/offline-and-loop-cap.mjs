/**
 * Issue #81: hold network-error recoveries while the host is offline, and cap
 * autonomous-loop rounds per session.
 *
 * Connectivity is faked at the Node boundary the probe really uses
 * (`dns.promises.lookup` and `os.networkInterfaces`), so the built bundle is
 * exercised unchanged and no test touches the machine's real network.
 */
import assert from 'node:assert/strict';
import dns from 'node:dns';
import os from 'node:os';
import { test } from 'node:test';
import { makeHost, turnEnd, turnStart } from './host-fixture.mjs';

for (const key of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']) {
  delete process.env[key];
}

const realLookup = dns.promises.lookup;
const realInterfaces = os.networkInterfaces;
const net = { online: false, lookups: 0, interfaces: 'external' };
dns.promises.lookup = async () => {
  net.lookups += 1;
  if (!net.online) throw Object.assign(new Error('getaddrinfo EAI_AGAIN'), { code: 'EAI_AGAIN' });
  return { address: '203.0.113.1', family: 4 };
};
os.networkInterfaces = () => (net.interfaces === 'external'
  ? { eth0: [{ address: '192.0.2.10', family: 'IPv4', internal: false }] }
  : { lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }] });
process.on('exit', () => {
  dns.promises.lookup = realLookup;
  os.networkInterfaces = realInterfaces;
});

const OFFLINE_CHECK_MS = 1000;

function scenario(t, config = {}) {
  net.online = false;
  net.lookups = 0;
  net.interfaces = 'external';
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
  const host = makeHost({
    scanOnBoot: false,
    pauseWhenOffline: true,
    offlineCheckMs: OFFLINE_CHECK_MS,
    ...config,
  });
  // Engine diagnostics go to console.info when verbose; capture them per test.
  const lines = [];
  t.mock.method(console, 'info', (line) => { lines.push(String(line)); });
  host.start();
  t.after(() => host.dispose());
  // Mock timers do not fire timers created inside the same tick: advance in slices
  // and drain the probe's promise chain between them.
  const advance = async (ms, slices = 10) => {
    const step = Math.max(1, Math.ceil(ms / slices));
    for (let i = 0; i < slices; i += 1) {
      t.mock.timers.tick(step);
      for (let j = 0; j < 20; j += 1) await Promise.resolve();
    }
  };
  return { host, advance, lines };
}

const transport = (turn) => turnEnd(turn, 'error', {
  error: { code: 'TRANSPORT', message: 'DeepSeek Messages transport failed' },
});
const userMessage = (seq) => ({
  type: 'user/message', seq, time: Date.now(),
  data: { message: { id: `user-${seq}`, role: 'user', content: [{ type: 'text', text: 'hi' }] }, source: { kind: 'user' } },
});
const visible = (turn) => ({
  type: 'assistant/message', seq: turn * 10 - 5, time: Date.now(),
  data: { turn, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: 'Visible answer' }] } },
});
const logged = (lines, needle) => lines.filter((line) => line.includes(needle)).length;

test('a network error waits while offline without spending the retry budget', async (t) => {
  const { host, advance, lines } = scenario(t, { maxConsecutive: 1, verbose: true });
  const agent = host.agent('offline');
  host.emit(agent, turnStart(1));
  host.emit(agent, transport(1));
  await advance(OFFLINE_CHECK_MS * 6, 30);
  assert.equal(agent.followups.length, 0, 'nothing is sent while the host is offline');
  assert.ok(net.lookups >= 3, `the hold keeps re-checking (lookups=${net.lookups})`);
  assert.equal(logged(lines, '网络不可用'), 1, 'the hold is logged once per offline stretch, not per check');

  net.online = true;
  await advance(OFFLINE_CHECK_MS * 2, 20);
  assert.equal(agent.followups.length, 1, 'the held recovery is sent once the network is back');
  assert.equal(logged(lines, '网络已恢复'), 1, 'the reconnect is logged');
  // maxConsecutive is 1: if the offline checks had been charged, this send would have been refused.
});

test('a non-network failure is not held even while offline', async (t) => {
  const { host, advance } = scenario(t);
  const agent = host.agent('server');
  host.emit(agent, turnStart(1));
  host.emit(agent, turnEnd(1, 'error', { error: { code: 'SERVER', message: 'upstream answered HTTP 503', status: 503 } }));
  await advance(100);
  assert.equal(agent.followups.length, 1, '5xx is a server problem, not connectivity');
  assert.equal(net.lookups, 0, 'no connectivity probe for non-network failures');
});

test('a user message cancels a held recovery', async (t) => {
  const { host, advance } = scenario(t);
  const agent = host.agent('cancelled');
  host.emit(agent, turnStart(1));
  host.emit(agent, transport(1));
  await advance(OFFLINE_CHECK_MS * 2, 20);
  host.emit(agent, userMessage(20));
  net.online = true;
  await advance(OFFLINE_CHECK_MS * 3, 30);
  assert.equal(agent.followups.length, 0, 'the user took over; the held send must not fire later');
});

test('pauseWhenOffline off keeps the old behavior', async (t) => {
  const { host, advance } = scenario(t, { pauseWhenOffline: false });
  const agent = host.agent('legacy');
  host.emit(agent, turnStart(1));
  host.emit(agent, transport(1));
  await advance(100);
  assert.equal(agent.followups.length, 1, 'sent immediately');
  assert.equal(net.lookups, 0, 'no probe when the switch is off');
});

test('only loopback interfaces count as offline even if DNS answers', async (t) => {
  const { host, advance } = scenario(t);
  net.online = true;
  net.interfaces = 'loopback';
  const agent = host.agent('unplugged');
  host.emit(agent, turnStart(1));
  host.emit(agent, transport(1));
  await advance(OFFLINE_CHECK_MS * 2, 20);
  assert.equal(agent.followups.length, 0, 'no usable interface means offline');
  net.interfaces = 'external';
  await advance(OFFLINE_CHECK_MS * 2, 20);
  assert.equal(agent.followups.length, 1, 'plugging back in releases the hold');
});

test('an explicit proxy skips the DNS check instead of holding forever', async (t) => {
  const { host, advance } = scenario(t);
  process.env.HTTPS_PROXY = 'http://127.0.0.1:7890';
  t.after(() => { delete process.env.HTTPS_PROXY; });
  const agent = host.agent('proxied');
  host.emit(agent, turnStart(1));
  host.emit(agent, transport(1));
  await advance(100);
  assert.equal(agent.followups.length, 1, 'local DNS may be unusable behind a proxy; do not guess offline');
  assert.equal(net.lookups, 0, 'DNS is not consulted behind an explicit proxy');
});

// ---------- loopMaxIterations ----------

const completeTurn = async (host, agent, turn, advance) => {
  host.emit(agent, turnStart(turn));
  host.emit(agent, visible(turn));
  host.emit(agent, turnEnd(turn, 'completed'));
  await advance(50);
};

test('the autonomous loop stops after loopMaxIterations rounds and says so once', async (t) => {
  const { host, advance, lines } = scenario(t, { resumeCompletedTurns: true, loopMaxIterations: 2, verbose: true });
  const agent = host.agent('capped');
  for (const turn of [1, 2, 3, 4]) await completeTurn(host, agent, turn, advance);
  assert.equal(agent.followups.length, 2, 'two rounds, then the loop stops');
  assert.equal(logged(lines, '达到上限 2'), 1, 'the stop is reported once, not on every later turn');
});

test('a user message starts the round count over', async (t) => {
  const { host, advance } = scenario(t, { resumeCompletedTurns: true, loopMaxIterations: 1 });
  const agent = host.agent('reset');
  await completeTurn(host, agent, 1, advance);
  await completeTurn(host, agent, 2, advance);
  assert.equal(agent.followups.length, 1, 'cap of one round');
  host.emit(agent, userMessage(25));
  await completeTurn(host, agent, 3, advance);
  assert.equal(agent.followups.length, 2, 'the user stepping in grants another round');
});

test('turning the loop off and on again starts the round count over', async (t) => {
  const { host, advance } = scenario(t, { resumeCompletedTurns: true, loopMaxIterations: 1 });
  const agent = host.agent('toggle');
  await completeTurn(host, agent, 1, advance);
  await completeTurn(host, agent, 2, advance);
  assert.equal(agent.followups.length, 1, 'capped');
  host.config.resumeCompletedTurns = false;
  host.settingsChanged();
  host.config.resumeCompletedTurns = true;
  host.settingsChanged();
  await completeTurn(host, agent, 3, advance);
  assert.equal(agent.followups.length, 2, 're-enabling the loop is a fresh go-ahead');
});

test('loopMaxIterations 0 means unlimited', async (t) => {
  const { host, advance } = scenario(t, { resumeCompletedTurns: true, loopMaxIterations: 0 });
  const agent = host.agent('unlimited');
  for (const turn of [1, 2, 3, 4, 5]) await completeTurn(host, agent, turn, advance);
  assert.equal(agent.followups.length, 5, 'every completed turn continues');
});
