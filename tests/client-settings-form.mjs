/** Focused race tests for the staged settings form. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { transform } from 'esbuild';

const source = readFileSync(new URL('../src/client/settings-form.ts', import.meta.url), 'utf8');
const compiled = await transform(source, { loader: 'ts', format: 'esm', target: 'node18' });
const { CardForm, numberField } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`
);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function createScope(values = { graceMs: 3000, cooldownMs: 300 }) {
  let snapshot = {
    status: 'ready',
    value: { ...values },
    base: { graceMs: 1000, cooldownMs: 100 },
    user: { ...values },
    revision: 0,
    writable: true,
    mode: 'host',
  };
  const listeners = new Set();
  const writes = [];
  let heldWrite;
  const notify = () => { for (const listener of listeners) listener(); };
  const scope = {
    writes,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    holdNextWrite() {
      const started = deferred();
      const result = deferred();
      heldWrite = { started, result };
      return {
        started: started.promise,
        settle: result.resolve,
        reject: result.reject,
      };
    },
    async set(field, value) {
      writes.push(['set', field, value]);
      if (heldWrite !== undefined) {
        const held = heldWrite;
        heldWrite = undefined;
        held.started.resolve();
        if (!(await held.result.promise)) return false;
      }
      snapshot = {
        ...snapshot,
        value: { ...snapshot.value, [field]: value },
        user: { ...snapshot.user, [field]: value },
        revision: snapshot.revision + 1,
      };
      notify();
      return true;
    },
    async unset(field) {
      writes.push(['unset', field]);
      if (heldWrite !== undefined) {
        const held = heldWrite;
        heldWrite = undefined;
        held.started.resolve();
        if (!(await held.result.promise)) return false;
      }
      const user = { ...snapshot.user };
      delete user[field];
      snapshot = {
        ...snapshot,
        value: { ...snapshot.value, [field]: snapshot.base[field] },
        user,
        revision: snapshot.revision + 1,
      };
      notify();
      return true;
    },
    changeExternally(field, value) {
      snapshot = {
        ...snapshot,
        value: { ...snapshot.value, [field]: value },
        user: { ...snapshot.user, [field]: value },
        revision: snapshot.revision + 1,
      };
      notify();
    },
  };
  return scope;
}

function createForm(scope) {
  return new CardForm(scope, [numberField('graceMs'), numberField('cooldownMs')]);
}

test('a newer same-field edit survives a pending successful save', async () => {
  const scope = createScope();
  const form = createForm(scope);
  const gate = scope.holdNextWrite();
  form.actions().edit('graceMs', '5000');
  const saving = form.save();
  await gate.started;

  form.actions().edit('graceMs', '9000');
  gate.settle(true);
  await saving;

  assert.equal(scope.getSnapshot().value.graceMs, 5000);
  assert.equal(form.field('graceMs').text, '9000');
  assert.equal(form.shell().dirty, true);
});

test('a newer same-text edit is preserved by identity, not consumed by the save', async () => {
  const scope = createScope();
  const form = createForm(scope);
  const gate = scope.holdNextWrite();
  form.actions().edit('graceMs', '5000');
  const saving = form.save();
  await gate.started;

  form.actions().edit('graceMs', '5000');
  gate.settle(true);
  await saving;
  scope.changeExternally('graceMs', 7000);

  assert.equal(form.field('graceMs').text, '5000');
  assert.equal(form.shell().dirty, true);
});

test('the draft written by a successful save clears', async () => {
  const scope = createScope();
  const form = createForm(scope);
  const gate = scope.holdNextWrite();
  form.actions().edit('graceMs', '5000');
  const saving = form.save();
  await gate.started;
  gate.settle(true);
  await saving;

  scope.changeExternally('graceMs', 7000);
  assert.equal(form.field('graceMs').text, '7000');
  assert.equal(form.shell().dirty, false);
});

test('a draft for another field survives a successful save', async () => {
  const scope = createScope();
  const form = createForm(scope);
  const gate = scope.holdNextWrite();
  form.actions().edit('graceMs', '5000');
  const saving = form.save();
  await gate.started;

  form.actions().edit('cooldownMs', '900');
  gate.settle(true);
  await saving;

  assert.equal(form.field('graceMs').text, '5000');
  assert.equal(form.field('cooldownMs').text, '900');
  assert.equal(form.shell().dirty, true);
});

test('failed writes retain the original and newer drafts', async () => {
  const scope = createScope();
  const form = createForm(scope);
  const gate = scope.holdNextWrite();
  form.actions().edit('graceMs', '5000');
  const saving = form.save();
  await gate.started;

  form.actions().edit('cooldownMs', '900');
  gate.settle(false);
  await saving;

  assert.equal(form.field('graceMs').text, '5000');
  assert.equal(form.field('cooldownMs').text, '900');
  assert.equal(form.shell().failed, true);
  assert.equal(form.shell().dirty, true);
});

test('a clear staged while a set is pending survives and can be saved', async () => {
  const scope = createScope();
  const form = createForm(scope);
  const gate = scope.holdNextWrite();
  form.actions().edit('graceMs', '5000');
  const saving = form.save();
  await gate.started;

  form.actions().edit('graceMs', '');
  gate.settle(true);
  await saving;

  assert.equal(form.field('graceMs').text, '');
  assert.equal(form.shell().dirty, true);
  await form.save();
  assert.equal(Object.hasOwn(scope.getSnapshot().user, 'graceMs'), false);
  assert.deepEqual(scope.writes, [['set', 'graceMs', 5000], ['unset', 'graceMs']]);
});

test('resetField staged while a set is pending survives and can be saved', async () => {
  const scope = createScope();
  const form = createForm(scope);
  const gate = scope.holdNextWrite();
  form.actions().edit('graceMs', '5000');
  const saving = form.save();
  await gate.started;

  form.actions().resetField('graceMs');
  gate.settle(true);
  await saving;

  assert.equal(form.field('graceMs').text, '1000');
  assert.equal(form.shell().dirty, true);
  await form.save();
  assert.equal(Object.hasOwn(scope.getSnapshot().user, 'graceMs'), false);
});

test('a set staged while resetField is pending survives the unset', async () => {
  const scope = createScope();
  const form = createForm(scope);
  const gate = scope.holdNextWrite();
  form.actions().resetField('graceMs');
  const saving = form.save();
  await gate.started;

  form.actions().edit('graceMs', '9000');
  gate.settle(true);
  await saving;

  assert.equal(scope.getSnapshot().value.graceMs, 1000);
  assert.equal(form.field('graceMs').text, '9000');
  assert.equal(form.shell().dirty, true);
});

test('discard removes drafts before and during a pending save', async () => {
  const scope = createScope();
  const form = createForm(scope);
  const actions = form.actions();
  actions.edit('cooldownMs', '900');
  actions.discard();
  assert.equal(form.field('cooldownMs').text, '300');
  assert.equal(form.shell().dirty, false);

  const gate = scope.holdNextWrite();
  actions.edit('graceMs', '5000');
  const saving = form.save();
  await gate.started;

  actions.edit('graceMs', '9000');
  actions.discard();
  gate.settle(true);
  await saving;

  assert.equal(form.field('graceMs').text, '5000');
  assert.equal(form.shell().dirty, false);
});
