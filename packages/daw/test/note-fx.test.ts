import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  addTrack,
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
