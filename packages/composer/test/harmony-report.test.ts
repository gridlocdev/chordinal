import { test } from 'vitest';
import assert from 'node:assert/strict';
import { compose } from '@chordinal/composer';
import { GENRES } from '@chordinal/composer';
import { harmonyStats, melodyDistance, melodyStats, overlap, readChordName } from '@chordinal/composer';
import type { MelodyStats, Score, SongSpec } from '@chordinal/composer';
import { at, of } from './at.ts';

test('readChordName reads a root and a quality; overlap is shared over all', () => {
  assert.deepEqual(readChordName('Bbm7/F'), { root: 10, quality: 'm7' });
  assert.deepEqual(readChordName('F#'), { root: 6, quality: '' });
  assert.equal(overlap(new Set(['a', 'b']), new Set(['b', 'c'])), 1 / 3);
});

test("harmonyStats reads chords as numerals in their section's key", () => {
  const s = harmonyStats(
    compose({
      title: 'Plain',
      emotion: 'joyful',
      extend: null,
      style: { secondary: 0, sus: 0, borrowed: 0 },
      form: ['verse'],
      sections: { verse: { progression: 'I IV V I', endOn: null } },
    }),
  );
  assert.equal(s.triads, 1);
  assert.ok(s.windows.has('I IV V I'));
  assert.deepEqual(s.endings, ['V I']);
});

// Every genre is composed the same way, so whatever differs comes from the genre. Thresholds sit well clear of
// today's numbers (`just harmony`): a change that makes the genres sound alike again fails here.
test('genres sound different: their own progressions, colours and endings', () => {
  const genres = Object.keys(GENRES);
  for (const g of genres) assert.ok(of(GENRES, g).progressions, `${g} has progressions of its own`);
  const stats = genres.map((genre) =>
    harmonyStats(compose({ title: 'Genres apart', genre, emotion: 'joyful' })),
  );
  let sum = 0,
    pairs = 0;
  for (let i = 0; i < genres.length; i++)
    for (let j = i + 1; j < genres.length; j++) {
      const x = overlap(at(stats, i).windows, at(stats, j).windows);
      assert.ok(
        x < 0.35,
        `${genres[i]} and ${genres[j]} share ${Math.round(x * 100)}% of their progressions`,
      );
      sum += x;
      pairs++;
    }
  assert.ok(sum / pairs < 0.06, `genres share ${(sum / pairs).toFixed(3)} of their progressions on average`);
  const chords = stats.reduce((t, s) => t + s.chords, 0),
    triads = stats.reduce((t, s) => t + s.triads * s.chords, 0);
  assert.ok(
    triads / chords < 0.5,
    `${Math.round((triads / chords) * 100)}% of the genres' chords are plain triads`,
  );
  const qualities = new Set(stats.flatMap((s) => Object.keys(s.qualities)));
  assert.ok(qualities.size >= 12, `only ${[...qualities].join(' ')}`);
  const endings = new Set(stats.flatMap((s) => s.endings.map((e) => e.split(' ').at(-2))));
  assert.ok(endings.size >= 8, `sections lead into their last chord from only ${[...endings].join(', ')}`);
});

test('styles bring their own passing chords: tritone substitutes in jazz, mediants in film, not only dim7', () => {
  const names = (spec: SongSpec): string[] =>
    compose({ title: 'Passing', form: ['verse', 'chorus', 'verse', 'chorus'], ...spec }).chords.map(
      (c) => c.name,
    );
  const jazz = names({ emotion: 'joyful', key: 'C', style: 'jazzy' });
  assert.ok(
    jazz.some((n) => /^(Db|Eb|Gb|Ab|Bb)7$/.test(n)),
    `a tritone substitute in ${jazz.join(' ')}`,
  );
  const film = harmonyStats(compose({ title: 'Passing', emotion: 'joyful', key: 'C', style: 'cinematic' }));
  assert.ok(
    ['bVI', 'bIII', '#IV', 'bII'].some((r) => [...film.windows].some((w) => w.includes(r))),
    'a chromatic mediant or borrowed chord',
  );
});

// The same for the lead: every genre has a melodic profile, and no two genres' tunes come out alike. Today the
// nearest pair is about 0.11 apart and the mean about 0.46 (`just harmony`).
test('genres sing different melodies: pace, steps and leaps, syncopation, range', () => {
  const genres = Object.keys(GENRES);
  const MELODIC = ['pace', 'span', 'offbeat', 'rules', 'motif', 'avoid', 'blue', 'phrases', 'develop'];
  for (const g of genres)
    assert.ok(
      MELODIC.some((k) => k in of(GENRES, g)),
      `${g} has a melody of its own`,
    );
  const tunes = genres.map((genre): MelodyStats => {
    const [a, b] = ['joyful', 'melancholy'].map((emotion) =>
      melodyStats(compose({ title: `Report ${genre}`, genre, emotion })),
    );
    assert.ok(a && b);
    const mean = (k: keyof MelodyStats): number => (a[k] + b[k]) / 2;
    return {
      pace: mean('pace'),
      steps: mean('steps'),
      leaps: mean('leaps'),
      repeats: mean('repeats'),
      offbeat: mean('offbeat'),
      length: mean('length'),
      range: mean('range'),
      outside: mean('outside'),
    };
  });
  const d: number[] = [];
  for (let i = 0; i < tunes.length; i++)
    for (let j = i + 1; j < tunes.length; j++) {
      const x = melodyDistance(at(tunes, i), at(tunes, j));
      assert.ok(x > 0.07, `${genres[i]} and ${genres[j]} sing alike (${x.toFixed(2)})`);
      d.push(x);
    }
  assert.ok(d.reduce((t, x) => t + x, 0) / d.length > 0.38, "genres' melodies are far apart on average");
  const by = Object.fromEntries(genres.map((g, i) => [g, at(tunes, i)]));
  const cinematic = of(by, 'cinematic'),
    chiptune = of(by, 'chiptune');
  assert.ok(cinematic.length > chiptune.length * 1.5, 'a film theme holds its notes, a chip lead runs');
  assert.ok(chiptune.pace > cinematic.pace * 1.5);
  assert.ok(of(by, 'celtic').steps > of(by, 'synthwave').steps + 0.3, 'a reel steps, a synth hook leaps');
});

test('genres differ in sound and shape: tempo, key, band, mix, form and feel', () => {
  const songs = Object.fromEntries(
    Object.keys(GENRES).map((g) => [g, compose({ title: `Report ${g}`, genre: g, emotion: 'joyful' })]),
  );
  // every genre names its whole band, its tempo range and its mix
  for (const [name, g] of Object.entries(GENRES)) {
    assert.ok(g.tempo && g.mix, `${name}: tempo and mix`);
    const song = of(songs, name);
    assert.deepEqual(
      Object.keys(g.band ?? {}).sort(),
      ['arp', 'bass', 'chords', 'counter', 'drums', 'lead', 'pad'],
      `${name}: the whole band`,
    );
    const [lo, hi] = Array.isArray(g.tempo) ? g.tempo : [g.tempo, g.tempo];
    assert.ok(song.tempo >= lo && song.tempo <= hi, `${name} at ${song.tempo}`);
    if (g.keys) assert.ok(g.keys.includes(song.key), `${name} in ${song.key}`);
  }
  // no two genres share a lead instrument, a band and a tempo range all at once
  const sound = (g: string): string => JSON.stringify([of(GENRES, g).band, of(GENRES, g).tempo]);
  assert.equal(new Set(Object.keys(GENRES).map(sound)).size, Object.keys(GENRES).length);
  assert.ok(
    of(songs, 'reggae').tempo < of(songs, 'edm').tempo &&
      of(songs, 'lo-fi-hip-hop').tempo < of(songs, 'chiptune').tempo,
  );
  const mix = (g: string) => of(GENRES, g).mix ?? {};
  assert.ok(
    (mix('gospel').reverb ?? 0) > 1 && (mix('funk').reverb ?? 1) < 0.5 && (mix('reggae').delay ?? 0) > 2,
  );
  // their own forms: jazz solos between heads, reggae's dub is drums and bass, a film score adds a layer each section
  const types = (g: string): string[] => of(songs, g).sections.map((s) => s.type);
  assert.ok(
    types('jazz').includes('solo') &&
      types('gospel').at(-2) === 'vamp' &&
      types('celtic').join().includes('A,A,B,B'),
  );
  const playing = (score: Score, type: string): string[] => {
    const s = score.sections.find((x) => x.type === type);
    assert.ok(s, `no ${type}`);
    return score.tracks
      .filter((t) => t.notes.some((n) => n.beat >= s.beat && n.beat < s.beat + s.beats))
      .map((t) => t.role)
      .sort();
  };
  assert.deepEqual(playing(of(songs, 'reggae'), 'dub'), ['bass', 'drums']);
  const film = ['A', 'B', 'C', 'E'].map((t) => playing(of(songs, 'cinematic'), t).length);
  assert.ok(
    film.every((n, i) => !i || n >= at(film, i - 1)) && at(film, -1) > at(film, 0),
    `film layers ${film}`,
  );
  const edm = of(songs, 'edm');
  assert.ok(
    !playing(edm, 'build').includes('bass') && playing(edm, 'drop').includes('bass'),
    'the drop brings the bass',
  );
  // and their own ornaments: celtic rolls and cuts
  const lead = of(songs, 'celtic').tracks.find((t) => t.role === 'lead');
  assert.ok(lead && lead.notes.filter((n) => n.ornament).length > 10);
});
