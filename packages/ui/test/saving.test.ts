import { test } from 'vitest';
import assert from 'node:assert/strict';
import { openProject, save, saveAs, edit } from '../src/index.ts';
import { setPlace } from '../src/index.ts';
import { asking, answer, ConflictError } from '../src/index.ts';
import { projectName, dirty } from '../src/index.ts';
import { emptyProject } from '@chordinal/daw';
import { writeProject } from '@chordinal/daw';

// the window's frame calls, which stopping playback uses
globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};

// projects on a pretend disk, through the same place the app's folders use; a write can be held back or fail
const disk = new Map<string, string>();
const writes: string[] = [];
let slow = 0,
  failing = false;
setPlace({
  files: {
    // a project's version is its text, which is enough for a pretend disk
    read: async (name) => {
      const text = disk.get(name);
      if (text === undefined) throw new Error('not found');
      return { text, version: text };
    },
    write: async (name, text, expected) => {
      if (failing) throw new Error('disk full');
      if (slow) {
        const wait = slow;
        slow = 0;
        await new Promise((r) => setTimeout(r, wait));
      }
      const now = disk.get(name);
      if (expected !== null && now !== undefined && now !== expected && now !== text)
        throw new ConflictError(name);
      disk.set(name, text);
      writes.push(text);
      return text;
    },
    takes: async () => [],
    readTake: async () => new ArrayBuffer(0),
    writeTake: async () => {},
  },
  where: (name) => `“${name}”`,
  chooseName: async (title) => ({ name: 'new', title }),
});
const tick = () => new Promise((r) => setTimeout(r, 0));
const title = (text: string | undefined): unknown => {
  const parsed: unknown = JSON.parse((text ?? '').replace(/\n/g, ''));
  return typeof parsed === 'object' && parsed !== null && 'title' in parsed ? parsed.title : undefined;
};

test('saves land in the order they were made, even when the first is slow', async () => {
  disk.set('song', writeProject(emptyProject({ title: 'A' })));
  assert.equal(await openProject('song'), true);
  edit((p) => ({ ...p, title: 'B' }));
  slow = 50;
  const first = save();
  edit((p) => ({ ...p, title: 'C' }));
  await Promise.all([first, save()]);
  assert.equal(title(writes.at(-1)), 'C');
  assert.equal(title(disk.get('song')), 'C', 'the slow first save never lands over the newer one');
  assert.equal(dirty.value, false);
});

test('saving over a file changed on disk since it was opened asks first', async () => {
  disk.set('song', writeProject(emptyProject({ title: 'Mine' })));
  await openProject('song');
  edit((p) => ({ ...p, title: 'Mine, edited' }));
  disk.set('song', writeProject(emptyProject({ title: 'Theirs' })));
  const done = save();
  for (let i = 0; i < 20 && !asking.value; i++) await tick();
  assert.match(asking.value?.text ?? '', /changed on disk/);
  answer(null);
  await done;
  assert.equal(title(disk.get('song')), 'Theirs', 'cancelled: their file is kept');
  assert.equal(dirty.value, true);
});

test('a Save As that fails keeps the project under its old name', async () => {
  disk.set('old', writeProject(emptyProject({ title: 'Old' })));
  const opened = openProject('old');
  await tick();
  if (asking.value) answer(''); // discard the last test's unsaved change
  assert.equal(await opened, true);
  failing = true;
  try {
    assert.equal(await saveAs(), false);
    assert.equal(projectName.value, 'old');
    assert.equal(disk.has('new'), false);
  } finally {
    failing = false;
  }
});
