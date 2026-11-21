// The browser's side of browser-store.ts: one IndexedDB object store of keys and values.
import type { KeyValue } from './browser-store.ts';

const request = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB failed'));
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
      await request((await store('readwrite')).put(value, key));
    },
    keys: async () => (await request((await store('readonly')).getAllKeys())).map(String),
  };
}
