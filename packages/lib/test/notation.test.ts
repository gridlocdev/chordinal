// Scale-degree notation read back into notes: the text the transcriber writes, and melodies written by hand.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { notatedMelody, parseMelody } from '../src/index.ts';

test('degrees, accidentals, octaves, rests, vibrato and lengths', () => {
  const m = parseMelody("1 b3:0.5 5' r:2 | 7,:1.5 5~:1/3");
  assert.ok(Math.abs(m.beats - (6 + 1 / 3)) < 1e-9);
  assert.deepEqual(
    m.notes.map((n) => [n.degree, n.accidental, n.beat, n.beats]),
    [
      [1, 0, 0, 1],
      [3, -1, 1, 0.5],
      [12, 0, 1.5, 1],
      [0, 0, 4.5, 1.5],
      [5, 0, 6, 1 / 3],
    ],
  );
  assert.equal(m.notes.at(-1)?.vibrato, true);
  assert.throws(() => parseMelody('x'), /bad melody token/);
  assert.throws(() => parseMelody('1:0'), /bad melody length/);
});

test('a notated melody repeats to fill its length, and the last note is marked', () => {
  const notes = notatedMelody('1 3:2', 7);
  assert.deepEqual(
    notes.map((n) => [n.degree, n.beat, n.beats]),
    [
      [1, 0, 1],
      [3, 1, 2],
      [1, 3, 1],
      [3, 4, 2],
      [1, 6, 1],
    ],
  );
  assert.equal(notes.at(-1)?.last, true);
  assert.equal(notes.filter((n) => n.last).length, 1);
});
