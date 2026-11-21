// The save session (store/save-session.ts): every path through it, and seeded random runs against a store, checking
// that a save never passes a token it didn't get from the store and never overwrites a change it wasn't told about.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { NEW, expectedOf, step } from '../src/store/save-session.ts';
import type { SaveEvent, SaveState } from '../src/store/save-session.ts';
import { memoryStore } from '../src/store/memory-store.ts';
import { ConflictError } from '../src/store/project-store.ts';

const run = (events: SaveEvent[], from: SaveState = NEW) => events.reduce(step, from);

test('a new project saves with no token, then with the token it got', () => {
  let s = run([{ type: 'save' }]);
  assert.equal(expectedOf(s), null);
  s = run([{ type: 'done', version: 'v1' }, { type: 'save' }], s);
  assert.equal(expectedOf(s), 'v1');
  assert.deepEqual(run([{ type: 'done', version: 'v2' }], s), { at: 'saved', version: 'v2' });
});

test('an opened project saves with the token it was read with', () => {
  assert.equal(expectedOf(run([{ type: 'opened', version: 'r' }, { type: 'save' }])), 'r');
});

test('a failed save goes back to where it was', () => {
  assert.deepEqual(run([{ type: 'save' }, { type: 'failed' }]), NEW);
  const opened: SaveState = { at: 'saved', version: 'r' };
  assert.deepEqual(run([{ type: 'save' }, { type: 'failed' }], opened), opened);
});

test('a conflict waits for the user: Replace saves with no token, Cancel keeps the old one so the next save asks again', () => {
  const c = run([{ type: 'opened', version: 'r' }, { type: 'save' }, { type: 'conflict' }]);
  assert.deepEqual(c, { at: 'conflict', version: 'r' });
  assert.equal(expectedOf(c), undefined, 'no write starts while the question is open');
  assert.equal(expectedOf(step(c, { type: 'replace' })), null);
  assert.deepEqual(step(c, { type: 'cancel' }), { at: 'saved', version: 'r' });
  assert.deepEqual(run([{ type: 'replace' }, { type: 'failed' }], c), { at: 'saved', version: 'r' });
});

test('a new project can not conflict, and events out of turn change nothing', () => {
  const saving = run([{ type: 'save' }]);
  assert.equal(step(saving, { type: 'conflict' }), saving);
  for (const e of [
    { type: 'done', version: 'x' },
    { type: 'failed' },
    { type: 'replace' },
    { type: 'cancel' },
  ] as const)
    assert.equal(step(NEW, e), NEW);
  assert.equal(step(saving, { type: 'save' }), saving, 'a save on its way is not started twice');
});

test('Save As to a new place starts over as new; opening another project takes its token', () => {
  assert.deepEqual(step({ at: 'saved', version: 'r' }, { type: 'savedAs' }), NEW);
  assert.deepEqual(step({ at: 'conflict', version: 'r' }, { type: 'opened', version: 'o' }), {
    at: 'saved',
    version: 'o',
  });
});

/** a small seeded random generator (mulberry32), so a failing run can be pinned by its seed */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('random saves, outside changes and answers never lose a change nobody agreed to overwrite', async () => {
  for (let seed = 1; seed <= 200; seed++) {
    const rand = random(seed);
    const store = memoryStore();
    let s: SaveState = NEW;
    let mine = 0;
    /** an outside change the user hasn't agreed to overwrite yet */
    let theirs: string | null = null;
    for (let i = 0; i < 40; i++) {
      const r = rand();
      if (r < 0.2 && s.at === 'saved') {
        theirs = `theirs-${seed}-${i}`;
        store.change('P', theirs);
        continue;
      }
      s = step(s, { type: 'save' });
      const expected = expectedOf(s);
      assert.notEqual(expected, undefined, `seed ${seed}: a save could start`);
      const text = `mine-${++mine}`;
      try {
        s = step(s, { type: 'done', version: await store.write('P', text, expected ?? null) });
        assert.equal(theirs, null, `seed ${seed}: an outside change was overwritten without asking`);
      } catch (e) {
        assert.ok(e instanceof ConflictError, `seed ${seed}: ${String(e)}`);
        assert.equal((await store.read('P')).text, theirs, `seed ${seed}: the conflict left their change`);
        s = step(s, { type: 'conflict' });
        if (rand() < 0.5) {
          s = step(s, { type: 'replace' });
          s = step(s, { type: 'done', version: await store.write('P', text, expectedOf(s) ?? null) });
          theirs = null;
        } else s = step(s, { type: 'cancel' });
      }
      if (s.at === 'saved' && theirs === null) assert.equal((await store.read('P')).version, s.version);
    }
  }
});
