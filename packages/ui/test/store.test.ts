import { storeContract } from './store-contract.ts';
import { memoryStore } from '../src/store/memory-store.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { BROWSER_SAMPLE_LIMIT, StorageFullError, browserStore } from '../src/store/browser-store.ts';
import type { KeyValue } from '../src/store/browser-store.ts';
import { nativeStore } from '../src/store/native-store.ts';
import type { FoldersBridge } from '../src/store/native-store.ts';

storeContract('memory store', async () => {
  const store = memoryStore();
  return { store, name: (n) => n, change: async (name, text) => store.change(name, text) };
});

/** IndexedDB's stand-in: a Map, with values copied in and out as structured clone would */
function mapKeyValue(): KeyValue & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>();
  return {
    map,
    get: async (k) => structuredClone(map.get(k)),
    set: async (k, v) => {
      map.set(k, structuredClone(v));
    },
    keys: async () => [...map.keys()],
  };
}

storeContract('browser store', async () => {
  const kv = mapKeyValue();
  let n = 0;
  const store = browserStore(kv, () => `b${++n}`);
  return {
    store,
    name: (x) => x,
    change: async (name, text) => {
      kv.map.set(`project:${name}`, { text, version: `outside-${++n}` });
    },
  };
});

/** the desktop bridge's stand-in: errors cross IPC as plain Errors whose message names CONFLICT */
function fakeBridge(): FoldersBridge & { change(dir: string, text: string): void } {
  const inner = memoryStore();
  return {
    read: (d) => inner.read(d),
    async write(d, text, expected) {
      try {
        return await inner.write(d, text, expected);
      } catch (e) {
        throw new Error(`Error invoking remote method 'folders:write': Error: CONFLICT: ${String(e)}`, {
          cause: e,
        });
      }
    },
    takes: (d) => inner.takes(d),
    readTake: async (d, f) => new Uint8Array(await inner.readTake(d, f)),
    writeTake: (d, f, b) => inner.writeTake(d, f, b),
    samples: (d) => inner.samples(d),
    readSample: async (d, f) => new Uint8Array(await inner.readSample(d, f)),
    writeSample: (d, f, b) => inner.writeSample(d, f, b),
    change: (d, t) => inner.change(d, t),
  };
}

storeContract('desktop store (stand-in bridge)', async () => {
  const bridge = fakeBridge();
  return { store: nativeStore(bridge), name: (x) => x, change: async (d, t) => bridge.change(d, t) };
});

test('the browser store keeps no sample past its limit, and says when its storage is full', async () => {
  const kv = mapKeyValue();
  const store = browserStore(kv, () => 'v');
  assert.equal(store.sampleLimit, BROWSER_SAMPLE_LIMIT);
  await assert.rejects(
    store.writeSample('Song', 'big.wav', new Uint8Array(BROWSER_SAMPLE_LIMIT + 1)),
    /big\.wav is over 16 MB/,
  );
  assert.deepEqual(await store.samples('Song'), []);
  await store.writeSample('Song', 'small.wav', new Uint8Array(BROWSER_SAMPLE_LIMIT));

  const quota = Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' });
  kv.set = () => Promise.reject(quota);
  await assert.rejects(
    store.writeSample('Song', 'kick.wav', new Uint8Array(4)),
    (e) => e instanceof StorageFullError,
  );
  await assert.rejects(store.write('Song', '{}', null), /the browser's storage is full/);
  kv.set = () => Promise.reject(new Error('something else'));
  await assert.rejects(store.writeTake('Song', 'take-1.wav', new Uint8Array(4)), /^Error: something else$/);
});
