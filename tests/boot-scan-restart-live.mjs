/** Kill/restart real rc.2 agents and JSONL storage; only the model is deterministic. */
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const modules = join(project, 'tests/fixtures/dsh-0.2.1-rc.2/node_modules');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

if (process.argv[2] === 'worker') {
  const root = process.argv[3];
  const load = name => import(pathToFileURL(join(modules, '@deepseek-ai', name, 'lib/index.js')).href);
  const { Context } = await load('cordis');
  const { LlmAdapter, createUserMessage } = await load('dsh-llm');
  const ctx = new Context();
  ctx.on('session/event', (_session, event) => {
    if (event.type === 'turn/end') console.log('turn/end', JSON.stringify(event.data));
  });
  for (const name of ['dsh-session', 'dsh-agent', 'dsh-llm', 'dsh-system-prompt', 'dsh-tools', 'dsh-session-projection']) {
    const service = await load(name);
    await ctx.plugin(service.default, name === 'dsh-system-prompt' ? { personaPrefix: 'Route: {{provider}}/{{model}}' } : {});
  }
  await ctx.plugin(await load('dsh-session-persistence-jsonl'), { root: join(root, 'sessions') });
  await ctx.plugin((await load('dsh-session-query')).SessionQueryEngine);
  await ctx.plugin((await load('dsh-agent-loop')).default, {});
  await ctx.plugin((await load('dsh-host-webserver')).default, { host: '127.0.0.1', port: 0 });
  let calls = 0;
  const restart = process.argv[4] === 'restart';
  class Model extends LlmAdapter {
    async *stream(options) {
      calls++;
      assert.equal(options.provider, 'test');
      assert.equal(options.model, 'original');
      assert.match(JSON.stringify(options), /Route: test\/original/);
      if (!restart) {
        await ctx.sessionPersistence.flush();
        process.send({ ready: true });
        await new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
        return;
      }
      yield { type: 'block-start', index: 0, blockType: 'text' };
      yield { type: 'text-delta', index: 0, text: 'Recovered successfully.' };
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Recovered successfully.' } };
      yield { type: 'finish', reason: { kind: 'stop' } };
    }
  }
  ctx.llm.registerAdapter(['test'], new Model());
  if (!restart) {
    const { agent } = await ctx.agents.create({ sessionId: 'restart-test', agentOptions: { provider: 'test', model: 'original' } });
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Start the task.' }], source: { kind: 'user' } }));
  } else {
    assert.equal(ctx.agents.list().length, 0, 'no conversation was opened');
    ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'test', model: 'wrong-default' }) });
    await ctx.plugin(await import(pathToFileURL(join(root, 'lib/index.js')).href), {
      scanOnBoot: true, freshMs: 15000, graceMs: 0, cooldownMs: 0, verbose: false,
      continueTextInterrupted: 'Recover the interrupted task.',
    });
    for (let i = 0; i < 100 && !ctx.agents.get('restart-test')?.session.snapshotEvents().some(event => event.type === 'turn/end' && event.data.reason.kind === 'completed'); i++) await sleep(100);
    const agent = ctx.agents.get('restart-test');
    assert.ok(agent, 'cold session becomes a real live agent');
    const events = agent.session.snapshotEvents();
    assert.ok(events.some(event => event.type === 'turn/end' && event.data.reason.kind === 'interrupted'));
    assert.ok(events.some(event => event.type === 'turn/end' && event.data.reason.kind === 'completed'), JSON.stringify(events));
    await sleep(3300);
    assert.equal(calls, 1, 'exactly one resumed model call across another scan');
    assert.equal(events.filter(event => event.type === 'user/message' && JSON.stringify(event.data).includes('Recover the interrupted task.')).length, 1);
    await ctx.fiber.dispose();
    process.send({ recovered: true });
    process.disconnect();
  }
} else {
  const root = mkdtempSync(join(tmpdir(), 'auto-continue-restart-'));
  const children = [];
  function worker(restart = false) {
    const child = fork(fileURLToPath(import.meta.url), ['worker', root, ...(restart ? ['restart'] : [])], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    children.push(child);
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    child.result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Worker timed out\n${output}`)); }, 20000);
      child.once('message', message => { clearTimeout(timer); resolve(message); });
      child.once('exit', (code, signal) => { clearTimeout(timer); if (code !== 0) reject(new Error(`Worker exited ${code ?? signal}\n${output}`)); });
      child.once('error', reject);
    });
    return child;
  }
  try {
    mkdirSync(join(root, 'lib'));
    copyFileSync(join(project, 'lib/index.js'), join(root, 'lib/index.js'));
    copyFileSync(join(project, 'package.json'), join(root, 'package.json'));
    symlinkSync(modules, join(root, 'node_modules'), 'dir');
    const first = worker();
    assert.deepEqual(await first.result, { ready: true });
    const stopped = once(first, 'exit');
    first.kill('SIGKILL');
    await stopped;
    const second = worker(true);
    assert.deepEqual(await second.result, { recovered: true });
    console.log('Real rc.2 process restart: unopened JSONL session recovered once with its original model and prompt variables ✅');
  } finally {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        const stopped = once(child, 'exit');
        child.kill('SIGKILL');
        await stopped;
      }
    }
    rmSync(root, { recursive: true, force: true });
  }
}
