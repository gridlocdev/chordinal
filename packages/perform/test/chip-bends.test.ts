// A chip part's performance leaves a note's own bend alone: a written fall keeps its length and gets no fall on top.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { perform } from '../src/index.ts';
import type { PerformScore, ScoreNote } from '../src/perform.ts';

/** a chip lead at 120 bpm, one bar of 4/4, playing `notes`; every title is tried, so a fall's roll comes up somewhere */
function lead(notes: ScoreNote[], title: string): PerformScore {
  return {
    title,
    tempoMap: [{ beat: 0, bpm: 120 }],
    sections: [{ type: 'chorus', beat: 0, beats: 8, beatsPerBar: 4, energy: 0.9, meter: '4/4', tonic: 60 }],
    tracks: [{ role: 'lead', program: 87, bank: 0, notes }],
    chords: [],
    beats: 8,
    swing: 0,
    swingSub: 0.5,
    style: { scoops: 0, earCandy: 0 },
    seed: title,
    sound: 'chip',
    genre: 'chiptune',
  };
}

const FALL = [
  { beat: 0.25, cents: 0 },
  { beat: 0.5, cents: -1200 },
];

test('a quick note with a written fall keeps its length; a plain one is cut short', () => {
  const [notes] = perform(
    lead(
      [
        { key: 72, beat: 0, beats: 0.5, vel: 100, bend: FALL },
        { key: 72, beat: 1, beats: 0.5, vel: 100 },
      ],
      'quick',
    ),
  );
  const [bent, plain] = notes ?? [];
  assert.ok(Math.abs((bent?.beats ?? 0) - 0.5) < 0.05, 'the falling note sounds its whole length');
  assert.ok((plain?.beats ?? 1) < 0.35, 'the plain note is staccato');
  assert.deepEqual(bent?.bend, FALL);
});

test('a phrase-end note with a bend of its own never gets the chip fall', () => {
  const bend = [
    { beat: 1, cents: 0 },
    { beat: 2, cents: -1600 },
  ];
  for (let i = 0; i < 40; i++) {
    const [notes] = perform(lead([{ key: 72, beat: 0, beats: 2, vel: 100, bend }], `phrase ${i}`));
    assert.equal(notes?.[0]?.fall, undefined);
  }
  // and the same note without one does get it on some rolls
  const falls = Array.from(
    { length: 40 },
    (_, i) => perform(lead([{ key: 72, beat: 0, beats: 2, vel: 100 }], `phrase ${i}`))[0]?.[0]?.fall,
  );
  assert.ok(falls.some(Boolean));
});
