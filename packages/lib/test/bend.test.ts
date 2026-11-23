// A note's bend: a pitch curve over a held note, read safely from a project's mark, sampled at a beat into the note,
// and timed in seconds for a voice that starts partway through.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { bendAt, bendCurve, readBend } from '@chordinal/lib';

test("a bend starts at the note's own pitch, moves in straight lines through its points and holds the last", () => {
  const up = [
    { beat: 1, cents: 40 },
    { beat: 3, cents: -20 },
  ];
  assert.deepEqual(
    [0, 0.5, 1, 2, 3, 9].map((b) => bendAt(up, b)),
    [0, 20, 40, 10, -20, -20],
  );
  assert.equal(bendAt([{ beat: 0, cents: 30 }], 0), 30, 'a point at 0 is where the note starts');
});

test('a bend mark that is not a curve of numbers is no bend; its points come out in beat order', () => {
  assert.equal(readBend(undefined), null);
  assert.equal(readBend([]), null);
  assert.equal(readBend([{ beat: 1, cents: '40' }]), null);
  assert.equal(readBend([{ beat: -1, cents: 40 }]), null);
  assert.equal(readBend([{ beat: 1, cents: 5000 }]), null);
  assert.deepEqual(
    readBend([
      { beat: 2, cents: 10 },
      { beat: 1, cents: 5 },
    ]),
    [
      { beat: 1, cents: 5 },
      { beat: 2, cents: 10 },
    ],
  );
});

test('a voice started partway through a note picks the curve up where it is, timed in seconds from its start', () => {
  const curve = bendCurve(
    [
      { beat: 1, cents: 40 },
      { beat: 3, cents: -20 },
    ],
    2,
    (beat) => (beat - 2) * 0.5, // 120 bpm, the voice starting at beat 2
  );
  assert.deepEqual(curve, [
    { at: 0, cents: 10 },
    { at: 0.5, cents: -20 },
  ]);
});
