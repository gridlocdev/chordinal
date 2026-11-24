import { test } from 'vitest';
import assert from 'node:assert/strict';
import { cut, analyse, pitchFloor, voicedShare, snapToKey } from '@chordinal/sketch';
import type { ConvertOptions } from '@chordinal/sketch';
import { trackPitch, PITCH_FLOOR } from '@chordinal/lib';

test('takes: cutting a stretch out of a chord leaves nothing, one piece or two', () => {
  const c = { beat: 0, beats: 8, symbol: 'I' };
  assert.deepEqual(cut(c, 8, 12), [c]);
  assert.deepEqual(cut(c, 0, 8), []);
  assert.deepEqual(cut(c, 0, 4), [{ beat: 4, beats: 4, symbol: 'I' }]);
  assert.deepEqual(cut(c, 2, 4), [
    { beat: 0, beats: 2, symbol: 'I' },
    { beat: 4, beats: 4, symbol: 'I' },
  ]);
});

// ── converting ──────────────────────────────────────────────────────────────────────────────────────────────────────

const RATE = 22050;

/** a made-up take: each note a sine at `key` (cents sharp), `beats` long at `tempo`, tongued, from `lead` seconds */
function sung(
  notes: { key: number; beats: number; cents?: number }[],
  tempo: number,
  lead = 0.5,
): Float32Array {
  const spb = 60 / tempo,
    total = notes.reduce((s, n) => s + n.beats, 0);
  const out = new Float32Array(Math.ceil((lead + total * spb + 0.3) * RATE));
  let t = lead,
    phase = 0;
  for (const n of notes) {
    const hz = 440 * 2 ** ((n.key + (n.cents ?? 0) / 100 - 69) / 12);
    const a = Math.round(t * RATE),
      b = Math.round((t + n.beats * spb - 0.04) * RATE);
    for (let i = a; i < b; i++) {
      phase += (2 * Math.PI * hz) / RATE;
      out[i] = 0.5 * Math.min(1, (i - a) / 200, (b - i) / 200) * Math.sin(phase);
    }
    t += n.beats * spb;
  }
  return out;
}

const read = (samples: Float32Array, tempo: number, options: Partial<ConvertOptions> = {}) =>
  analyse(
    {
      kind: 'melody',
      samples,
      rate: RATE,
      frames: trackPitch(samples, RATE, { floor: pitchFloor(options.sensitivity ?? 0.5) }),
      tempo,
      meter: '4/4',
      downbeat: 0.5,
    },
    'auto',
    options,
  ).notes.map((n) => `${n.key}@${n.beat}:${n.beats}`);

test('converting: a run of 16ths comes back on the 16th grid, and an 8th grid can’t hold it', () => {
  const keys = [72, 74, 76, 77, 79, 77, 76, 74];
  const s = sung([...keys.map((key) => ({ key, beats: 0.25 })), { key: 72, beats: 2 }], 80);
  const want = [...keys.map((k, i) => `${k}@${i / 4}:0.25`), '72@2:2'];
  assert.deepEqual(read(s, 80, { grid: '16ths' }), want);
  assert.notDeepEqual(read(s, 80, { grid: '8ths' }), want);
});

test('converting: quarter notes on the quarter grid', () => {
  const s = sung(
    [67, 69, 71, 72].map((key) => ({ key, beats: 1 })),
    90,
  );
  assert.deepEqual(read(s, 90, { grid: 'quarters' }), ['67@0:1', '69@1:1', '71@2:1', '72@3:1']);
});

test('converting: sensitivity lowers or raises the quietest level heard, around the pitch tracker’s own', () => {
  assert.equal(pitchFloor(0.5), PITCH_FLOOR);
  assert.ok(pitchFloor(1) < pitchFloor(0.5) && pitchFloor(0.5) < pitchFloor(0));
  assert.ok(Math.abs(voicedShare(0.5) - 0.4) < 1e-9);
  assert.ok(voicedShare(1) < voicedShare(0));
});

test('snap to key: a note off the key moves to the neighbour it leaned toward; notes in it stay', () => {
  const major = [0, 2, 4, 5, 7, 9, 11];
  const notes = [
    { key: 60, cents: 0 }, // C: in C major
    { key: 61, cents: 30 }, // C# sung sharp: D
    { key: 61, cents: -10 }, // C# sung flat: C
    { key: 66, cents: 5 }, // F#: G
    { key: 70, cents: 0 }, // Bb, between A and B, not leaning: B
  ];
  assert.deepEqual(
    snapToKey(notes, 0, major).map((n) => n.key),
    [60, 62, 60, 67, 71],
  );
  // in D major, F# is in the key and F isn't: F goes up to F# only when it leans up, else down to E
  const d = [
    { key: 65, cents: 20 },
    { key: 65, cents: -20 },
  ];
  assert.deepEqual(
    snapToKey(d, 2, major).map((n) => n.key),
    [66, 64],
  );
});
