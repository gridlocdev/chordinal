// Save As to a new folder brings the project's recorded takes and its samples along, so the copy still has the recordings its
// clips were read from.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { openProject, saveAs } from '../src/index.ts';
import { setPlace } from '../src/index.ts';
import { status } from '../src/index.ts';
import { emptyProject } from '@chordinal/daw';
import { writeProject } from '@chordinal/daw';

globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};

/** a project folder on the pretend disk: its project.json (null before it's written) and its takes */
interface Folder {
  text: string | null;
  takes: Map<string, Uint8Array<ArrayBuffer>>;
  samples: Map<string, Uint8Array<ArrayBuffer>>;
}

// project folders on a pretend disk: each a project.json and its takes
const disk = new Map<string, Folder>();
const folder = (name: string): Folder => {
  const there = disk.get(name);
  if (there) return there;
  const made: Folder = { text: null, takes: new Map(), samples: new Map() };
  disk.set(name, made);
  return made;
};
const takeOf = (name: string, file: string) => {
  const bytes = folder(name).takes.get(file);
  if (!bytes) throw new Error(`no take ${file}`);
  return bytes;
};
let next = '';
setPlace({
  files: {
    read: async (name) => {
      const t = disk.get(name)?.text;
      if (t == null) throw new Error('missing');
      return { text: t, version: t };
    },
    write: async (name, text) => {
      folder(name).text = text;
      return text;
    },
    takes: async (name) => [...(disk.get(name)?.takes.keys() ?? [])],
    readTake: async (name, file) => takeOf(name, file).slice().buffer,
    writeTake: async (name, file, bytes) => {
      folder(name).takes.set(file, new Uint8Array(bytes));
    },
    samples: async (name) => [...(disk.get(name)?.samples.keys() ?? [])],
    readSample: async (name, file) => folder(name).samples.get(file)!.slice().buffer,
    writeSample: async (name, file, bytes) => {
      folder(name).samples.set(file, new Uint8Array(bytes));
    },
  },
  where: (name) => `“${name}”`,
  chooseName: async () => (next ? { name: next, title: next } : null),
  saved: () => {},
});

test('Save As to a new folder copies the takes and samples, and leaves the old folder as it was', async () => {
  const old = folder('/a/Night Drive');
  old.text = writeProject(emptyProject({ title: 'Night Drive' }));
  old.takes.set('take-1.wav', new Uint8Array([1, 2, 3]));
  old.takes.set('take-2.wav', new Uint8Array([4, 5]));
  old.samples.set('kick.wav', new Uint8Array([7]));
  assert.equal(await openProject('/a/Night Drive'), true);

  next = '/b/Night Drive 2';
  assert.equal(await saveAs(), true);
  const copy = disk.get('/b/Night Drive 2');
  assert.ok(copy?.text);
  assert.deepEqual([...copy.takes.keys()].sort(), ['take-1.wav', 'take-2.wav']);
  assert.deepEqual([...takeOf('/b/Night Drive 2', 'take-1.wav')], [1, 2, 3]);
  assert.deepEqual([...old.takes.keys()].sort(), ['take-1.wav', 'take-2.wav']);
  assert.deepEqual([...copy.samples.get('kick.wav')!], [7]);
  assert.match(status.value, /Saved/);
});

test('a take already in the new folder is not overwritten', async () => {
  const old = folder('/a/Hook');
  old.text = writeProject(emptyProject({ title: 'Hook' }));
  old.takes.set('take-1.wav', new Uint8Array([1]));
  folder('/b/Hook').takes.set('take-1.wav', new Uint8Array([9]));
  await openProject('/a/Hook');
  next = '/b/Hook';
  assert.equal(await saveAs(), true);
  assert.deepEqual([...takeOf('/b/Hook', 'take-1.wav')], [9]);
});
