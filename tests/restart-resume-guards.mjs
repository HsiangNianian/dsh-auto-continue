/** Restart recovery must not speak for the user. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeHost } from './host-fixture.mjs';

function scenario(t, config = {}) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
  const logs = [];
  t.mock.method(console, 'info', (message) => { logs.push(String(message)); });
  const host = makeHost({ locale: 'en', verbose: true, ...config });
  t.after(() => host.dispose());
  const tick = async (ms = 0) => {
    t.mock.timers.tick(ms);
    for (let i = 0; i < 50; i += 1) {
      t.mock.timers.tick(0);
      await Promise.resolve();
    }
  };
  // Startup scan, then the grace period before the send.
  const settle = async () => { await tick(); await tick(10); await tick(10); };
  return { host, settle, logs };
}

/** Number the events in order, all fresh. */
const log = (...events) => events.map((event, index) => ({ ...event, seq: index + 1, time: Date.now() }));
const start = (turn) => ({ type: 'turn/start', data: { turn } });
const end = (turn, kind, extra = {}) => ({ type: 'turn/end', data: { turn, reason: { kind, ...extra } } });
const said = (text, kind = 'user') => ({
  type: 'user/message',
  data: { id: `m-${Math.random()}`, role: 'user', source: { kind }, content: [{ type: 'text', text }] },
});
const reply = (turn, text) => ({
  type: 'assistant/message',
  data: { turn, message: { role: 'assistant', content: [{ type: 'text', text }] } },
});
const call = (turn, name, callId) => ({
  type: 'tool/call',
  data: { turn, step: 1, name, callId, arguments: '{}' },
});
const result = (turn, callId, text, isError = false) => ({
  type: 'tool/result',
  data: {
    turn,
    step: 1,
    message: {
      source: { kind: 'tool', callId },
      role: 'user',
      content: [{ type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text }], isError }],
    },
  },
});
const goals = (phase) => ({
  get: () => ({ id: 'goal-1', revision: 1, phase, activation: 'disarmed' }),
  resume() {},
});
const textOf = (agent) => agent.followups.map((message) => message.content[0].text);

const INTERRUPTED = 'Continue. The harness was restarted';
const QUESTION = "This message was sent automatically by the plugin after a harness restart; it is not the user's reply.";

// ---------- goal phase ----------

for (const phase of ['paused', 'blocked']) {
  test(`a ${phase} goal is not resumed by restart recovery`, async (t) => {
    const { host, settle, logs } = scenario(t);
    host.provide('goals', goals(phase));
    const agent = host.agent('held', log(start(1), end(1, 'interrupted')));
    host.start();
    await settle();
    assert.equal(agent.followups.length, 0);
    assert(logs.some((line) => line.includes(`goal 处于 ${phase}`)), 'the skip is logged with the phase');
  });
}

test('an active goal, or a host without goals, still recovers after a restart', async (t) => {
  const { host, settle } = scenario(t);
  host.provide('goals', goals('active'));
  const active = host.agent('active', log(start(1), end(1, 'interrupted')));
  host.start();
  await settle();
  assert.match(textOf(active)[0], new RegExp(`^${INTERRUPTED}`));
});

test('resumePausedGoals keeps permitting paused goals, but never blocked ones', async (t) => {
  const { host, settle } = scenario(t, { resumeGoals: true, resumePausedGoals: true });
  const paused = host.agent('paused', log(start(1), end(1, 'interrupted')));
  const blocked = host.agent('blocked', log(start(1), end(1, 'interrupted')));
  host.provide('goals', { get: (agent) => ({ id: 'g', revision: 1, phase: agent.session.id, activation: 'disarmed' }), resume() {} });
  host.start();
  await settle();
  assert.equal(paused.followups.length, 1);
  assert.equal(blocked.followups.length, 0);
});

test('a held goal also stops retryable-error retries, but not finishing a cut-off answer', async (t) => {
  const { host, settle } = scenario(t);
  host.provide('goals', goals('paused'));
  const errored = host.agent('errored', log(start(1), end(1, 'error', { error: { code: 'UPSTREAM', status: 502, message: 'bad gateway' } })));
  const truncated = host.agent('truncated', log(start(1), end(1, 'max-tokens')));
  host.start();
  await settle();
  assert.equal(errored.followups.length, 0, 'a retry would read as the user resuming the goal');
  assert.equal(truncated.followups.length, 1, 'max-tokens only asks for the rest of the same answer');
});

test('a held goal does not stop the autonomous loop the user turned on', async (t) => {
  const { host, settle } = scenario(t, { resumeCompletedTurns: true, scanOnBoot: false });
  host.provide('goals', goals('paused'));
  const agent = host.agent('loop');
  host.start();
  for (const event of log(start(1), reply(1, 'Visible answer'), end(1, 'completed'))) host.emit(agent, event);
  await settle();
  assert.deepEqual(textOf(agent), ['Continue']);
});

// ---------- unanswered question ----------

test('an interrupted ask_user_question gets the question text, without the guard note', async (t) => {
  const { host, settle } = scenario(t);
  const agent = host.agent('asked', log(start(1), call(1, 'ask_user_question', 'q1'), end(1, 'interrupted')));
  host.start();
  await settle();
  assert.deepEqual(textOf(agent), [LOCALIZED_QUESTION.en]);
});

test('the host closer result (unknown outcome) still counts as unanswered', async (t) => {
  const { host, settle } = scenario(t, { locale: 'zh' });
  const agent = host.agent('closed', log(
    start(1), call(1, 'ask_user_question', 'q1'), result(1, 'q1', 'TOOL_OUTCOME_UNKNOWN', true), end(1, 'interrupted'),
  ));
  host.start();
  await settle();
  assert.deepEqual(textOf(agent), [LOCALIZED_QUESTION.zh]);
});

test('an answered question, or another pending tool, keeps the usual text and guard', async (t) => {
  const { host, settle } = scenario(t);
  const answered = host.agent('answered', log(
    start(1), call(1, 'ask_user_question', 'q1'), result(1, 'q1', '{"answers":[]}'), end(1, 'interrupted'),
  ));
  const other = host.agent('other', log(start(1), call(1, 'bash', 'b1'), end(1, 'interrupted')));
  host.start();
  await settle();
  assert.match(textOf(answered)[0], /^Continue\. The harness was restarted.* \(The previous tool "ask_user_question" completed successfully/);
  assert.match(textOf(other)[0], /^Continue\. The harness was restarted.* \(The previous tool "bash" may not have completed/);
});

test('continueTextQuestion can be customized', async (t) => {
  const { host, settle } = scenario(t, { continueTextQuestion: 'Ask again (turn {turn}).' });
  const agent = host.agent('custom', log(start(1), call(1, 'ask_user_question', 'q1'), end(1, 'interrupted')));
  host.start();
  await settle();
  assert.deepEqual(textOf(agent), ['Ask again (turn 1).']);
});

// ---------- consecutive cap across restarts ----------

const RESTART_TEXT = `${INTERRUPTED} while your previous turn was still running; tool calls pending at the restart are recorded with unknown outcomes. Resume where you left off, verifying external state before retrying anything that may have side effects.`;

/** The user's request, then `count` rounds of: our continuation -> turn cut off by a restart. */
const crashLoop = (count, text = RESTART_TEXT, kind = 'user') => {
  const events = [said('Build the thing'), start(1), end(1, 'interrupted')];
  for (let turn = 2; turn <= count + 1; turn += 1) events.push(said(text, kind), start(turn), end(turn, 'interrupted'));
  return events;
};
/** One more continuation and restart after `events`. */
const another = (turn) => [said(RESTART_TEXT), start(turn), end(turn, 'interrupted')];

test('continuations sent before the restart count toward maxConsecutive', async (t) => {
  const { host, settle, logs } = scenario(t);
  const capped = host.agent('capped', log(...crashLoop(3)));
  const below = host.agent('below', log(...crashLoop(2)));
  host.start();
  await settle();
  assert.equal(capped.followups.length, 0, 'three continuations already: the cap holds across the restart');
  assert(logs.some((line) => line.includes('重启前已连续自动继续 3 次')));
  assert.equal(below.followups.length, 1, 'two before the restart leave room for one more');
});

test('plugin-source continuations are counted exactly, including texts changed since', async (t) => {
  const { host, settle } = scenario(t);
  const agent = host.agent('plugin', log(...crashLoop(3, 'an older custom text', 'plugin:dsh-client-auto-continue')));
  host.start();
  await settle();
  assert.equal(agent.followups.length, 0);
});

test('a guard note or filled placeholders still identify our continuation', async (t) => {
  const { host, settle } = scenario(t, { continueTextInterrupted: 'Restarted in turn {turn}' });
  const agent = host.agent('guarded', log(
    said('Build the thing'), start(1), end(1, 'interrupted'),
    said('Restarted in turn 1 (The previous tool "bash" may not have completed. Check its state before continuing and do not run it again.)'),
    start(2), end(2, 'interrupted'),
    said('Restarted in turn 2'), start(3), end(3, 'interrupted'),
    said('Restarted in turn 3'), start(4), end(4, 'interrupted'),
  ));
  host.start();
  await settle();
  assert.equal(agent.followups.length, 0);
});

test('a real user message, a user stop or a visible completion resets the count', async (t) => {
  const { host, settle } = scenario(t);
  const human = host.agent('human', log(...crashLoop(3), said('Continue, but skip the tests'), start(9), end(9, 'interrupted')));
  const stopped = host.agent('stopped', log(...crashLoop(3), start(9), end(9, 'aborted', { reason: { kind: 'user' } }), ...another(10)));
  const succeeded = host.agent('succeeded', log(...crashLoop(3), start(9), reply(9, 'Done.'), end(9, 'completed'), ...another(10)));
  const silent = host.agent('silent', log(...crashLoop(2), start(9), end(9, 'completed'), ...another(10)));
  host.start();
  await settle();
  assert.equal(human.followups.length, 1, 'a message that is not a continue text is the user stepping in');
  assert.equal(stopped.followups.length, 1);
  assert.equal(succeeded.followups.length, 1);
  assert.equal(silent.followups.length, 0, 'a completion without visible output is not a success');
});

test('loop rounds after a visible completion do not count, as in memory', async (t) => {
  const { host, settle } = scenario(t, { resumeCompletedTurns: true });
  const events = [said('Build the thing')];
  for (let turn = 1; turn <= 4; turn += 1) events.push(start(turn), reply(turn, `step ${turn}`), end(turn, 'completed'), said('Continue'));
  events.push(start(5), end(5, 'interrupted'));
  const agent = host.agent('loop', log(...events));
  host.start();
  await settle();
  assert.equal(agent.followups.length, 1);
});

const LOCALIZED_QUESTION = {
  en: "This message was sent automatically by the plugin after a harness restart; it is not the user's reply. The question you asked the user was cut off by the restart and has not been answered. Ask the same question again and wait for the answer; do not decide for the user.",
  zh: '这是宿主重启后插件自动发送的消息, 不是用户的回复。你上一步向用户提出的问题因重启中断, 用户还没有回答。请重新提出同一个问题并等待回答, 不要替用户做决定。',
};
assert(LOCALIZED_QUESTION.en.startsWith(QUESTION));
