/** Verify that the committed browser bundle loads in both DSH module layouts. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = dirname(fileURLToPath(import.meta.url));
const bundle = readFileSync(join(root, '../lib/client.js'), 'utf8');

function snapshotStoreModule() {
  return {
    createSnapshotStore(init) {
      let value = init;
      const listeners = new Set();
      return {
        getSnapshot: () => value,
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        update(mutator) {
          mutator(value);
          for (const listener of listeners) listener();
        },
        set(next) {
          value = next;
          for (const listener of listeners) listener();
        },
      };
    },
  };
}

function loadClient(availableStore) {
  let registration;
  vm.runInNewContext(bundle, {
    console,
    URL,
    window: {
      __ModuleLoader__: {
        load(next) {
          registration = next;
        },
      },
    },
  });
  assert.ok(registration, 'client bundle registers with the DSH module loader');

  const requests = [];
  const exported = registration.factory((specifier) => {
    requests.push(specifier);
    if (specifier === 'react' || specifier === 'react/jsx-runtime') return {};
    if (specifier === availableStore) return snapshotStoreModule();
    throw new Error(`module unavailable in this DSH cohort: ${specifier}`);
  });
  assert.equal(typeof exported.apply, 'function');
  return requests;
}

const current = loadClient('@deepseek-ai/dsh-client-store');
assert.ok(current.includes('@deepseek-ai/dsh-client-store'));
assert.ok(!current.includes('@deepseek-ai/dsh-client-runtime/client'));

const legacy = loadClient('@deepseek-ai/dsh-client-runtime/client');
assert.ok(legacy.includes('@deepseek-ai/dsh-client-store'));
assert.ok(legacy.includes('@deepseek-ai/dsh-client-runtime/client'));

console.log('client loader compatibility: DSH 0.1.2 store + legacy runtime fallback ✅');
