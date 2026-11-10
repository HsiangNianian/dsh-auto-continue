/** Verify echo matching itself, independently of non-user event handling. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { transform } from 'esbuild';

const source = readFileSync(new URL('../src/shared/core.ts', import.meta.url), 'utf8');
const compiled = await transform(source, { loader: 'ts', format: 'esm', target: 'node18' });
const { freshState, trackPendingEcho, isOurEcho } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`
);

for (const kind of ['plugin:dsh-client-auto-continue', 'user']) {
  test(`${kind} echo matches and consumes its pending message ID once`, () => {
    const state = freshState();
    const event = {
      type: 'user/message',
      data: { id: 'pending-message', source: { kind } },
    };
    trackPendingEcho(state, event.data.id);

    assert.equal(isOurEcho(state, event), true, 'the tracked echo must match');
    assert.equal(state.pendingEchoMessageIds.has(event.data.id), false, 'matching must consume the ID');
    assert.equal(isOurEcho(state, event), false, 'a duplicate echo must not match again');
  });
}
