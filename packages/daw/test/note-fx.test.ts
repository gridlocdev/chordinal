import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  addTrack,
  applyFxToNotes,
  arpCycle,
  arpKey,
  arpSettings,
  addTrackFx,
  fxName,
  moveTrackFx,
  removeTrackFx,
  setTrackFx,
  chordOver,
  emptyProject,
  makeTrack,
  performProject,
  registerFx,
  snapToScale,
} from '@chordinal/daw';
import type { Project, TrackFx } from '@chordinal/daw';

const C_MAJOR = [0, 2, 4, 5, 7, 9, 11];

/** a project in C major with one track playing `keys` a beat apart, through `fx` */
function playing(keys: number[], fx: TrackFx[], key: Project['key'] = { tonic: 0, mode: 'major' }): Project {
  let p: Project = { ...emptyProject(), key };
  const notes = keys.map((k, i) => ({ beat: i, beats: 1, key: k, vel: 90 }));
  p = addTrack(p, {
    ...makeTrack(p, { name: 'keys' }),
    id: 'k',
    fx,
    clips: [{ id: 'c', start: 0, beats: 8, notes }],
  });
  return p;
}
const played = (p: Project) => performProject(p, 0).tracks[0]!.map((n) => [n.beat, n.key]);

test('Scale moves a note outside the key to the nearest one in it, down on a tie', () => {
  assert.equal(snapToScale(60, C_MAJOR), 60);
  assert.equal(snapToScale(61, C_MAJOR), 60, 'C# between C and D goes down');
  assert.equal(snapToScale(66, C_MAJOR), 65, 'F# goes to F');
  assert.deepEqual(played(playing([61, 63, 64], [{ type: 'scale' }])), [
    [0, 60],
    [1, 62],
    [2, 64],
  ]);
  assert.deepEqual(
    played(playing([61], [{ type: 'scale' }], null)),
    [[0, 61]],
    'with no key set it leaves notes',
  );
});

test("Chord stacks a shape on each note, or the key's chord on that degree", () => {
  assert.deepEqual(chordOver(60, 'minor', null), [60, 63, 67]);
  assert.deepEqual(chordOver(62, 'key', C_MAJOR), [62, 65, 69], 'D in C major is D minor');
  assert.deepEqual(chordOver(67, 'key', C_MAJOR), [67, 71, 74], 'G in C major is G major');
  assert.deepEqual(chordOver(61, 'key', C_MAJOR), [61, 68], 'a note outside the key gets a fifth');
  assert.deepEqual(played(playing([60], [{ type: 'chord', shape: 'key' }])), [
    [0, 60],
    [0, 64],
    [0, 67],
  ]);
});

test('note FX run in order, a bypassed one is skipped, and Humanize-style FX play their output', () => {
  // Scale then Chord: C# becomes C, then C major
  assert.deepEqual(
    played(playing([61], [{ type: 'scale' }, { type: 'chord', shape: 'key' }])).map(([, k]) => k),
    [60, 64, 67],
  );
  assert.deepEqual(
    played(
      playing(
        [61],
        [
          { type: 'scale', bypass: true },
          { type: 'chord', shape: 'power' },
        ],
      ),
    ).map(([, k]) => k),
    [61, 68, 73],
  );
  // a whole-project FX after them sees the chord's notes
  registerFx('test-count', {
    name: 'Count',
    perform: (p) => ({
      notes: new Map(
        p.tracks.map((t) => [t.id, t.clips.flatMap((c) => c.notes).map((n) => ({ ...n, grid: n.beat }))]),
      ),
      events: [],
    }),
  });
  assert.equal(played(playing([60], [{ type: 'chord', shape: 'major' }, { type: 'test-count' }])).length, 3);
});

test('a track FX list adds, sets, moves, bypasses and removes effects, keeping each type', () => {
  let p = playing([60], []);
  p = addTrackFx(p, 'k', { type: 'scale' });
  p = addTrackFx(p, 'k', { type: 'chord', shape: 'key' });
  const fx = () => p.tracks[0]!.fx;
  assert.deepEqual(
    fx().map((f) => f.type),
    ['scale', 'chord'],
  );
  p = setTrackFx(p, 'k', 1, { shape: 'minor', type: 'scale' });
  assert.deepEqual(fx()[1], { type: 'chord', shape: 'minor' }, 'a patch never changes the type');
  const same = setTrackFx(p, 'k', 1, { shape: 'minor' });
  assert.equal(same.tracks[0], p.tracks[0], 'a patch that changes nothing keeps the track');
  p = moveTrackFx(p, 'k', 1, -1);
  assert.deepEqual(
    fx().map((f) => f.type),
    ['chord', 'scale'],
  );
  assert.equal(moveTrackFx(p, 'k', 0, -1).tracks[0], p.tracks[0], 'the first stays first');
  p = setTrackFx(p, 'k', 0, { bypass: true });
  assert.deepEqual(played(p), [[0, 60]], 'a bypassed Chord adds nothing');
  p = removeTrackFx(p, 'k', 0);
  assert.deepEqual(fx(), [{ type: 'scale' }]);
  assert.equal(fxName('chord'), 'Chord');
});

test('the arpeggiator plays a held chord one key at a time, in each direction and over octaves', () => {
  assert.deepEqual(arpCycle([64, 60, 67], 'up', 1), [60, 64, 67]);
  assert.deepEqual(arpCycle([64, 60, 67], 'down', 1), [67, 64, 60]);
  assert.deepEqual(arpCycle([64, 60, 67], 'played', 1), [64, 60, 67]);
  assert.deepEqual(arpCycle([60, 64, 67], 'updown', 1), [60, 64, 67, 64]);
  assert.deepEqual(arpCycle([60, 67], 'up', 2), [60, 67, 72, 79]);
  const random = arpCycle([60, 64, 67, 71], 'random', 1);
  const picks = Array.from({ length: 16 }, (_, n) => arpKey(random, n, 'random'));
  assert.deepEqual(
    Array.from({ length: 16 }, (_, n) => arpKey(random, n, 'random')),
    picks,
    'random is the same every time',
  );
  assert.ok(new Set(picks).size > 1);
});

test('an arpeggiated chord on Play: steps from its first beat, at the rate, with the gate, and the same twice', () => {
  // a C major chord held for one beat, at 1/8: two steps of half a beat, each sounding 0.4 beats
  const chord = [60, 64, 67].map((key) => ({ beat: 0, beats: 1, key, vel: 90 }));
  let p: Project = { ...emptyProject(), key: { tonic: 0, mode: 'major' } };
  p = addTrack(p, {
    ...makeTrack(p, { name: 'keys' }),
    id: 'k',
    fx: [{ type: 'arp', rate: '1/8', direction: 'up', gate: 0.8 }],
    clips: [{ id: 'c', start: 0, beats: 4, notes: chord }],
  });
  const steps = performProject(p, 0).tracks[0]!.map((n) => [n.beat, n.key, n.beats]);
  assert.deepEqual(steps, [
    [0, 60, 0.4],
    [0.5, 64, 0.4],
  ]);
  assert.deepEqual(
    performProject(p, 1).tracks[0]!.map((n) => [n.beat, n.key, n.beats]),
    steps,
  );

  // Chord then Arpeggiator: one held key plays its key's chord, one note at a time, 1/16 over two octaves
  const one = playing(
    [60],
    [
      { type: 'chord', shape: 'key' },
      { type: 'arp', octaves: 2 },
    ],
  );
  assert.deepEqual(
    played(one).map(([, key]) => key),
    [60, 64, 67, 72],
    'a one-beat note is four 1/16 steps up C E G, then C an octave up',
  );
  assert.deepEqual(arpSettings({ type: 'arp', rate: 'nope', octaves: 9, gate: 0 }), {
    rate: '1/16',
    step: 0.25,
    direction: 'up',
    octaves: 4,
    gate: 0.05,
  });
});

test('Apply to Notes writes the effects up to it into the clips, plays the same, and keeps the rest', () => {
  registerFx('later', { name: 'Later', perform: () => ({ notes: new Map(), events: [] }) });
  const fx: TrackFx[] = [
    { type: 'scale', bypass: true },
    { type: 'chord', shape: 'key' },
    { type: 'arp', rate: '1/8', direction: 'updown', octaves: 2 },
    { type: 'later' },
    { type: 'chord', shape: 'power' },
  ];
  const before = playing([60, 62, 61], fx);
  const after = applyFxToNotes(before, 'k', 2);
  assert.deepEqual(
    after.tracks[0]!.fx.map((f) => f.type),
    ['scale', 'later', 'chord'],
    'the bypassed Scale and everything after the Arpeggiator stay',
  );
  assert.deepEqual(played(after), played(before), 'it plays the same');
  assert.ok(after.tracks[0]!.clips[0]!.notes.length > 3, 'the arpeggio is in the clip');
  assert.equal(applyFxToNotes(before, 'k', 0), before, 'a bypassed effect does nothing');
  assert.equal(applyFxToNotes(before, 'k', 3), before, 'nor does one that is not a note effect');
});
