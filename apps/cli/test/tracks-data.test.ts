import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readTracksData, writeTracksData } from '../src/tracks-data.ts';
import type { TrackInfo } from '../src/tracks-data.ts';
import { emptyProject } from '@chordinal/daw';
import { scoreOfProject, soundtrackOf } from '../src/soundtrack-file.ts';
import { fileFor, pickTracks } from '../src/render-command.ts';

const info = (title: string, extra: Partial<TrackInfo> = {}): TrackInfo => ({
  title,
  tempo: 120,
  beatsPerBar: 4,
  offset: 0.05,
  end: null,
  seconds: 10.123456,
  frames: 446436,
  rate: 44100,
  loop: { start: 2.05, end: 10.05 },
  bars: null,
  ...extra,
});

/** the TRACKS object of a written file */
function tracksOf(text: string): Record<string, Record<string, unknown>> {
  const m = /export const TRACKS = (\{[\s\S]*\});/.exec(text);
  assert.ok(m?.[1]);
  const parsed: unknown = JSON.parse(m[1]);
  assert.ok(typeof parsed === 'object' && parsed !== null);
  return Object.fromEntries(
    Object.entries(parsed).map(([k, v]: [string, unknown]) => {
      assert.ok(typeof v === 'object' && v !== null);
      return [k, Object.fromEntries(Object.entries(v))];
    }),
  );
}

const TRACKS = soundtrackOf(
  {
    tracks: [
      { id: 'title', project: 'title', loop: [1, 3] },
      { id: 'over', project: 'over' },
      {
        id: 'pond',
        project: 'pond',
        loop: [1, 2],
        trim: true,
        layerOf: 'title',
        place: 'pond',
        level: 0.6,
      },
    ],
  },
  'soundtrack.json',
);

test('the soundtrack file: the fields render reads, and every other one kept as extra', () => {
  const pond = TRACKS[2];
  assert.ok(pond);
  assert.deepEqual(pond.loop, [1, 2]);
  assert.equal(pond.trim, true);
  assert.equal(pond.project, 'pond');
  assert.deepEqual(pond.extra, { layerOf: 'title', place: 'pond', level: 0.6 });
  assert.deepEqual(TRACKS[1]?.extra, {});
  assert.equal(TRACKS[1]?.loop, null);
  assert.throws(() => soundtrackOf({}, 'x.json'), /has no "tracks" list/);
  assert.throws(
    () => soundtrackOf({ tracks: [{ id: 'a', project: 'p', loop: [1] }] }, 'x.json'),
    /a: loop is \[first, end\]/,
  );
  assert.throws(() => soundtrackOf({ tracks: [{ id: 'a' }] }, 'x.json'), /a names no project folder/);
  assert.throws(
    () =>
      soundtrackOf(
        {
          tracks: [
            { id: 'a', project: 'p' },
            { id: 'a', project: 'p' },
          ],
        },
        'x.json',
      ),
    /listed twice/,
  );
});

test('track ids pick the tracks to render; an unknown one is an error listing them', () => {
  assert.deepEqual(
    pickTracks(TRACKS, ['pond', 'title']).map((t) => t.id),
    ['title', 'pond'],
  );
  assert.equal(pickTracks(TRACKS, []).length, 3);
  assert.throws(() => pickTracks(TRACKS, ['nope']), /no track nope; the tracks are title, over, pond/);
});

test("an mp3's path is relative to the current folder, with /", () => {
  const cwd = path.resolve('/game');
  assert.equal(fileFor('music', 'title', cwd), 'music/title.mp3');
  assert.equal(fileFor(path.join(cwd, 'assets', 'music'), 'a', cwd), 'assets/music/a.mp3');
  assert.equal(fileFor('../shared/music', 'b', cwd), '../shared/music/b.mp3');
});

test('fresh entries, in the soundtrack file’s order, with extras copied in and seconds rounded', () => {
  const fresh = new Map([
    ['pond', info('Pond')],
    ['title', info('Title', { bars: [0.05, 2.05] })],
  ]);
  const text = writeTracksData(TRACKS, fresh, new Map(), (id) => `music/${id}.mp3`);
  assert.match(text, /^\/\/ The soundtrack/);
  assert.doesNotMatch(text, /comet|lantern|blast/i);
  const tracks = tracksOf(text);
  assert.deepEqual(Object.keys(tracks), ['title', 'pond']);
  assert.deepEqual(tracks.pond, {
    file: 'music/pond.mp3',
    title: 'Pond',
    tempo: 120,
    beatsPerBar: 4,
    offset: 0.05,
    end: null,
    seconds: 10.1235,
    frames: 446436,
    rate: 44100,
    loop: { start: 2.05, end: 10.05 },
    layerOf: 'title',
    place: 'pond',
    level: 0.6,
  });
  assert.deepEqual(tracks.title?.bars, [0.05, 2.05]);
  assert.equal('bars' in (tracks.pond ?? {}), false);
});

test('entries for tracks not rendered this time are kept from the file as it was; tracks gone from the soundtrack file drop out', () => {
  const before = writeTracksData(
    soundtrackOf({ tracks: [...TRACKS, { id: 'gone', project: 'p' }] }, 's.json'),
    new Map([
      ['over', info('Old Over', { loop: null, end: 9.5 })],
      ['title', info('Old Title')],
      ['gone', info('Gone')],
    ]),
    new Map(),
    (id) => `music/${id}.mp3`,
  );
  const old = readTracksData(before);
  assert.equal(old.size, 3);
  const after = tracksOf(
    writeTracksData(TRACKS, new Map([['title', info('New Title')]]), old, (id) => `assets/${id}.mp3`),
  );
  assert.deepEqual(Object.keys(after), ['title', 'over']);
  assert.equal(after.title?.title, 'New Title');
  assert.equal(after.over?.title, 'Old Over');
  assert.equal(after.over?.end, 9.5);
  assert.equal(after.over?.file, 'assets/over.mp3');
});

test('an older file with sampleRate, or a broken one, reads as well as it can', () => {
  const legacy = `export const TRACKS = ${JSON.stringify({ a: { ...info('A'), rate: undefined, sampleRate: 48000 }, b: { title: 1 } })};`;
  const read = readTracksData(legacy);
  assert.equal(read.get('a')?.rate, 48000);
  assert.equal(read.has('b'), false);
  assert.equal(readTracksData('export const TRACKS = {nope};').size, 0);
  assert.equal(readTracksData('').size, 0);
});

test("a project's timing: its markers are the sections, typed by their meta, and its first tempo and meter", () => {
  let p = emptyProject({ title: 'Cue', bpm: 150, sig: '3/4', bars: 6 });
  p = {
    ...p,
    markers: [
      { beat: 0, name: 'Intro', meta: { type: 'intro' } },
      { beat: 6, name: 'Section A', meta: { type: 'A' } },
      { beat: 12, name: 'Bridge' },
    ],
  };
  const s = scoreOfProject(p);
  assert.equal(s.title, 'Cue');
  assert.equal(s.tempo, 150);
  assert.equal(s.beatsPerBar, 3);
  assert.equal(s.beats, p.length);
  assert.deepEqual(
    s.sections.map((x) => [x.type, x.label, x.beat, x.beats]),
    [
      ['intro', 'Intro', 0, 6],
      ['A', 'Section A', 6, 6],
      ['Bridge', 'Bridge', 12, p.length - 12],
    ],
  );
  // a project with no markers is one section
  assert.equal(scoreOfProject(emptyProject({})).sections.length, 1);
});
