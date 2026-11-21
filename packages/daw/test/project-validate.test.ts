// A project.json the app can't play is refused on open with what is wrong, rather than opening and failing later
// (audit: only the top-level keys were checked, so a note with no key opened and played silence or NaN).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readProject, writeProject } from '@chordinal/daw';
import { emptyProject, makeTrack, addTrack } from '@chordinal/daw';
import { at } from './at.ts';

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const isList = (x: unknown): x is unknown[] => Array.isArray(x);

/** the value at a path in parsed JSON */
function get(data: unknown, path: (string | number)[]): unknown {
  let x = data;
  for (const k of path) {
    assert.ok(isObject(x), `nothing at ${k}`);
    x = x[k];
  }
  return x;
}

/** the value at a path in parsed JSON set, or taken out when it is undefined */
function put(data: unknown, path: (string | number)[], value: unknown): void {
  const parent = get(data, path.slice(0, -1)),
    k = at(path, -1);
  assert.ok(isObject(parent));
  if (value === undefined) delete parent[k];
  else parent[k] = value;
}

/** a written project with one track and one clip, then `spoil` applied to its parsed JSON */
function spoiled(spoil: (data: unknown) => void): string {
  let p = emptyProject({ title: 'Check' });
  p = addTrack(p, makeTrack(p));
  at(p.tracks, 0).clips = [
    { id: 'c1', start: 0, beats: 4, notes: [{ beat: 0, beats: 1, key: 60, vel: 100 }] },
  ];
  const data: unknown = JSON.parse(writeProject(p));
  spoil(data);
  return JSON.stringify(data);
}

test('a sound project reads', () => {
  assert.equal(readProject(spoiled(() => {})).tracks[0]?.clips[0]?.notes[0]?.key, 60);
});

const cases: [string, (data: unknown) => void, RegExp][] = [
  [
    'a note with no key',
    (d) => put(d, ['tracks', 0, 'clips', 0, 'notes', 0, 2], null),
    /track 1, clip c1, note 1 has no key/,
  ],
  [
    'a note with a length of 0',
    (d) => put(d, ['tracks', 0, 'clips', 0, 'notes', 0, 1], 0),
    /note 1 has no length/,
  ],
  ['a tempo of 0', (d) => put(d, ['tempoMap', 0, 'bpm'], 0), /tempo change 1/],
  ['a meter that is not like 4/4', (d) => put(d, ['meters', 0, 'sig'], 'four'), /meter 1/],
  [
    'two clips with one id',
    (d) => {
      const clips = get(d, ['tracks', 0, 'clips']),
        clip = get(d, ['tracks', 0, 'clips', 0]);
      assert.ok(isList(clips) && isObject(clip));
      clips.push({ ...clip });
    },
    /no id of its own/,
  ],
  ['tracks that are not a list', (d) => put(d, ['tracks'], {}), /tracks are not a list/],
  [
    'a clip with no notes list',
    (d) => put(d, ['tracks', 0, 'clips', 0, 'notes'], undefined),
    /clip c1 has no list of notes/,
  ],
];

for (const [what, spoil, message] of cases) {
  test(`${what} is refused, saying what is wrong`, () => {
    assert.throws(() => readProject(spoiled(spoil)), message);
  });
}
