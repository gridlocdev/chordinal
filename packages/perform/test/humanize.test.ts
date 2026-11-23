// The Humanize MIDI FX on a project made by hand: it reads the groove's swing, style, pocket and tight, plays the same
// way every time for the same pass, and keeps a part in its pocket while the kick holds the grid.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { emptyProject, makeTrack, addTrack, addClip } from '@chordinal/daw';
import type { Project } from '@chordinal/daw';
import { HUMANIZE, humanizeFx, scoreOf, swungNotes, DRUM_KEYS } from '../src/index.ts';

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

/** the project with two eight-beat sections, the second with this meta */
const sectioned = (groove: Project['groove'], meta: Record<string, unknown>): Project => ({
  ...project(groove),
  markers: [
    { beat: 0, name: 'Verse', meta: { type: 'verse', meter: '4/4' } },
    { beat: 8, name: 'Chorus', meta: { type: 'chorus', meter: '4/4', ...meta } },
  ],
});

test("scoreOf reads a section's own swing, pocket and tight from its marker, and leaves out what isn't a number", () => {
  const score = scoreOf(sectioned({}, { swing: 0, swingSub: 0.25, pocket: { chords: 40 }, tight: 0.2 }));
  const [verse, chorus] = score.sections;
  assert.equal(verse?.swing, undefined);
  assert.deepEqual(
    [chorus?.swing, chorus?.swingSub, chorus?.pocket, chorus?.tight],
    [0, 0.25, { chords: 40 }, 0.2],
  );
  const bad = scoreOf(sectioned({}, { swing: 'lots', pocket: { chords: 'late' }, tight: '1' })).sections[1];
  assert.deepEqual([bad?.swing, bad?.pocket, bad?.tight], [undefined, undefined, undefined]);
});

test("a section's own swing wins over the song's: 0 plays it straight, and a straight song can swing a section", () => {
  const offbeats = [0.5, 8.5].map((beat) => ({ key: 60, beat, beats: 0.5, vel: 90 }));
  const starts = (p: Project) => swungNotes(offbeats, scoreOf(p)).map((n) => n.beat);
  const [verse, chorus] = starts(sectioned({ swing: 1 }, { swing: 0 }));
  assert.ok(verse! > 0.6, 'the verse swings');
  assert.equal(chorus, 8.5, 'the chorus plays straight');
  const [straight, swung] = starts(sectioned({}, { swing: 1 }));
  assert.equal(straight, 0.5);
  assert.ok(swung! > 8.6, 'only the chorus swings');
});

test("a section's own pocket lays its parts back there, over the song's, and leaves the rest of the song alone", () => {
  const spb = 60 / 90;
  const plain = humanizeFx.perform(sectioned({ pocket: { snare: 20 } }, {}), 0).notes.get('keys') ?? [],
    lazy =
      humanizeFx
        .perform(sectioned({ pocket: { snare: 20 } }, { pocket: { chords: 30 } }), 0)
        .notes.get('keys') ?? [];
  const late = (from: number, to: number): number => {
    const a = lazy.filter((n) => !n.ghost && !n.candy && n.beat >= from - 0.2 && n.beat < to - 0.2),
      b = plain.filter((n) => !n.ghost && !n.candy && n.beat >= from - 0.2 && n.beat < to - 0.2);
    assert.equal(a.length, b.length);
    return (a.reduce((sum, n, i) => sum + n.beat - (b[i]?.beat ?? 0), 0) / a.length) * spb * 1000;
  };
  assert.ok(Math.abs(late(0, 8)) < 1, 'the verse keeps its place');
  assert.ok(Math.abs(late(8, 16) - 30) < 2, `the chorus lies back ${late(8, 16).toFixed(1)} ms`);
});

test("a note's detune plays through Humanize, on the note and nowhere else", () => {
  const p = project();
  const keys = p.tracks.find((t) => t.id === 'keys')!;
  const clip = keys.clips[0]!;
  const tuned = {
    ...p,
    tracks: p.tracks.map((t) =>
      t === keys
        ? {
            ...t,
            clips: [{ ...clip, notes: clip.notes.map((n, i) => (i === 4 ? { ...n, detune: -13.7 } : n)) }],
          }
        : t,
    ),
  };
  const out = (humanizeFx.perform(tuned, 0).notes.get('keys') ?? []).filter((n) => !n.ghost && !n.candy);
  assert.deepEqual(
    out.filter((n) => n.detune).map((n) => n.detune),
    [-13.7],
  );
});
