import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  pitchClass,
  degreeToKey,
  keyToDegree,
  parseChord,
  chordPitchClasses,
  chordName,
  hash,
  MODES,
  type Mode,
} from '@chordinal/lib';

test('pitch classes', () =>
  assert.deepEqual(['C', 'F#', 'Bb', 'B', 'Cb'].map(pitchClass), [0, 6, 10, 11, 11]));

test('scale degrees to keys, past the octave both ways', () => {
  assert.equal(degreeToKey(0, 'major', 1), 60);
  assert.equal(degreeToKey(0, 'major', 8), 72);
  assert.equal(degreeToKey(0, 'major', 0), 59);
  assert.equal(degreeToKey(9, 'minor', 3), 72); // A minor: C5
  assert.equal(degreeToKey(0, 'major', 3, 4, -1), 63);
});

test('keys back to degrees', () => {
  for (const mode of Object.keys(MODES) as Mode[])
    for (let d = -6; d < 16; d++) assert.equal(keyToDegree(2, mode, degreeToKey(2, mode, d)), d);
});

test('Roman numerals: quality from case and marks', () => {
  assert.deepEqual(chordPitchClasses(parseChord('V7', 0, 'major')), [7, 11, 2, 5]);
  assert.deepEqual(chordPitchClasses(parseChord('vi', 0, 'major')), [9, 0, 4]);
  assert.deepEqual(chordPitchClasses(parseChord('vii°', 0, 'major')), [11, 2, 5]);
  assert.deepEqual(chordPitchClasses(parseChord('bVII', 0, 'major')), [10, 2, 5]);
  assert.deepEqual(chordPitchClasses(parseChord('V', 9, 'minor')), [4, 8, 11]); // E major in A minor
  assert.deepEqual(chordPitchClasses(parseChord('Isus4', 0, 'major')), [0, 5, 7]);
  assert.throws(() => parseChord('X', 0, 'major'));
});

test('a diminished vii stands on the leading tone in every mode; a plain VII counts in the mode', () => {
  assert.deepEqual(chordPitchClasses(parseChord('vii°7', 9, 'minor')), [8, 11, 2, 5]); // G#dim7 in A minor
  assert.deepEqual(chordPitchClasses(parseChord('viiø7', 2, 'dorian')), [1, 4, 7, 11]); // C#m7b5 in D dorian
  assert.deepEqual(chordPitchClasses(parseChord('VII', 9, 'minor')), [7, 11, 2]); // G major
});

test('secondary chords: X/Y is X in the major key of Y', () => {
  assert.deepEqual(chordPitchClasses(parseChord('V7/vi', 0, 'major')), [4, 8, 11, 2]); // E7
  assert.deepEqual(chordPitchClasses(parseChord('vii°7/V', 0, 'major')), [6, 9, 0, 3]); // F#dim7
  assert.deepEqual(chordPitchClasses(parseChord('V/V', 9, 'minor')), [11, 3, 6]); // B major in A minor
});

test('slash chords put a scale degree in the bass: inversions, pedals, and with a secondary chord', () => {
  const name = (s: string, t = 0, m: Mode = 'major') => chordName(parseChord(s, t, m));
  assert.deepEqual(
    ['I/3', 'I/5', 'V/7', 'IV/1', 'V7/4', 'vii°/2'].map((s) => name(s)),
    ['C/E', 'C/G', 'G/B', 'F/C', 'G7/F', 'Bdim/D'],
  );
  assert.equal(chordName(parseChord('I/b7', 0, 'major'), true), 'C/Bb'); // accidentals count from the mode, as in a melody
  assert.equal(name('V7/V/#4'), 'D7/F#'); // D7 over F#: V7/V in first inversion
  assert.equal(parseChord('I', 0, 'major').bass, undefined);
  assert.equal(parseChord('I/3', 0, 'major').bass, 4);
  assert.deepEqual(chordPitchClasses(parseChord('IV/1', 0, 'major')), [5, 9, 0]); // the pedal isn't a chord tone
  assert.throws(() => parseChord('I/8', 0, 'major'));
});

test('chord names', () => {
  const name = (s: string, t = 0, m: Mode = 'major') => chordName(parseChord(s, t, m));
  assert.deepEqual(
    ['I', 'ii', 'V7', 'Imaj7', 'vii°', 'vi7', 'Isus2'].map((s) => name(s)),
    ['C', 'Dm', 'G7', 'Cmaj7', 'Bdim', 'Am7', 'Csus2'],
  );
  assert.equal(chordName(parseChord('bVI', 0, 'major'), true), 'Ab');
  assert.deepEqual(
    ['V7sus4', 'V9sus4', 'V9', 'Imaj9', 'ii9'].map((s) => name(s)),
    ['G7sus4', 'G9sus4', 'G9', 'Cmaj9', 'Dm9'],
  );
});

test('hash is stable', () => {
  assert.equal(hash('a', 1), hash('a', 1));
  assert.notEqual(hash('a', 1), hash('a', 2));
});

test('a flat or sharp numeral counts from the major scale, in any mode', () => {
  assert.equal(parseChord('bVII', 0, 'mixolydian').root, 10);
  assert.equal(parseChord('VII', 0, 'mixolydian').root, 10);
  assert.equal(parseChord('bVI', 0, 'minor').root, 8);
  assert.equal(parseChord('bII', 4, 'harmonicMinor').root, 5);
  assert.equal(parseChord('#iv°', 0, 'major').root, 6);
});
