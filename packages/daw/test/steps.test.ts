import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  gridRows,
  stepCount,
  cell,
  setStep,
  toggleAccent,
  addRow,
  hideRow,
  stepOf,
  drumName,
  STEP_SIZES,
  type Clip,
  type Note,
} from '@chordinal/daw';
import { CORE_ROWS, GM_DRUMS } from '@chordinal/daw';
import { at } from './at.ts';

const clip = (notes: Note[] = [], extra: Partial<Clip> = {}): Clip => ({
  id: 'c1',
  start: 0,
  beats: 4,
  notes,
  ...extra,
});

test('rows: the core kit, then other keys the clip plays (PRD §4.6)', () => {
  assert.deepEqual(gridRows({}, clip()), CORE_ROWS);
  assert.deepEqual(
    gridRows(
      {},
      clip([
        { beat: 0, beats: 0.25, key: 70, vel: 100 },
        { beat: 0, beats: 0.25, key: 54, vel: 100 },
        { beat: 1, beats: 0.25, key: 36, vel: 100 },
      ]),
    ),
    [...CORE_ROWS, 54, 70],
  );
  assert.deepEqual(gridRows({ stepRows: [36, 38] }, null), [36, 38]);
  assert.equal(drumName(42), 'Closed Hat');
  assert.equal(drumName(99), 'Key 99');
  for (const k of CORE_ROWS) assert.ok(GM_DRUMS[k]);
});

test('step sizes and counts (PRD §4.4, §4.5)', () => {
  assert.equal(stepOf(clip()), 0.25);
  assert.equal(stepCount(clip()), 16);
  assert.equal(stepCount(clip([], { step: 0.125 })), 32);
  assert.equal(stepCount(clip([], { step: 1 / 6 })), 24);
  assert.equal(stepCount(clip([], { beats: 3, step: 0.5 })), 6);
  assert.deepEqual(
    STEP_SIZES.map(([, n]) => n),
    ['1/8', '1/16', '1/32', '1/16 triplet'],
  );
});

test('turning steps on and off leaves notes off the grid alone (PRD §4.7, §4.8)', () => {
  const off = { beat: 0.3, beats: 0.1, key: 38, vel: 90 };
  let notes: Note[] = [off];
  notes = setStep(notes, 38, 1, 0.25, true);
  assert.deepEqual(notes, [{ beat: 0.25, beats: 0.25, key: 38, vel: 100 }, off]);
  assert.equal(setStep(notes, 38, 1, 0.25, true), notes, 'already on: the same array');
  assert.deepEqual(cell(notes, 38, 1, 0.25), { on: notes[0], off: [off] });
  assert.deepEqual(cell(notes, 36, 1, 0.25), { on: null, off: [] });
  notes = setStep(notes, 38, 1, 0.25, false);
  assert.deepEqual(notes, [off]);
  assert.equal(setStep(notes, 38, 1, 0.25, false), notes);
  const triplet = setStep([], 42, 5, 1 / 6, true);
  assert.ok(Math.abs(at(triplet, 0).beat - 5 / 6) < 1e-9);
  assert.ok(cell(triplet, 42, 5, 1 / 6).on, 'a triplet step reads back as on');
  assert.ok(
    cell([{ beat: 0.8333, beats: 0.1667, key: 42, vel: 100 }], 42, 5, 1 / 6).on,
    'and so does one rounded by the file',
  );
});

test('accents (PRD §4.9)', () => {
  const notes = setStep([], 36, 0, 0.25, true);
  const loud = toggleAccent(notes, 36, 0, 0.25);
  assert.equal(at(loud, 0).vel, 127);
  assert.equal(at(toggleAccent(loud, 36, 0, 0.25), 0).vel, 100);
  assert.equal(toggleAccent(notes, 36, 3, 0.25), notes, 'an off step: nothing');
});

test('adding and hiding rows (PRD §4.6)', () => {
  const t: { id: string; stepRows?: number[] } = { id: 't1' };
  const added = addRow(t, 56);
  assert.deepEqual(added.stepRows, [...CORE_ROWS, 56]);
  assert.equal(addRow(added, 56), added);
  const hidden = hideRow(added, 39, clip());
  assert.ok(hidden.stepRows && !hidden.stepRows.includes(39));
  const used = clip([{ beat: 0, beats: 0.25, key: 39, vel: 100 }]);
  assert.equal(hideRow(added, 39, used), added, 'a row with notes stays');
  assert.equal(hideRow(t, 70, clip()), t);
});
