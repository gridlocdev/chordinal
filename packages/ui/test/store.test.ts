import { storeContract } from './store-contract.ts';
import { memoryStore } from '../src/store/memory-store.ts';
import { browserStore } from '../src/store/browser-store.ts';
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
