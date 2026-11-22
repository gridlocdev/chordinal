// The Humanize MIDI FX on a project made by hand: it reads the groove's swing, style, pocket and tight, plays the same
// way every time for the same pass, and keeps a part in its pocket while the kick holds the grid.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { emptyProject, makeTrack, addTrack, addClip } from '@chordinal/daw';
import type { Project } from '@chordinal/daw';
import { HUMANIZE, humanizeFx, scoreOf, DRUM_KEYS } from '../src/index.ts';

const BEATS = 16;

/** a four-bar project at 90 bpm with a chords track and a drum kit (kick on 1 and 3, snare on 2 and 4), both humanized */
function project(groove: Project['groove'] = {}): Project {
  let p = emptyProject({ title: 'Hand made', bpm: 90, bars: 4 });
  p = { ...p, groove };
  const chords = { ...makeTrack(p, { name: 'Keys' }), id: 'keys', fx: [{ type: HUMANIZE, role: 'chords' }] };
  const drums = {
    ...makeTrack(p, { name: 'Drums', instrument: { bank: 128, program: 0 } }),
    id: 'drums',
    fx: [{ type: HUMANIZE, role: 'drums' }],
  };
  p = addTrack(addTrack(p, chords), drums);
  const beats = Array.from({ length: BEATS }, (_, i) => i);
  p = addClip(p, 'keys', {
    id: 'k',
    start: 0,
    beats: BEATS,
    notes: beats.map((beat) => ({ beat, beats: 1, key: 60, vel: 90 })),
  });
  return addClip(p, 'drums', {
    id: 'd',
    start: 0,
    beats: BEATS,
    notes: beats.map((beat) => ({
      beat,
      beats: 0.5,
      key: beat % 2 ? DRUM_KEYS.snare : DRUM_KEYS.kick,
      vel: 100,
    })),
  });
}

test('scoreOf reads swing, style, pocket and tight from the groove, and the role from each track’s FX', () => {
  const score = scoreOf(
    project({
      swing: 0.3,
      style: { ghosts: 0.2 },
      pocket: { chords: 25, snare: 30 },
      tight: 0.5,
      genre: 'lo-fi',
    }),
  );
  assert.equal(score.swing, 0.3);
  assert.deepEqual(score.style, { ghosts: 0.2 });
  assert.deepEqual(score.pocket, { chords: 25, snare: 30 });
  assert.equal(score.tight, 0.5);
  assert.deepEqual(
    score.tracks.map((t) => t.role),
    ['chords', 'drums'],
  );
  // a pocket that isn't numbers is left out
  assert.equal(scoreOf(project({ pocket: { chords: 'late' } })).pocket, undefined);
});

test('the same pass plays the same way every time', () => {
  const p = project({ swing: 0.2 });
  assert.deepEqual(humanizeFx.perform(p, 1).notes, humanizeFx.perform(p, 1).notes);
});

test('a pocket puts the chords and the snare behind the beat, and the kick holds the grid', () => {
  const pocket = { chords: 25, snare: 30 };
  const plain = humanizeFx.perform(project(), 0).notes,
    lazy = humanizeFx.perform(project({ pocket }), 0).notes;
  const spb = 60 / 90;
  /** mean ms later than with no pocket, of the notes `keep` picks */
  const late = (id: string, keep: (key: number) => boolean = () => true): number => {
    const a = (lazy.get(id) ?? []).filter((n) => !n.ghost && !n.candy && keep(n.key)),
      b = (plain.get(id) ?? []).filter((n) => !n.ghost && !n.candy && keep(n.key));
    assert.equal(a.length, b.length);
    return (a.reduce((sum, n, i) => sum + n.beat - (b[i]?.beat ?? 0), 0) / a.length) * spb * 1000;
  };
  assert.ok(Math.abs(late('keys') - pocket.chords) < 2, `chords ${late('keys').toFixed(1)} ms`);
  assert.ok(Math.abs(late('drums', (k) => k === DRUM_KEYS.snare) - pocket.snare) < 2, 'the snare lies back');
  assert.ok(Math.abs(late('drums', (k) => k === DRUM_KEYS.kick)) < 1, 'the kick holds the grid');
});
