/**
 * Child-session resume scan: restart recovery for subagent / team-member sessions.
 *
 * The starting rule the plugin has always had: a child session is never
 * continued directly — its parent owns it. This suite covers the one addition
 * that rule allows: after a restart the startup scan may hand the root session
 * a single prompt listing the children that were cut off, so the parent can
 * continue or wrap them up itself.
 *
 * Exercised through the built host bundle (`../lib/index.js`) like every other
 * host test, so `npm run build` must have run first.
 */
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { makeHost, turnEnd, turnStart } from './host-fixture.mjs';

/** Long enough that any truncation in the wake text would show up. */
const CHILD = 'child-a-0123456789abcdef0123456789abcdef';
const NESTED_MID = 'child-mid-1111111111111111111111111111111';
const NESTED_LEAF = 'child-leaf-22222222222222222222222222222';

/** Wake text header the engine emits for the zh locale. */
const WAKE_HEADER = '重启时你开的以下子代理 / 团队成员会话被打断';

// ---------- PASS/FAIL reporting (expected vs actual on every failure) ----------

let checks = 0;
const pass = (label) => { checks += 1; console.log(`PASS ${label}`); };
const fail = (label, detail) => {
  console.log(`FAIL ${label} — ${detail}`);
  throw new Error(`FAIL ${label} — ${detail}`);
};
function eq(actual, expected, label) {
  try { assert.deepEqual(actual, expected); pass(label); } catch {
    fail(label, `expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
  }
}
function isTrue(value, label) {
  if (value === true) pass(label); else fail(label, `expected=true actual=${JSON.stringify(value)}`);
}
function match(text, needle, label) {
  if (typeof text === 'string' && text.includes(needle)) pass(label);
  else fail(label, `expected to contain ${JSON.stringify(needle)} actual=${JSON.stringify(text)}`);
}
function notMatch(text, needle, label) {
  if (typeof text === 'string' && !text.includes(needle)) pass(label);
  else fail(label, `expected NOT to contain ${JSON.stringify(needle)} actual=${JSON.stringify(text)}`);
}

// ---------- fake host ----------

function scenario(t, config = {}) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
  // zh so the wake text and cause copy are asserted in the user's language.
  const host = makeHost({ locale: 'zh', ...config });
  t.after(() => host.dispose());
  const tick = async (ms = 0) => {
    t.mock.timers.tick(ms);
    // Drain the async cold-read chain and the zero-delay yields between batches.
    for (let i = 0; i < 400; i += 1) {
      t.mock.timers.tick(0);
      await Promise.resolve();
    }
  };
  const textOf = (message) => (message?.content ?? [])
    .filter((part) => part !== null && typeof part === 'object' && part.type === 'text')
    .map((part) => part.text)
    .join('\n');
  return { host, tick, textOf };
}

/**
 * Storage-backed fixture: one root session (live, so a wake-up can be observed)
 * plus zero or more stored child sessions. `observeSession` counts reads per id
 * so a test can prove the plugin never looked at a child log.
 */
function childSweep(t, {
  rootEvents,
  children = [],
  config = {},
  rootId = 'root',
  rootLive = true,
  services = {},
} = {}) {
  const { host, tick, textOf } = scenario(t, config);
  for (const [name, service] of Object.entries(services)) host.provide(name, service);
  const eventsById = new Map([[rootId, rootEvents]]);
  const records = [{ header: { id: rootId, origin: 'main' }, live: rootLive, persisted: true }];
  for (const child of children) {
    eventsById.set(child.id, child.events);
    records.push({
      header: {
        id: child.id,
        origin: 'subagent',
        parentSession: child.parentSession === undefined ? rootId : child.parentSession,
        title: child.title,
        agentPreset: child.preset,
      },
      live: false,
      persisted: child.persisted === undefined ? true : child.persisted,
    });
  }
  const observations = new Map();
  const observedTotal = () => [...observations.values()].reduce((sum, count) => sum + count, 0);
  host.provide('sessionQuery', {
    listSessions: async () => records.map((record) => ({ ...record, header: { ...record.header } })),
    observeSession: async (id) => {
      observations.set(id, (observations.get(id) ?? 0) + 1);
      const events = eventsById.get(id);
      if (events === undefined) throw new Error(`no stored log for ${id}`);
      return {
        events: [...events],
        header: { ...(records.find((record) => record.header.id === id)?.header ?? { id }) },
        projections: { values: {} },
        [Symbol.dispose]: () => {},
      };
    },
  });
  const parent = rootLive ? host.agent(rootId, rootEvents) : undefined;
  host.start();
  return { host, tick, textOf, parent, observations, observedTotal, records };
}

/** A parent that finished its turn cleanly: the only state a wake is designed for. */
const cleanRoot = () => [turnStart(1), turnEnd(1, 'completed')];

/**
 * Fake `goals` service. `view` is the GoalView-shaped object the host's `view()`
 * really returns — or a thunk, for tests that need a fresh object per call.
 *
 * `strictRevision` mirrors the real `dsh-goal` `resume()` contract: it runs the
 * same CAS check `expectCurrent` does — a ref whose `revision` does not match
 * the stored goal revision throws GOAL_STALE_REVISION. The throw is recorded in
 * `calls.errors` (and then rethrown) so a test can prove the engine swallowed it
 * as a log line instead of tearing the sweep down.
 */
const goalService = (view, { strictRevision = false, revision = 1 } = {}) => {
  const calls = { get: 0, resume: [], errors: [] };
  return {
    calls,
    get(agent) { calls.get += 1; calls.agent = agent; return typeof view === 'function' ? view() : view; },
    resume(agent, ref) {
      calls.resume.push({ agent, ref });
      if (strictRevision && (ref === undefined || ref.revision !== revision)) {
        const error = new Error('GOAL_STALE_REVISION');
        calls.errors.push(error);
        throw error;
      }
    },
  };
};

// ---------- ① open-turn child + completed parent => wake with full evidence ----------

test('① an interrupted child wakes its cleanly finished root, with the child id spelled out', async (t) => {
  const { tick, textOf, parent } = childSweep(t, {
    rootEvents: cleanRoot(),
    children: [{ id: CHILD, events: [turnStart(1)], title: 'audit docs', preset: 'skill-master' }],
    config: { resumeInterruptedChildren: true },
  });
  await tick();
  eq(parent.followups.length, 1, '① the root receives exactly one wake-up prompt');
  const text = textOf(parent.followups[0]);
  match(text, CHILD, '① wake text carries the child session id in full (no truncation)');
  match(text, WAKE_HEADER, '① wake text names the restart interruption');
  match(text, 'send_message', '① wake text tells the parent how to continue a child');
  match(text, '回合开始后中断', '① wake text states the interruption cause');
  match(text, 'audit docs', '① wake text carries the child title when the host recorded one');
});

// ---------- ② child aborted{user} => no wake ----------

test('② a child the user stopped is never handed to the parent', async (t) => {
  const { tick, parent, observations } = childSweep(t, {
    rootEvents: cleanRoot(),
    children: [{ id: CHILD, events: [turnStart(1), turnEnd(1, 'aborted', { reason: { kind: 'user' } })] }],
    config: { resumeInterruptedChildren: true },
  });
  await tick();
  eq(parent.followups.length, 0, '② a user-stopped child does not wake the root');
  eq(observations.get(CHILD), 1, '② the child tail was still inspected once');
});

// ---------- ③ child aborted{disposed} => wake ----------

test('③ a child the host disposed during the restart wakes the root', async (t) => {
  const { tick, textOf, parent } = childSweep(t, {
    rootEvents: cleanRoot(),
    children: [{ id: CHILD, events: [turnStart(1), turnEnd(1, 'aborted', { reason: { kind: 'disposed' } })] }],
    config: { resumeInterruptedChildren: true },
  });
  await tick();
  eq(parent.followups.length, 1, '③ a host-disposed child wakes the root');
  match(textOf(parent.followups[0]), '宿主销毁', '③ the cause is reported as a host disposal');
});

// ---------- ④ parent aborted{user} => no wake ----------

test('④ a parent the user stopped never gets a ghost turn', async (t) => {
  const { tick, parent } = childSweep(t, {
    rootEvents: [turnStart(1), turnEnd(1, 'aborted', { reason: { kind: 'user' } })],
    children: [{ id: CHILD, events: [turnStart(1)] }],
    config: { resumeInterruptedChildren: true },
  });
  await tick();
  eq(parent.followups.length, 0, '④ a manually stopped root accepts no wake-up');
});

// ---------- ⑤ parent open-turn => no wake (main path owns it) ----------

test('⑤ an interrupted parent is left to the main recovery path', async (t) => {
  const { tick, textOf, parent } = childSweep(t, {
    rootEvents: [turnStart(1)],
    children: [{ id: CHILD, events: [turnStart(1)] }],
    config: { resumeInterruptedChildren: true },
  });
  await tick();       // sweep + (blocked) wake attempt
  await tick(10);     // main-path grace timer
  const texts = parent.followups.map(textOf);
  isTrue(texts.every((text) => !text.includes(WAKE_HEADER)), '⑤ no child wake-up is sent when the root is itself interrupted');
  isTrue(texts.every((text) => !text.includes(CHILD)), '⑤ the root is never handed the child id in that case');
});

// ---------- ⑥ flag off => not a single child observation ----------

test('⑥ with resumeInterruptedChildren off the plugin never reads a child log', async (t) => {
  // Deliberately identical to ① except for the switch: the parent is clean, the
  // child is interrupted. Off must mean zero reads and zero wake-ups.
  const { tick, parent, observedTotal } = childSweep(t, {
    rootEvents: cleanRoot(),
    children: [{ id: CHILD, events: [turnStart(1)] }],
    config: { resumeInterruptedChildren: false },
  });
  await tick();
  eq(observedTotal(), 0, '⑥ no observeSession call at all while the switch is off');
  eq(parent.followups.length, 0, '⑥ and no wake-up is sent');
});

// ---------- ⑦ same batch, later rounds => one observation, one wake ----------

test('⑦ a later scan round never repeats the same batch', async (t) => {
  const { tick, parent, observations } = childSweep(t, {
    rootEvents: cleanRoot(),
    children: [{ id: CHILD, events: [turnStart(1)] }],
    config: { resumeInterruptedChildren: true },
  });
  await tick();
  eq(parent.followups.length, 1, '⑦ the first round wakes the root once');
  await tick(3000);
  await tick(3000);
  eq(parent.followups.length, 1, '⑦ later rounds do not repeat the same batch');
  eq(observations.get(CHILD), 1, '⑦ and the child log is not read again');
});

// ---------- ⑧ nested child => wake the root, not the middle session ----------

test('⑧ a child of a subagent climbs to the root session', async (t) => {
  const { tick, textOf, parent } = childSweep(t, {
    rootEvents: cleanRoot(),
    children: [
      { id: NESTED_MID, events: cleanRoot(), title: 'middle' },
      { id: NESTED_LEAF, events: [turnStart(1)], parentSession: NESTED_MID, title: 'leaf' },
    ],
    config: { resumeInterruptedChildren: true },
  });
  await tick();
  eq(parent.followups.length, 1, '⑧ the root is woken exactly once for the nested grandchild');
  const text = textOf(parent.followups[0]);
  match(text, NESTED_LEAF, '⑧ the interrupted grandchild is the session listed');
  notMatch(text, NESTED_MID, '⑧ the cleanly finished middle session is not listed');
});

// ---------- ⑨ dirty parent reference => skip, no crash ----------

test('⑨ a child whose parent is not in the listing is skipped safely', async (t) => {
  const { tick, parent, observations } = childSweep(t, {
    rootEvents: cleanRoot(),
    children: [{ id: CHILD, events: [turnStart(1)], parentSession: 'ghost-session-absent' }],
    config: { resumeInterruptedChildren: true },
  });
  await tick();
  eq(observations.get(CHILD), undefined, '⑨ a dangling parent reference is never observed');
  eq(parent.followups.length, 0, '⑨ and nothing is woken');
  isTrue(true, '⑨ the scan survived the dirty reference without throwing');
});

// ---------- ⑩ goals ----------

/**
 * Real GoalView shape, verified against the unpacked dsh-goal bundle: `view()`
 * returns `{ ...state.goal, roundsStarted, createdAt, updatedAt, activation }`.
 * The goal keys are exactly `id, maxGoalRounds, objective, phase, revision` —
 * there is NO `ref` field, and `revision` is always present. The old stub
 * invented `ref: { id }`, which is why the re-arm used to throw every time.
 */
const activeDisarmedGoal = () => ({ id: 'goal-1', revision: 1, phase: 'active', activation: 'disarmed' });

test('⑩-a an active goal disarmed by the restart is re-armed once', async (t) => {
  const goals = goalService(activeDisarmedGoal());
  const { tick, parent } = childSweep(t, {
    rootEvents: cleanRoot(),
    children: [{ id: CHILD, events: [turnStart(1)] }],
    config: { resumeInterruptedChildren: true, resumeGoals: true },
    services: { goals },
  });
  await tick();
  eq(goals.calls.resume.length, 1, '⑩-a goals.resume is called exactly once');
  eq(goals.calls.resume[0]?.ref, { id: 'goal-1', revision: 1 }, '⑩-a the goal reference carries id AND the current revision');
  isTrue(goals.calls.resume[0]?.agent === parent, '⑩-a the live root agent is the re-arm target');
});

test('⑩-b a paused goal stays paused unless resumePausedGoals is on', async (t) => {
  const goals = goalService(() => ({ id: 'goal-2', revision: 1, phase: 'paused', activation: 'disarmed' }));
  const { tick } = childSweep(t, {
    rootEvents: cleanRoot(),
    children: [{ id: CHILD, events: [turnStart(1)] }],
    config: { resumeInterruptedChildren: true, resumeGoals: true },
    services: { goals },
  });
  await tick();
  eq(goals.calls.resume.length, 0, '⑩-b a hand-paused goal is not resumed by default');
});

test('⑩-c with resumeGoals off the goals service is never touched', async (t) => {
  const goals = goalService(activeDisarmedGoal());
  const { tick } = childSweep(t, {
    rootEvents: cleanRoot(),
    children: [{ id: CHILD, events: [turnStart(1)] }],
    config: { resumeInterruptedChildren: true, resumeGoals: false, resumePausedGoals: true },
    services: { goals },
  });
  await tick();
  eq(goals.calls.get, 0, '⑩-c goals.get is never called when re-arming is off');
  eq(goals.calls.resume.length, 0, '⑩-c and nothing is re-armed');
});

/**
 * ⑩-d — the real-API CAS check, on the happy path.
 *
 * The stub now enforces what `dsh-goal` really enforces: `resume(agent, ref)`
 * compares `ref.id`/`ref.revision` against the stored goal and throws
 * GOAL_STALE_REVISION on any mismatch. This is the test the original bug should
 * have died on: a ref of `{ id }` (no revision) is rejected by the real service,
 * the throw is swallowed by the engine's catch, and the switch silently does
 * nothing. Here the ref must pass the check, so no error may be recorded.
 */
test('⑩-d the real revision check accepts the re-arm reference', async (t) => {
  const goals = goalService(activeDisarmedGoal(), { strictRevision: true, revision: 1 });
  const { tick } = childSweep(t, {
    rootEvents: cleanRoot(),
    children: [{ id: CHILD, events: [turnStart(1)] }],
    config: { resumeInterruptedChildren: true, resumeGoals: true },
    services: { goals },
  });
  await tick();
  eq(goals.calls.resume.length, 1, '⑩-d goals.resume is reached once');
  eq(goals.calls.errors.length, 0,
    '⑩-d the re-arm did NOT throw GOAL_STALE_REVISION (a revision-less ref would throw here)');
  eq(goals.calls.resume[0]?.ref, { id: 'goal-1', revision: 1 },
    '⑩-d the reference satisfies resume(agent, { id, revision })');
});

/**
 * ⑩-e — the missing-revision trap, locked shut.
 *
 * Real GoalView always carries `revision`; this stub drops it on purpose, so any
 * implementation that builds a ref out of `view` can only produce
 * `revision: undefined`. Real `expectCurrent` rejects that, and the engine must
 * stay alive: the sweep keeps going and still hands the root its wake-up prompt.
 *
 * Deliberately shape-agnostic: a correct engine may fail closed BEFORE calling
 * resume (skip the goal, log it) or may call resume and let the CAS check reject
 * it. Both are "no silent success", which is what this test locks — what must
 * never happen again is a re-arm that looks like it worked.
 */
test('⑩-e a goal view without revision never ends up as a successful re-arm', async (t) => {
  // No `revision` key at all — the shape the fabricated stub used to have.
  const goals = goalService({ id: 'goal-1', phase: 'active', activation: 'disarmed' },
    { strictRevision: true, revision: 1 });
  const { tick, parent } = childSweep(t, {
    rootEvents: cleanRoot(),
    children: [{ id: CHILD, events: [turnStart(1)] }],
    config: { resumeInterruptedChildren: true, resumeGoals: true },
    services: { goals },
  });
  await tick(); // must not reject: the engine catches the stale-revision failure
  eq(goals.calls.resume.length - goals.calls.errors.length, 0,
    '⑩-e zero successful re-arms when the view has no revision');
  eq(goals.calls.errors.length, goals.calls.resume.length,
    '⑩-e every attempt was rejected by the real CAS check (or none was attempted)');
  if (goals.calls.resume.length === 0) {
    pass('⑩-e engine failed closed: the revision-less view never reached resume');
  } else {
    pass('⑩-e engine attempted the re-arm and the real CAS check rejected it');
    match(goals.calls.errors[0]?.message, 'GOAL_STALE_REVISION',
      '⑩-e the rejection is the real stale-revision error');
  }
  eq(parent.followups.length, 1, '⑩-e the sweep still finished and woke the root');
  isTrue(true, '⑩-e the missing revision did not crash the scan');
});

// ---------- ⑪ one-shot children have no log to resume ----------

test('⑪ a one-shot child that was already discarded is not observed', async (t) => {
  const { tick, parent, observations } = childSweep(t, {
    rootEvents: cleanRoot(),
    children: [{ id: CHILD, events: [turnStart(1)], persisted: false }],
    config: { resumeInterruptedChildren: true },
  });
  await tick();
  eq(observations.get(CHILD), undefined, '⑪ a discarded one-shot child log is never read');
  eq(parent.followups.length, 0, '⑪ and it cannot wake the root');
});

// ---------- ⑫ bounded per round (CHILD_SWEEP_LIMIT = 8) ----------

test('⑫ child observations stay bounded to eight per scan round', async (t) => {
  const ids = Array.from({ length: 9 }, (_, index) => `quota-child-${index}`);
  const { tick, textOf, parent, observations } = childSweep(t, {
    rootEvents: cleanRoot(),
    children: ids.map((id) => ({ id, events: [turnStart(1)] })),
    config: { resumeInterruptedChildren: true },
  });
  await tick();
  const observed = ids.filter((id) => observations.has(id));
  eq(observed.length, 8, '⑫ at most eight child logs are read in one round');
  eq(observations.get('quota-child-8'), undefined, '⑫ the ninth child waits for the next round');
  eq(parent.followups.length, 1, '⑫ the observed batch still produces exactly one wake-up');
  const text = textOf(parent.followups[0]);
  match(text, 'quota-child-7', '⑫ the last observed child is listed');
  notMatch(text, 'quota-child-8', '⑫ the unobserved child is not listed');
});

after(() => {
  console.log(`\nchild-resume-scan: ${checks} checks passed`);
});
