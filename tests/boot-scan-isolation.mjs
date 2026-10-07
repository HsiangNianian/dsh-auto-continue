import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeHost, turnEnd } from './host-fixture.mjs';

function scenario(t, config = {}) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
  const errors = t.mock.method(console, 'error', () => {});
  const host = makeHost(config);
  t.after(() => host.dispose());
  const tick = async (ms = 0) => {
    t.mock.timers.tick(ms);
    for (let i = 0; i < 16; i += 1) await Promise.resolve();
  };
  return { host, tick, errors };
}

const faults = {
  'throwing snapshot': (agent) => {
    agent.session.snapshotEvents = () => { agent.reads += 1; throw new Error('history unavailable'); };
  },
  'null snapshot': (agent) => {
    agent.session.snapshotEvents = () => { agent.reads += 1; return null; };
  },
  'non-array snapshot': (agent) => {
    agent.session.snapshotEvents = () => { agent.reads += 1; return {}; };
  },
  'null legacy events getter': (agent) => {
    delete agent.session.snapshotEvents;
    Object.defineProperty(agent.session, 'events', { get() { agent.reads += 1; return null; } });
  },
  'null log entry': (agent) => { agent.session.events.push(null); },
  'sparse event array': (agent) => { agent.session.events.length += 1; },
  'invalid event timestamp': (agent) => { agent.session.events[0].time = NaN; },
  'missing turn-end data': (agent) => { agent.session.events[0].data = null; },
  'throwing header': (agent) => {
    Object.defineProperty(agent.session, 'header', { get() { throw new Error('header unavailable'); } });
  },
  'throwing session identity': (agent) => {
    Object.defineProperty(agent.session, 'id', { get() { throw new Error('identity unavailable'); } });
  },
};

for (const [name, corrupt] of Object.entries(faults)) {
  test(`${name} cannot starve healthy sessions before or after it`, async (t) => {
    const { host, tick, errors } = scenario(t, { scanLimit: 2 });
    const before = host.agent('healthy-before', [turnEnd(1, 'interrupted')]);
    const broken = host.agent('broken', [turnEnd(1, 'interrupted')]);
    corrupt(broken);
    const after = host.agent('healthy-after', [turnEnd(1, 'interrupted')]);
    host.start();
    await tick();
    await tick(10);
    assert.equal(before.followups.length, 1, 'the earlier healthy candidate recovers in the first pass');
    assert.equal(after.followups.length, 1, 'the later healthy candidate recovers in the first pass');
    assert.equal(broken.followups.length, 0, 'a damaged history is not guessed into a continuation');
    assert.equal(errors.mock.callCount(), 1, 'the failure is reported even with verbose logging off');
    const reads = broken.reads;
    await tick(3000);
    await tick(10);
    assert.equal(errors.mock.callCount(), 1, 'the same failed session does not flood the log');
    assert.equal(broken.reads, reads, 'the same damaged snapshot is not repeatedly read');
    assert.equal(before.followups.length, 1);
    assert.equal(after.followups.length, 1);
  });
}

test('legacy sessions without a header can recover when identity and history are valid', async (t) => {
  const { host, tick } = scenario(t);
  const legacy = host.agent('legacy', [turnEnd(1, 'interrupted')]);
  delete legacy.session.header;
  host.start();
  await tick();
  await tick(10);
  assert.equal(legacy.followups.length, 1);
});

test('tool-history preparation failures are isolated and do not consume the recovery limit', async (t) => {
  const { host, tick, errors } = scenario(t, { scanLimit: 1 });
  const badTool = {
    type: 'tool/call', seq: 1, time: Date.now(),
    // Failure occurs only when the selected candidate's tool history is interpreted.
    get data() { throw new Error('cannot interpret tool history'); },
  };
  const broken = host.agent('broken-tool-history', [badTool, turnEnd(1, 'interrupted')]);
  const healthy = host.agent('healthy', [{ ...turnEnd(1, 'interrupted'), time: Date.now() - 1 }]);
  host.start();
  await tick();
  await tick(10);
  assert.equal(broken.followups.length, 0);
  assert.equal(healthy.followups.length, 1, 'a failed preparation leaves the slot available in this pass');
  assert.equal(errors.mock.callCount(), 1);
  await tick(3000);
  await tick(10);
  assert.equal(errors.mock.callCount(), 1);
  assert.equal(healthy.followups.length, 1);
});

test('an unreadable agent session does not abort iteration over the remaining agents', async (t) => {
  const { host, tick } = scenario(t);
  host.agents.set('unreadable', { get session() { throw new Error('session unavailable'); } });
  const healthy = host.agent('healthy', [turnEnd(1, 'interrupted')]);
  host.start();
  await tick();
  await tick(10);
  assert.equal(healthy.followups.length, 1);
});

test('an unavailable session getter is reported once and can become ready later', async (t) => {
  const { host, tick, errors } = scenario(t);
  const late = host.agent('late', [turnEnd(1, 'interrupted')]);
  const session = late.session;
  let ready = false;
  Object.defineProperty(late, 'session', { get() {
    if (!ready) throw new Error('session is still loading');
    return session;
  } });
  host.start();
  await tick();
  await tick(3000);
  assert.equal(errors.mock.callCount(), 1);
  ready = true;
  await tick(3000);
  await tick(10);
  assert.equal(late.followups.length, 1);
});

test('the legacy history getter is read only once per snapshot', async (t) => {
  const { host, tick } = scenario(t);
  const legacy = host.agent('legacy', [turnEnd(1, 'interrupted')]);
  const events = legacy.session.events;
  let reads = 0;
  delete legacy.session.snapshotEvents;
  Object.defineProperty(legacy.session, 'events', { get() { return ++reads === 1 ? events : null; } });
  host.start();
  await tick();
  await tick(10);
  assert.equal(legacy.followups.length, 1);
  assert.equal(reads, 1);
});

test('a new session object can recover even when the previous object with that id was quarantined', async (t) => {
  const { host, tick } = scenario(t);
  host.agent('reloaded', [null, turnEnd(1, 'interrupted')]);
  host.start();
  await tick();
  const replacement = host.agent('reloaded', [turnEnd(1, 'interrupted')]);
  await tick(3000);
  await tick(10);
  assert.equal(replacement.followups.length, 1);
});

test('registry-wide startup failures remain retryable', async (t) => {
  const { host, tick } = scenario(t);
  const healthy = host.agent('healthy', [turnEnd(1, 'interrupted')]);
  host.agents.values = () => { throw new Error('registry not ready'); };
  host.start();
  await tick();
  assert.equal(healthy.followups.length, 0);
  delete host.agents.values;
  await tick(3000);
  await tick(10);
  assert.equal(healthy.followups.length, 1);
});
