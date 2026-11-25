import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  addTrack,
  emptyProject,
  makeTrack,
  addClip,
  updateClip,
  makePattern,
  passEvents,
  performProject,
  playedClipNotes,
  projectMidi,
  readProject,
  rollProject,
  swungBeat,
  withSwing,
  writeProject,
  type Clip,
  type Note,
  type Project,
} from '@chordinal/daw';
import { readMidi } from '@chordinal/lib';

const sixteenths = (chance?: number): Note[] =>
  Array.from({ length: 16 }, (_, i) => ({
    beat: i * 0.25,
    beats: 0.25,
    key: 60 + (i % 5),
    vel: 100,
    ...(chance !== undefined && { chance }),
  }));

const clip = (notes: Note[], extra: Partial<Clip> = {}): Clip => ({
  id: 'c1',
  start: 0,
  beats: 4,
  notes,
  ...extra,
});

function song(c: Clip): Project {
  const p = emptyProject(),
    t = makeTrack(p, { name: 'Keys' });
  return addClip(addTrack(p, t), t.id, c);
}

const keysOf = (notes: Note[]) => notes.map((n) => `${n.beat}:${n.key}`);

test('swing: 0% is exactly straight, 50% puts the off step two thirds through its pair, 75% three quarters (PRD §17.7)', () => {
  for (const b of [0, 0.25, 0.5, 0.75, 1.1, 3.9]) assert.equal(swungBeat(b, 0.25, 0), b);
  assert.ok(Math.abs(swungBeat(0.25, 0.25, 0.5) - 0.5 * (2 / 3)) < 1e-9);
  assert.ok(Math.abs(swungBeat(0.25, 0.25, 0.75) - 0.5 * (3 / 4)) < 1e-9);
  // the ends of each pair stay put, and a beat inside moves in proportion
  for (const b of [0, 0.5, 1, 3.5]) assert.ok(Math.abs(swungBeat(b, 0.25, 0.5) - b) < 1e-9);
  assert.ok(swungBeat(0.125, 0.25, 0.5) > 0.125 && swungBeat(0.125, 0.25, 0.5) < swungBeat(0.25, 0.25, 0.5));
});

test('swing moves the notes as they play, not as written, and keeps each inside its clip', () => {
  const c = clip(sixteenths(), { swing: 0.5 });
  const played = playedClipNotes(c, 0);
  assert.equal(played.length, 16);
  assert.equal(played[0]!.beat, 0);
  assert.ok(Math.abs(played[1]!.beat - 1 / 3) < 1e-9);
  assert.equal(c.notes[1]!.beat, 0.25, 'the written note stays where it was');
  for (const n of played) assert.ok(n.beat + n.beats <= 4 + 1e-9);
  // a project with neither chance nor swing plays exactly as before
  const plain = song(clip(sixteenths()));
  assert.equal(rollProject(plain, 3), plain);
});

test('probability: the same notes play every time, each loop pass rolls again (PRD §17.6)', () => {
  const p = song(clip(sixteenths(0.5)));
  const pass = (n: number) => keysOf(performProject(p, n).tracks[0]!);
  assert.deepEqual(pass(0), pass(0), 'two plays of the first pass are the same');
  assert.deepEqual(
    passEvents(p, 2).events.map((e) => e.beat),
    passEvents(p, 2).events.map((e) => e.beat),
  );
  const passes = [0, 1, 2, 3, 4, 5].map(pass);
  assert.ok(new Set(passes.map((x) => x.join())).size > 1, 'the passes differ');
  const share = passes.flat().length / (16 * passes.length);
  assert.ok(share > 0.3 && share < 0.7, `about half play (${share})`);
  // 0 never plays, 1 always does
  assert.equal(performProject(song(clip(sixteenths(0))), 0).tracks[0]!.length, 0);
  assert.equal(performProject(song(clip(sixteenths(1))), 0).tracks[0]!.length, 16);
});

test('a pattern shares its swing; a MIDI export writes every note; a save keeps both at the same version', () => {
  let p = song(clip(sixteenths(0.5)));
  const t = p.tracks[0]!;
  p = makePattern(p, t.id, 'c1', 'Riff');
  p = addClip(p, t.id, { ...p.tracks[0]!.clips[0]!, id: 'c2', start: 4 });
  p = updateClip(p, t.id, 'c1', { swing: 0.25 });
  assert.equal(p.tracks[0]!.clips.find((c) => c.id === 'c2')!.swing, 0.25, 'the linked copy swings too');

  const midi = readMidi(projectMidi(p));
  assert.equal(midi.tracks.flatMap((x) => x.notes).length, 32, 'every note, whatever its chance');

  const text = writeProject(p),
    back = readProject(text);
  assert.equal(JSON.parse(text).version, 2, 'patterns, no newer version');
  assert.deepEqual(
    back.tracks[0]!.clips.map((c) => [c.swing, c.notes.filter((n) => n.chance === 0.5).length]),
    [
      [0.25, 16],
      [0.25, 16],
    ],
  );
  assert.equal(writeProject(back), text);
  const plain = song(clip(sixteenths(0.5), { swing: 0.5 }));
  assert.equal(JSON.parse(writeProject(plain)).version, 1);
});

test('the Swing slider keeps swing to whole percents up to 75%, and straight leaves no swing on the clip', () => {
  const c = clip(sixteenths());
  assert.equal(withSwing(c, 0.333).swing, 0.33);
  assert.equal(withSwing(c, 2).swing, 0.75);
  assert.ok(!('swing' in withSwing(withSwing(c, 0.5), 0)));
  assert.ok(!('swing' in withSwing(c, -1)));
});
