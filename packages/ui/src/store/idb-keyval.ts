// The browser's side of browser-store.ts: one IndexedDB object store of keys and values.
import type { KeyValue } from './browser-store.ts';

const request = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB failed'));
  });

/** a write done: its transaction committed, or why not (a full disk aborts it after the put itself succeeds) */
const committed = (t: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onabort = t.onerror = () => reject(t.error ?? new Error('IndexedDB failed'));
  });

export function idbKeyValue(dbName = 'chordinal', storeName = 'projects'): KeyValue {
  let db: Promise<IDBDatabase> | null = null;
  const open = () => {
    if (!db) {
      const r = indexedDB.open(dbName, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(storeName);
      db = request(r);
    }
    return db;
  };
  const store = async (mode: IDBTransactionMode) =>
    (await open()).transaction(storeName, mode).objectStore(storeName);
  return {
    get: async (key) => request<unknown>((await store('readonly')).get(key)),
    set: async (key, value) => {
      const s = await store('readwrite');
      s.put(value, key);
      await committed(s.transaction);
    },
    keys: async () => (await request((await store('readonly')).getAllKeys())).map(String),
  };
}
