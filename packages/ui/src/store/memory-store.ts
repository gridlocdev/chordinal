// A project store held in memory: for tests, and as the reference the other stores are checked against
// (store-contract tests). `change` stands in for another app writing a project behind the store's back.
import { ConflictError, SAMPLE_NAME, TAKE_NAME } from './project-store.ts';
import type { ProjectStore, Version } from './project-store.ts';

export interface MemoryStore extends ProjectStore {
  /** another app writes the project */
  change(name: string, text: string): void;
}

export function memoryStore(): MemoryStore {
  const projects = new Map<string, { text: string; version: Version }>();
  const takes = new Map<string, Map<string, Uint8Array>>();
  const samples = new Map<string, Map<string, Uint8Array>>();
  const audio = new Map<string, Map<string, Uint8Array>>();
  let n = 0;
  const next = (): Version => `m${++n}`;
  const takeOf = (file: string) => {
    if (!TAKE_NAME.test(file)) throw new Error(`not a take: ${file}`);
    return file;
  };
  const sampleOf = (file: string) => {
    if (!SAMPLE_NAME.test(file)) throw new Error(`not a sample: ${file}`);
    return file;
  };

  return {
    async read(name) {
      const p = projects.get(name);
      if (!p) throw new Error(`no project ${name}`);
      return { ...p };
    },
    async write(name, text, expected) {
      const p = projects.get(name);
      if (expected !== null && p && p.version !== expected && p.text !== text)
        throw new ConflictError(`${name} changed since it was opened`);
      const version = p?.text === text ? p.version : next();
      projects.set(name, { text, version });
      return version;
    },
    change(name, text) {
      projects.set(name, { text, version: next() });
    },
    async takes(name) {
      return [...(takes.get(name)?.keys() ?? [])].sort();
    },
    async readTake(name, file) {
      const bytes = takes.get(name)?.get(takeOf(file));
      if (!bytes) throw new Error(`no take ${file}`);
      return bytes.slice().buffer;
    },
    async writeTake(name, file, bytes) {
      const kept = takes.get(name) ?? new Map<string, Uint8Array>();
      kept.set(takeOf(file), bytes.slice());
      takes.set(name, kept);
    },
    async samples(name) {
      return [...(samples.get(name)?.keys() ?? [])].sort();
    },
    async readSample(name, file) {
      const bytes = samples.get(name)?.get(sampleOf(file));
      if (!bytes) throw new Error(`no sample ${file}`);
      return bytes.slice().buffer;
    },
    async writeSample(name, file, bytes) {
      const kept = samples.get(name) ?? new Map<string, Uint8Array>();
      kept.set(sampleOf(file), bytes.slice());
      samples.set(name, kept);
    },
    async audio(name) {
      return [...(audio.get(name)?.keys() ?? [])].sort();
    },
    async readAudio(name, file) {
      const bytes = audio.get(name)?.get(sampleOf(file));
      if (!bytes) throw new Error(`no audio file ${file}`);
      return bytes.slice().buffer;
    },
    async writeAudio(name, file, bytes) {
      const kept = audio.get(name) ?? new Map<string, Uint8Array>();
      kept.set(sampleOf(file), bytes.slice());
      audio.set(name, kept);
    },
  };
}
