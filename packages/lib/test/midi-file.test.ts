import { test } from 'vitest';
import assert from 'node:assert/strict';
import { writeMidi, readMidi, varLen } from '@chordinal/lib';

test('variable-length numbers', () => {
  assert.deepEqual(varLen(0), [0]);
  assert.deepEqual(varLen(127), [127]);
  assert.deepEqual(varLen(128), [0x81, 0]);
  assert.deepEqual(varLen(0x3fff), [0xff, 0x7f]);
});

test('a format 1 file with a conductor track and one track per part', () => {
  const bytes = writeMidi({
    tempo: 120,
    beatsPerBar: 4,
    tracks: [
      {
        name: 'a',
        channel: 0,
        program: 0,
        notes: [
          { key: 60, beat: 0, beats: 1, vel: 100 },
          { key: 60, beat: 1, beats: 1, vel: 100 },
        ],
      },
      { name: 'b', channel: 9, program: 0, notes: [] },
    ],
  });
  const s = String.fromCharCode(...bytes.slice(0, 4));
  assert.equal(s, 'MThd');
  assert.equal(bytes[9], 1); // format 1
  assert.equal(bytes[11], 3); // conductor + 2 tracks
  assert.equal((bytes[12]! << 8) | bytes[13]!, 480);
  const tracks = [...String.fromCharCode(...bytes).matchAll(/MTrk/g)].length;
  assert.equal(tracks, 3);
});

test('a written file reads back the same', () => {
  const song = {
    title: 'Round',
    tempo: 100,
    beatsPerBar: 3,
    tempos: [
      { beat: 0, bpm: 100 },
      { beat: 12, bpm: 80 },
    ],
    meters: [
      { beat: 0, num: 3, den: 4 },
      { beat: 12, num: 6, den: 8 },
    ],
    tracks: [
      {
        name: 'Lead',
        channel: 0,
        program: 73,
        notes: [
          { key: 72, beat: 0, beats: 1.5, vel: 90 },
          { key: 72, beat: 1.5, beats: 0.5, vel: 60 },
          { key: 76, beat: 2, beats: 4, vel: 100 },
        ],
      },
      {
        name: 'Kit',
        channel: 9,
        program: 0,
        notes: [
          { key: 36, beat: 0, beats: 0.25, vel: 110 },
          { key: 38, beat: 1, beats: 0.25, vel: 100 },
        ],
      },
    ],
  };
  const back = readMidi(writeMidi(song));
  assert.equal(back.title, 'Round');
  assert.deepEqual(back.tempos, song.tempos);
  assert.deepEqual(back.meters, song.meters);
  assert.deepEqual(back.tracks, song.tracks);
});

test('tuned notes are pitch bends: a chord tuned three ways takes three channels, and reads back tuned', () => {
  const chord = [
    { key: 60, beat: 0, beats: 4, vel: 80 },
    { key: 64, beat: 0, beats: 4, vel: 80, cents: -13.7 },
    { key: 67, beat: 0, beats: 4, vel: 80, cents: 2 },
    { key: 70, beat: 4, beats: 4, vel: 80, cents: -31.2 },
  ];
  const back = readMidi(
    writeMidi({
      tempo: 120,
      beatsPerBar: 4,
      tracks: [{ name: 'Pad', channel: 0, program: 89, notes: chord, channels: [1, 2] }],
    }),
  );
  assert.deepEqual(
    back.tracks.map((t) => [t.channel, t.program, t.notes.map((n) => [n.key, n.cents ?? 0])]),
    [
      [
        0,
        89,
        [
          [60, 0],
          [70, -31.2],
        ],
      ], // once the chord has ended, the first channel is free to bend again
      [1, 89, [[64, -13.7]]],
      [2, 89, [[67, 2]]],
    ],
  );
});

test('a bent note moves its pitch bend over its length, on a channel no other note joins, and reads back bent', () => {
  const notes = [
    // held two beats, tuned 10 cents up and bending 40 more by the end of its first beat, then back
    {
      key: 60,
      beat: 0,
      beats: 2,
      vel: 80,
      cents: 10,
      bend: [
        { beat: 1, cents: 40 },
        { beat: 2, cents: 0 },
      ],
    },
    { key: 64, beat: 0, beats: 2, vel: 80, cents: 10 }, // tuned the same at the start, so it would have shared
  ];
  const bytes = writeMidi({
    tempo: 120,
    beatsPerBar: 4,
    tracks: [{ name: 'Lead', channel: 0, program: 0, notes, channels: [1] }],
  });
  const back = readMidi(bytes);
  const [bent, plain] = back.tracks;
  assert.deepEqual([bent?.channel, bent?.notes.map((n) => [n.key, n.cents])], [0, [[60, 10]]]);
  assert.deepEqual(
    plain?.notes.map((n) => [n.key, n.cents, n.bend]),
    [[64, 10, undefined]],
    'the other stays still',
  );
  const curve = bent?.notes[0]?.bend ?? [];
  const at = (beat: number) => curve.findLast((p) => p.beat <= beat + 1e-9)?.cents ?? 0;
  assert.ok(curve.length > 10, 'written as many small steps');
  assert.ok(Math.abs(at(1) - 40) < 0.5 && Math.abs(at(0.5) - 20) < 2, 'it climbs to 40 by beat 1');
  assert.ok(Math.abs(at(1.97)) < 3, 'and comes back down');
});

test("a note that falls an octave widens its track's bend range, and reads back falling an octave", () => {
  const fall = [
    { beat: 0.5, cents: 0 },
    { beat: 1, cents: -1200 },
  ];
  const bytes = writeMidi({
    tempo: 120,
    beatsPerBar: 4,
    tracks: [
      {
        name: 'Lead',
        channel: 0,
        program: 80,
        notes: [{ key: 72, beat: 0, beats: 1, vel: 100, bend: fall }],
      },
    ],
  });
  const data = [...bytes];
  const rpn = data.findIndex((b, i) => b === 0xb0 && data[i + 1] === 6);
  assert.equal(data[rpn + 2], 12, 'RPN 0 sets 12 semitones');
  const curve = readMidi(bytes).tracks[0]?.notes[0]?.bend ?? [];
  assert.ok(Math.abs((curve.at(-1)?.cents ?? 0) + 1200) < 120, 'an octave down by its end');
  const at = (beat: number) => curve.findLast((p) => p.beat <= beat + 1e-9)?.cents ?? 0;
  assert.ok(Math.abs(at(0.4)) < 1, 'still at pitch before the fall starts');
});

test("a file's own bend range is read from RPN 0", () => {
  // channel 0: range 24 semitones, the bend at full down, a note on it, the note off
  const ev = [
    0, 0xb0, 101, 0, 0, 0xb0, 100, 0, 0, 0xb0, 6, 24, 0, 0xb0, 38, 0, 0, 0xe0, 0, 0, 0, 0x90, 60, 100, 96,
    0x80, 60, 0, 0, 0xff, 0x2f, 0,
  ];
  const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96];
  const track = [0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, ev.length, ...ev];
  const note = readMidi(new Uint8Array([...head, ...track])).tracks[0]?.notes[0];
  assert.equal(note?.cents, -2400);
});

test('a track with no tuned notes writes no bends or extra channels', () => {
  const plain = { name: 'Lead', channel: 0, program: 0, notes: [{ key: 60, beat: 0, beats: 1, vel: 90 }] };
  const song = { tempo: 120, beatsPerBar: 4, tracks: [plain] };
  assert.deepEqual(writeMidi({ ...song, tracks: [{ ...plain, channels: [1, 2] }] }), writeMidi(song));
});

test('a format 0 file: channels split into tracks, running status, note-on at velocity 0 as note-off', () => {
  const bytes = new Uint8Array([
    ...[0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96],
    ...[0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 30],
    0,
    0xc0,
    40, // violin on channel 1
    0,
    0x90,
    60,
    100, // C on
    48,
    64,
    80, // running status: E on, half a beat in
    48,
    60,
    0, // C off (velocity 0)
    0,
    0x99,
    36,
    120, // a kick on channel 10
    96,
    0x89,
    36,
    0, // kick off
    0,
    0x80,
    64,
    0, // E off
    0,
    0xff,
    0x2f,
    0,
  ]);
  const m = readMidi(bytes);
  assert.deepEqual(m.tempos, []);
  assert.equal(m.tracks.length, 2);
  assert.deepEqual(m.tracks[0], {
    name: '',
    channel: 0,
    program: 40,
    notes: [
      { key: 60, beat: 0, beats: 1, vel: 100 },
      { key: 64, beat: 0.5, beats: 1.5, vel: 80 },
    ],
  });
  assert.deepEqual(m.tracks[1], {
    name: '',
    channel: 9,
    program: 0,
    notes: [{ key: 36, beat: 1, beats: 1, vel: 120 }],
  });
});

test('not a MIDI file', () => assert.throws(() => readMidi(new Uint8Array([1, 2, 3])), /not a MIDI file/));
