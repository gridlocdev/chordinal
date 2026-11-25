// The arithmetic moved out of the arrangement, piano roll and drag handlers: snapping, zoom, geometry, drags and
// what a drag carries.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  snapToBar,
  fittedPpb,
  ZOOM,
  rollGeometry,
  snapToGrid,
  GUTTER,
  STRIP,
  VEL_H,
  LANE_H,
  dragNote,
  velocityAt,
  notesInBand,
  carries,
  readPreset,
  writePreset,
  PRESET,
} from '@chordinal/ui';
import type { PlacedNote } from '@chordinal/ui';
import type { Clip, MeterChange, Note } from '@chordinal/daw';

const four: MeterChange[] = [{ beat: 0, sig: '4/4' }];

test('the arrangement snaps to the nearest bar, or the beat with Shift', () => {
  assert.equal(snapToBar(four, 1.9, false), 0);
  assert.equal(snapToBar(four, 2, false), 4, 'halfway goes on');
  assert.equal(snapToBar(four, 9.5, true), 10);
  assert.equal(snapToBar(four, -0.7, true), 0, 'never before the start');
  const change: MeterChange[] = [
    { beat: 0, sig: '4/4' },
    { beat: 8, sig: '3/4' },
  ];
  assert.equal(snapToBar(change, 10, false), 11, 'a 3/4 bar is three beats');
});

test('px per beat: the zoom, or the beats fitted to the width, under the widest canvas', () => {
  assert.equal(fittedPpb(100, 20, 1000, 1), 20, 'zoomed');
  assert.equal(fittedPpb(100, 0, 1000, 1), 10, 'fitted');
  assert.equal(fittedPpb(100, 0, 10, 1), ZOOM[0], 'no tighter than the least zoom');
  assert.equal(fittedPpb(100, 0, 0, 1), ZOOM[0]);
  assert.equal(fittedPpb(1000, 120, 1000, 2), 15, 'a canvas over ~32k device px would not draw');
  assert.equal(fittedPpb(1000, 120, 1000, 0), 30, 'no device pixel ratio counts as 1');
});

test("the piano roll's geometry", () => {
  const G = rollGeometry({ from: 4, ppb: 40, low: 48 }, 800, 400);
  assert.equal(G.top, STRIP + 4);
  assert.equal(G.bottom, 400 - VEL_H);
  assert.equal(G.L.lo, 48);
  assert.equal(G.L.hi, 48 + Math.ceil((G.bottom - G.top) / LANE_H) - 1);
  assert.equal(G.x(4), GUTTER);
  assert.equal(G.x(5), GUTTER + 40);
  assert.equal(G.beatAt(GUTTER + 80), 6);
  assert.equal(G.keyAt(G.bottom - 1), 48);
  assert.equal(G.keyAt(G.L.y(60) + 1), 60, "just under a lane's top is its key");
});

test('the piano roll snaps to its grid, unless Alt', () => {
  assert.equal(snapToGrid(1.3, 0.25, false), 1.25);
  assert.equal(snapToGrid(1.3, 0.5, false), 1.5);
  assert.equal(snapToGrid(1.3, 0.25, true), 1.3);
});

const clip: Clip = { id: 'c1', start: 0, beats: 4, notes: [] };
const note: Note = { beat: 1, beats: 1, key: 60, vel: 90 };
const placed: PlacedNote = { n: note, i: 0, clip, at: 1 };

test('a drag moves a note on the grid, inside its clip and on a MIDI key', () => {
  assert.deepEqual(dragNote(placed, note, 'move', 0.6, 2, 0.25, false), { ...note, beat: 1.5, key: 62 });
  assert.deepEqual(dragNote(placed, note, 'move', 0.6, 0, 0.25, true), { ...note, beat: 1.6 });
  assert.equal(dragNote(placed, note, 'move', 9, 0, 0.25, false).beat, 3.99, 'kept inside the clip');
  assert.equal(dragNote(placed, note, 'move', -9, 0, 0.25, false).beat, 0);
  assert.equal(dragNote(placed, note, 'move', 0, 100, 0.25, false).key, 127);
  assert.equal(dragNote(placed, note, 'move', 0, -100, 0.25, false).key, 0);
});

test('a drag resizes a note to the grid, at least a step long (a sliver with Alt)', () => {
  assert.equal(dragNote(placed, note, 'resize', 0.6, 0, 0.25, false).beats, 1.5);
  assert.equal(dragNote(placed, note, 'resize', -5, 0, 0.25, false).beats, 0.25);
  assert.equal(dragNote(placed, note, 'resize', -5, 0, 0.25, true).beats, 0.02);
  assert.equal(dragNote(placed, note, 'resize', 0.375, 0, 0.25, true).beats, 1.375);
});

test("the velocity strip: the strip's height is 1 to 127", () => {
  assert.equal(velocityAt(98, 100, 44), 1, 'at the bottom');
  assert.equal(velocityAt(60, 100, 44), 127, 'at the top');
  assert.equal(velocityAt(0, 100, 44), 127, 'above it');
  assert.equal(velocityAt(200, 100, 44), 1, 'below it');
  assert.equal(velocityAt(79, 100, 44), 64);
});

test('a selection rectangle picks the notes it touches', () => {
  const at = (beat: number, key: number): PlacedNote => ({ n: { ...note, beat, key }, i: 0, clip, at: beat });
  const all = [at(0, 60), at(2, 64), at(3.5, 72)];
  assert.deepEqual(notesInBand(all, { beat: 0.5, key: 59 }, { beat: 2.5, key: 65 }), [all[0], all[1]]);
  assert.deepEqual(
    notesInBand(all, { beat: 4, key: 80 }, { beat: 3, key: 70 }),
    [all[2]],
    'corners either way',
  );
  assert.deepEqual(
    notesInBand(all, { beat: 1, key: 59 }, { beat: 2, key: 70 }),
    [],
    'touching ends do not count',
  );
});

test('what a drag carries: an instrument, read back only when it is one', () => {
  const preset = { bank: 0, program: 4, name: 'E. Piano' };
  assert.deepEqual(readPreset(writePreset(preset)), preset);
  assert.deepEqual(readPreset(writePreset({ ...preset, extra: 1 } as typeof preset)), preset);
  assert.equal(readPreset('not json'), null);
  assert.equal(readPreset('{"bank":0,"program":"4","name":"x"}'), null);
  assert.equal(readPreset('null'), null);
  const synth = { ...preset, name: 'Warm Pad', synth: { name: 'Warm Pad', mono: false } };
  assert.deepEqual(readPreset(writePreset(synth)), synth, "a synth's settings ride along");
  assert.deepEqual(
    readPreset(JSON.stringify({ ...preset, synth: 'x' })),
    preset,
    'only settings, as an object',
  );
  assert.equal(carries({ dataTransfer: { types: [PRESET] } }, PRESET), true);
  assert.equal(carries({ dataTransfer: { types: ['Files'] } }, PRESET), false);
  assert.equal(carries({ dataTransfer: null }, PRESET), false);
  assert.equal(carries({}, PRESET), false);
});
