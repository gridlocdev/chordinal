import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  gridOctave,
  melodicRows,
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

const C_MAJOR = { tonic: 0, mode: 'major' };
const n = (key: number) => ({ beat: 0, beats: 0.25, key, vel: 100 });

test('a melodic track shows the key over two octaves from its tonic, highest first (Chordinal PRD §17.1)', () => {
  const rows = melodicRows({}, C_MAJOR);
  // C3 (48) to C5 (72): 7 notes an octave, and the top tonic
  assert.equal(rows.length, 15);
  assert.equal(rows[0], 72);
  assert.equal(rows.at(-1), 48);
  assert.ok(!rows.includes(49), 'C# is not in C major');
  const a = melodicRows({ gridOctave: 2 }, { tonic: 9, mode: 'minor' });
  assert.equal(a.at(-1), 45, 'A minor starts on A2');
  assert.equal(a[0], 69);
});

test('chromatic, no key, or a mode it does not know shows all twelve notes', () => {
  assert.equal(melodicRows({ gridChromatic: true }, C_MAJOR).length, 25);
  assert.equal(melodicRows({}, null).length, 25);
  assert.equal(melodicRows({}, { tonic: 0, mode: 'nope' }).length, 25);
});

test('notes outside the rows get rows of their own, in pitch order', () => {
  const rows = melodicRows({ gridOctave: 3 }, C_MAJOR, { notes: [n(49), n(84)] });
  assert.equal(rows[0], 84);
  assert.ok(rows.includes(49));
  assert.deepEqual(
    rows,
    [...rows].sort((x, y) => y - x),
  );
});

test('the rows start in the track’s octave, or the one with the clip’s lowest note, kept in range', () => {
  assert.equal(gridOctave({}, C_MAJOR), 3);
  assert.equal(gridOctave({}, C_MAJOR, { notes: [n(60), n(72)] }), 3, 'notes that fit keep the default');
  assert.equal(gridOctave({}, C_MAJOR, { notes: [n(40), n(60)] }), 2, 'E2 is in octave 2');
  assert.equal(gridOctave({}, { tonic: 9, mode: 'minor' }, { notes: [n(40)] }), 1, 'E2 is below A2, so A1');
  assert.equal(gridOctave({ gridOctave: 5 }, C_MAJOR, { notes: [n(40)] }), 5);
  assert.equal(gridOctave({ gridOctave: 99 }, C_MAJOR), 7);
});
