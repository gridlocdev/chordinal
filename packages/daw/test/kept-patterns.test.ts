import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  addClip,
  addTrack,
  addTrackFx,
  applyFxToNotes,
  deletePattern,
  duplicatePattern,
  emptyProject,
  findPattern,
  makeAudioTrack,
  makePattern,
  makeTrack,
  newPattern,
  patternProblems,
  patternUses,
  patternsOf,
  placePattern,
  readProject,
  removeClip,
  removeTrack,
  updateClip,
  writeProject,
} from '@chordinal/daw';
import type { Note, Project } from '@chordinal/daw';

const riff: Note[] = [
  { beat: 0, beats: 0.5, key: 60, vel: 100 },
  { beat: 1, beats: 0.5, key: 64, vel: 90 },
];

/** a project with a keys track (k), a drum track (d) and an audio track (a), and one pattern "Riff" on k, played by c1 */
function song(): Project {
  let p = emptyProject();
  p = addTrack(p, { ...makeTrack(p, { name: 'Keys' }), id: 'k' });
  p = addTrack(p, { ...makeTrack(p, { name: 'Drums', instrument: { bank: 128, program: 0 } }), id: 'd' });
  p = addTrack(p, { ...makeAudioTrack(p), id: 'a' });
  p = addClip(p, 'k', { id: 'c1', start: 0, beats: 4, notes: riff, step: 0.25, swing: 0.5 });
  return makePattern(p, 'k', 'c1', 'Riff');
}
const riffOf = (p: Project) => patternsOf(p).find((x) => x.name === 'Riff')!;

test('a pattern keeps its notes, length, step, swing and track, and stays when its last clip goes (PRD §18.1)', () => {
  let p = song();
  const id = riffOf(p).id;
  assert.deepEqual(
    { ...riffOf(p), id: '' },
    { id: '', name: 'Riff', beats: 4, notes: riff, step: 0.25, swing: 0.5, track: 'k' },
  );
  p = updateClip(p, 'k', 'c1', { beats: 8, notes: riff.slice(1) });
  assert.equal(riffOf(p).beats, 8, 'an edit to a clip reaches its pattern');
  assert.deepEqual(riffOf(p).notes, riff.slice(1));
  p = removeClip(p, 'k', 'c1');
  assert.ok(findPattern(p, id), 'the pattern stays with no clips');
  assert.equal(patternUses(p).get(id), 0);
  p = placePattern(p, 'd', id, 12, 'c9');
  const placed = p.tracks.find((t) => t.id === 'd')!.clips[0]!;
  assert.deepEqual(
    [placed.id, placed.start, placed.beats, placed.notes, placed.step, placed.swing, placed.pattern],
    ['c9', 12, 8, riff.slice(1), 0.25, 0.5, id],
    'a placed clip plays the pattern as it was left',
  );
  assert.equal(placePattern(p, 'a', id, 0), p, 'an audio track takes no clip');
  assert.equal(placePattern(p, 'k', 'nope', 0), p, 'nor does a missing pattern');
  assert.deepEqual(patternProblems(p), []);
});

test("deleting a pattern's track keeps the pattern, remembering a drum track (PRD §18.1)", () => {
  let p = song();
  p = newPattern(p, 'd', 4, 4);
  const beat = patternsOf(p).at(-1)!;
  assert.equal(beat.name, 'Drums 1', 'named as Make Pattern names it');
  assert.equal(beat.track, 'd');
  assert.equal(patternUses(p).get(beat.id), 1, 'and placed');
  p = removeTrack(removeTrack(p, 'd'), 'k');
  assert.deepEqual(
    patternsOf(p).map((x) => [x.name, x.track, x.drums]),
    [
      ['Riff', undefined, undefined],
      ['Drums 1', undefined, true],
    ],
  );
  assert.deepEqual(patternProblems(p), []);
});

test('New Pattern needs an instrument or drum track and a length', () => {
  const p = song();
  assert.equal(newPattern(p, 'a', 0, 4), p);
  assert.equal(newPattern(p, 'nope', 0, 4), p);
  assert.equal(newPattern(p, 'k', 0, 0), p);
  const q = newPattern(p, 'k', 2, 3);
  const x = patternsOf(q).at(-1)!;
  assert.deepEqual([x.name, x.beats, x.notes, x.track], ['Keys 1', 3, [], 'k']);
  assert.deepEqual(
    q.tracks[0]!.clips.map((c) => [c.start, c.pattern]),
    [
      [0, riffOf(q).id],
      [2, x.id],
    ],
  );
});

test('Duplicate Pattern adds an unplaced copy, "copy" then "copy 2"; Delete Pattern takes its clips too (PRD §18.7)', () => {
  let p = song();
  const id = riffOf(p).id;
  p = duplicatePattern(duplicatePattern(p, id), id);
  assert.deepEqual(
    patternsOf(p).map((x) => x.name),
    ['Riff', 'Riff copy', 'Riff copy 2'],
  );
  const copy = patternsOf(p)[1]!;
  assert.notEqual(copy.id, id);
  assert.deepEqual([copy.notes, copy.track, patternUses(p).get(copy.id)], [riff, 'k', 0]);
  p = placePattern(p, 'd', id, 8);
  p = deletePattern(p, id);
  assert.equal(findPattern(p, id), null);
  assert.equal(
    p.tracks.flatMap((t) => t.clips).filter((c) => c.pattern === id).length,
    0,
    'every clip of it goes',
  );
  assert.equal(deletePattern(p, id), p);
  const empty = [copy.id, patternsOf(p)[1]!.id].reduce(deletePattern, p);
  assert.ok(!('patterns' in empty), 'the last one deleted leaves no list');
});

test('Apply to Notes on a pattern clip changes the pattern and its clips on other tracks alike', () => {
  let p = song();
  p = placePattern(p, 'd', riffOf(p).id, 8);
  p = addTrackFx(p, 'k', { type: 'chord', shape: 'power' });
  p = applyFxToNotes(p, 'k', 0);
  assert.ok(riffOf(p).notes.length > riff.length, 'the chord is in the pattern');
  assert.deepEqual(patternProblems(p), []);
});

test('saving writes every pattern with its track, placed or not, and reading keeps them (PRD §18.8)', () => {
  let p = song();
  const id = riffOf(p).id;
  p = removeClip(p, 'k', 'c1');
  p = newPattern(p, 'd', 0, 4);
  p = removeTrack(p, 'd');
  const text = writeProject(p),
    file = JSON.parse(text);
  assert.equal(file.version, 3, 'with an audio track');
  assert.equal(
    JSON.parse(writeProject(removeTrack(p, 'a'))).version,
    2,
    'an unplaced pattern is enough for 2',
  );
  assert.deepEqual(
    file.patterns.map((x: { name: string; track: string | null; drums?: boolean }) => [
      x.name,
      x.track,
      x.drums,
    ]),
    [
      ['Riff', 'k', undefined],
      ['Drums 1', null, true],
    ],
  );
  const back = readProject(text);
  assert.deepEqual(patternsOf(back), patternsOf(p));
  assert.equal(writeProject(back), text);
  assert.deepEqual(findPattern(back, id)?.notes, riff);

  // a track the file doesn't have: the pattern is read as one whose track was deleted
  file.patterns[0].track = 'gone';
  assert.equal(findPattern(readProject(JSON.stringify(file)), id)?.track, undefined);
  // a file from before patterns had tracks: its first clip's track
  const older = JSON.parse(writeProject(song()));
  delete older.patterns[0].track;
  assert.equal(patternsOf(readProject(JSON.stringify(older)))[0]!.track, 'k');
});
