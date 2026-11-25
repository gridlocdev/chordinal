// A project store for the web build: projects kept in the browser, through a small key-value interface (IndexedDB in
// the page, idb-keyval.ts; a Map in tests). A project's text and version are one record, so they always change
// together; its takes and samples are records of their own.
import { ConflictError, SAMPLE_NAME, TAKE_NAME } from './project-store.ts';
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

/** the largest sample the browser keeps (PRD §14.3): a minute or so of CD-quality stereo */
export const BROWSER_SAMPLE_LIMIT = 16 * 1024 * 1024;

/** the browser's storage is full: said as what to do, rather than the error's name */
export class StorageFullError extends Error {
  override name = 'StorageFullError';
}

const isQuota = (e: unknown) => e instanceof Error && e.name === 'QuotaExceededError';

/** why a sample past the limit isn't kept */
export const TOO_BIG = `over ${BROWSER_SAMPLE_LIMIT / 1024 / 1024} MB, more than the browser keeps; the desktop app takes it`;

const projectKey = (name: string) => `project:${name}`;
const takeKey = (name: string, file: string) => `take:${name}:${file}`;
const sampleKey = (name: string, file: string) => `sample:${name}:${file}`;

/** @param newVersion a fresh token each call (crypto.randomUUID in the page) */
export function browserStore(kv: KeyValue, newVersion: () => Version): ProjectStore {
  // writes one at a time, so a check and its write can't interleave with another save's
  let writing: Promise<unknown> = Promise.resolve();
  const takeOf = (file: string) => {
    if (!TAKE_NAME.test(file)) throw new Error(`not a take: ${file}`);
    return file;
  };
  const sampleOf = (file: string) => {
    if (!SAMPLE_NAME.test(file)) throw new Error(`not a sample: ${file}`);
    return file;
  };
  const set = (key: string, value: unknown) =>
    kv.set(key, value).catch((e: unknown) => {
      throw isQuota(e)
        ? new StorageFullError("the browser's storage is full: the desktop app keeps projects on disk", {
            cause: e,
          })
        : e;
    });
  const listed = async (prefix: string) =>
    (await kv.keys())
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length))
      .sort();
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
        await set(projectKey(name), { text, version } satisfies Record);
        return version;
      });
      writing = done.catch(() => {});
      return done;
    },
    takes: (name) => listed(takeKey(name, '')),
    async readTake(name, file) {
      const bytes = await kv.get(takeKey(name, takeOf(file)));
      if (!(bytes instanceof Uint8Array)) throw new Error(`no take ${file}`);
      return bytes.slice().buffer;
    },
    async writeTake(name, file, bytes) {
      await set(takeKey(name, takeOf(file)), bytes.slice());
    },
    samples: (name) => listed(sampleKey(name, '')),
    async readSample(name, file) {
      const bytes = await kv.get(sampleKey(name, sampleOf(file)));
      if (!(bytes instanceof Uint8Array)) throw new Error(`no sample ${file}`);
      return bytes.slice().buffer;
    },
    async writeSample(name, file, bytes) {
      if (bytes.length > BROWSER_SAMPLE_LIMIT) throw new Error(`${file} is ${TOO_BIG}`);
      await set(sampleKey(name, sampleOf(file)), bytes.slice());
    },
    sampleLimit: BROWSER_SAMPLE_LIMIT,
  };
}
