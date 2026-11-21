// A project store for the web build: projects kept in the browser, through a small key-value interface (IndexedDB in
// the page, idb-keyval.ts; a Map in tests). A project's text and version are one record, so they always change
// together; its takes are records of their own.
import { ConflictError, TAKE_NAME } from './project-store.ts';
import type { ProjectStore, Version } from './project-store.ts';

/** the little the store needs from the browser's storage */
export interface KeyValue {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  keys(): Promise<string[]>;
}

interface Record {
  text: string;
  version: Version;
}
const isRecord = (x: unknown): x is Record =>
  typeof x === 'object' &&
  x !== null &&
  'text' in x &&
  typeof x.text === 'string' &&
  'version' in x &&
  typeof x.version === 'string';

const projectKey = (name: string) => `project:${name}`;
const takeKey = (name: string, file: string) => `take:${name}:${file}`;

/** @param newVersion a fresh token each call (crypto.randomUUID in the page) */
export function browserStore(kv: KeyValue, newVersion: () => Version): ProjectStore {
  // writes one at a time, so a check and its write can't interleave with another save's
  let writing: Promise<unknown> = Promise.resolve();
  const takeOf = (file: string) => {
    if (!TAKE_NAME.test(file)) throw new Error(`not a take: ${file}`);
    return file;
  };
  return {
    async read(name) {
      const r = await kv.get(projectKey(name));
      if (!isRecord(r)) throw new Error(`no project ${name}`);
      return { text: r.text, version: r.version };
    },
    write(name, text, expected) {
      const done = writing.then(async () => {
        const r = await kv.get(projectKey(name));
        const now = isRecord(r) ? r : null;
        if (expected !== null && now && now.version !== expected && now.text !== text)
          throw new ConflictError(`${name} changed since it was opened`);
        if (now?.text === text) return now.version;
        const version = newVersion();
        await kv.set(projectKey(name), { text, version } satisfies Record);
        return version;
      });
      writing = done.catch(() => {});
      return done;
    },
    async takes(name) {
      const prefix = takeKey(name, '');
      return (await kv.keys())
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length))
        .sort();
    },
    async readTake(name, file) {
      const bytes = await kv.get(takeKey(name, takeOf(file)));
      if (!(bytes instanceof Uint8Array)) throw new Error(`no take ${file}`);
      return bytes.slice().buffer;
    },
    async writeTake(name, file, bytes) {
      await kv.set(takeKey(name, takeOf(file)), bytes.slice());
    },
  };
}
