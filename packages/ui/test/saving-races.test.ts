// Saves on their way while the user goes on: Save As, opening another project and a second question. Each test is a
// bug the random saving runs found (random-saving.test.ts), cut down to the steps that matter.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { emptyProject, writeProject } from '@chordinal/daw';
import { edit, openProject, save, saveAs } from '../src/document.ts';
import { setPlace } from '../src/place.ts';
import { answer, askYes, asking } from '../src/ask.ts';
import { dirty, projectName } from '../src/store.ts';
import { memoryStore } from '../src/store/memory-store.ts';
import type { Version } from '../src/store/project-store.ts';

// stopping playback, which opening a project does, cancels the window's frame callback
globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};

const settle = async () => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r));
};

/** a MemoryStore whose writes can be held back, listing each write's place and token */
function heldStore(pick: () => string | null) {
  const store = memoryStore();
  const writes: { name: string; expected: Version | null }[] = [];
  let gate: Promise<void> | null = null,
    release = () => {};
  setPlace({
    files: {
      ...store,
      async write(name, text, expected) {
        if (gate) await gate;
        writes.push({ name, expected });
        return store.write(name, text, expected);
      },
    },
    chooseName: async (title) => {
      const name = pick();
      return name === null ? null : { name, title };
    },
    askDiscard: null,
  });
  return {
    store,
    writes,
    hold() {
      gate = new Promise((r) => (release = r));
    },
    async let() {
      gate = null;
      release();
      await settle();
    },
  };
}

test('a Save As while a save is on its way gives the new place no token from the old one', async () => {
  const disk = heldStore(() => 'B');
  disk.store.change('A', writeProject(emptyProject({ title: 'A' })));
  assert.equal(await openProject('A'), true);
  edit((p) => ({ ...p, length: p.length + 1 }));
  disk.hold();
  const first = save();
  await settle();
  const second = saveAs();
  await disk.let();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.deepEqual(
    disk.writes.map((w) => [w.name, w.expected === null ? 'no token' : 'a token']),
    [
      ['A', 'a token'],
      ['B', 'no token'],
    ],
  );
  assert.equal(projectName.value, 'B');
});

test('a project opened while a save is on its way shows as saved, and keeps its own token', async () => {
  const disk = heldStore(() => null);
  disk.store.change('A', writeProject(emptyProject({ title: 'A' })));
  disk.store.change('B', writeProject(emptyProject({ title: 'B' })));
  assert.equal(await openProject('A'), true);
  disk.hold();
  const first = save();
  await settle();
  const opened = openProject('B');
  await disk.let();
  assert.deepEqual(await Promise.all([first, opened]), [true, true]);
  assert.equal(dirty.value, false, "the old project's save landing doesn't make B look changed");
  const { version } = await disk.store.read('B');
  edit((p) => ({ ...p, title: 'B, edited' }));
  assert.equal(await save(), true, 'B saves without a conflict');
  assert.deepEqual(disk.writes.at(-1), { name: 'B', expected: version });
});

test('a Save As asked for a project that an open replaces before its turn does nothing', async () => {
  const disk = heldStore(() => 'C');
  disk.store.change('A', writeProject(emptyProject({ title: 'A' })));
  disk.store.change('B', writeProject(emptyProject({ title: 'B' })));
  disk.store.change('C', writeProject(emptyProject({ title: 'C' })));
  assert.equal(await openProject('A'), true);
  disk.hold();
  const first = save();
  await settle();
  const opened = openProject('B');
  const moved = saveAs();
  await disk.let();
  assert.deepEqual(await Promise.all([first, opened, moved]), [true, true, false]);
  assert.match((await disk.store.read('C')).text, /"title": "C"/, "C keeps its own project, not B's");
  assert.equal(projectName.value, 'B');
});

test('a question asked while another shows waits for it, and both get their answers', async () => {
  const first = askYes('First?');
  const second = askYes('Second?');
  assert.equal(asking.value?.text, 'First?');
  answer(null);
  assert.equal(asking.value?.text, 'Second?', 'the second shows once the first is answered');
  answer('');
  assert.deepEqual(await Promise.all([first, second]), [false, true]);
  assert.equal(asking.value, null);
});
