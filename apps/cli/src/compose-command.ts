// chordinal compose: composes a song in Node and prints its plan; optionally its melody bar by bar, a Standard MIDI
// File, and the song as a project folder that opens in the app.
import fs from 'node:fs';
import path from 'node:path';
import {
  compose,
  describe,
  barAt,
  swungTracks,
  toProject,
  METERS,
  EMOTIONS,
  SONGS,
  GENRE_SONGS,
  GAME_SONGS,
  CHIP_SONGS,
  CLASSICAL_SONGS,
} from '@chordinal/composer';
import type { Score, SongSpec, WrittenSong } from '@chordinal/composer';
import { writeProject } from '@chordinal/daw';
import { writeMidi, tempoSteps, noteName } from '@chordinal/lib';
import { parseArgs, UsageError } from './args.ts';
import type { Command } from './command.ts';

const ALL_SONGS: WrittenSong[] = [...GAME_SONGS, ...CHIP_SONGS, ...CLASSICAL_SONGS, ...GENRE_SONGS, ...SONGS];

/** a parsed spec file: an object, whose fields the composer reads (and defaults) itself */
const isSpec = (v: unknown): v is SongSpec => typeof v === 'object' && v !== null && !Array.isArray(v);

/** the spec `what` names: a song id, `feel:<emotion>` or a spec file in JSON */
export function specOf(what: string): SongSpec {
  if (what.endsWith('.json')) {
    const parsed: unknown = JSON.parse(fs.readFileSync(what, 'utf8'));
    if (!isSpec(parsed)) throw new UsageError(`${what} isn't a song spec (a JSON object)`);
    return parsed;
  }
  if (what.startsWith('feel:')) {
    const emotion = what.slice(5);
    if (!(emotion in EMOTIONS))
      throw new UsageError(`no feeling ${emotion}; the feelings are ${Object.keys(EMOTIONS).join(', ')}`);
    return { title: emotion, emotion };
  }
  const song = ALL_SONGS.find((s) => s.id === what);
  if (!song) throw new UsageError(`no song ${what}; \`chordinal compose --help\` lists them`);
  return song;
}

/** the lead line, bar by bar, as note names and lengths in beats */
function melodyLines(score: Score): string[] {
  const lead = score.tracks.find((t) => t.role === 'lead');
  const bars = new Map<number, string[]>();
  for (const n of lead?.notes ?? []) {
    const bar = barAt(score.sections, n.beat).bar + 1;
    bars.set(bar, [...(bars.get(bar) ?? []), `${noteName(n.key)}:${+n.beats.toFixed(2)}`]);
  }
  return [...bars].map(([bar, notes]) => `  bar ${String(bar).padStart(3)}  ${notes.join(' ')}`);
}

/** the score as a Standard MIDI File: the notes as they're heard (swung, when the song swings) */
function midiOf(score: Score): Uint8Array {
  // drums go on channel 10 (index 9); the other parts take the rest in order
  const melodic = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
  let next = 0;
  const tracks = swungTracks(score).map((t) => ({
    name: t.name,
    program: t.program,
    notes: t.notes,
    channel: t.bank >= 127 ? 9 : (melodic[next++ % melodic.length] ?? 0),
  }));
  // tempo ramps as a change per beat; a time signature at each change of meter
  const meters = score.sections
    .filter((s, i) => s.meter !== score.sections[i - 1]?.meter)
    .map((s) => {
      const [num = s.beatsPerBar, den = 4] = METERS[s.meter]?.sig ?? [];
      return { beat: s.beat, num, den };
    });
  return writeMidi({ ...score, tracks, tempos: tempoSteps(score.tempoMap), meters });
}

export const composeCommand: Command = {
  name: 'compose',
  summary: 'compose a song: print its plan, and optionally its melody, a .mid file and a project folder',
  usage: '<song-id | feel:<emotion> | spec.json> [--midi out.mid] [--melody] [--project <folder>]',
  options: { midi: 'value', melody: 'flag', project: 'value' },
  get help(): string {
    return [
      'Composes a song in Node, from one of the written songs (by id), a feeling, or a song spec in a JSON file, and',
      'prints its plan.',
      '',
      '  --melody            also print the lead line bar by bar, as note names, to read a melody without hearing it',
      '  --midi <file>       write a Standard MIDI File',
      '  --project <folder>  write the song as a project folder (project.json), which opens in the app',
      '',
      `songs: ${ALL_SONGS.map((s) => s.id).join(', ')}`,
      `feelings: ${Object.keys(EMOTIONS)
        .map((e) => `feel:${e}`)
        .join(', ')}`,
    ].join('\n');
  },
  async run(argv) {
    const args = parseArgs(argv, this.options);
    const [what, ...extra] = args.positional;
    if (!what) throw new UsageError('name a song, a feeling or a spec file');
    if (extra.length) throw new UsageError(`one song at a time (and ${extra.join(' ')})`);
    const score = compose(specOf(what));
    console.log(describe(score));
    if (args.flags.has('melody')) for (const line of melodyLines(score)) console.log(line);

    const midi = args.values.midi;
    if (midi) {
      fs.writeFileSync(midi, midiOf(score));
      console.log(`wrote ${midi}`);
    }
    const folder = args.values.project;
    if (folder) {
      fs.mkdirSync(folder, { recursive: true });
      const file = path.join(folder, 'project.json');
      fs.writeFileSync(file, writeProject(toProject(score)));
      console.log(`wrote ${file}`);
    }
  },
};
