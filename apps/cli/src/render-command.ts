// chordinal render: renders a game's soundtrack. Each track of a songs file is composed here in Node, its project
// played offline in the hidden render browser as the app's Export as Audio File plays it, then cut to its loop, its
// seam crossfaded and its loudness set here, and encoded to <folder>/<id>.mp3 by ffmpeg. Then every mp3 is decoded
// as the browser decodes it, to check it still lines up with the render, so the loop points land where they should.
// --data writes the game's tracks-data file: where the beats, loop and bar lines fall in each file.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compose, toProject } from '@chordinal/composer';
import { writeProject } from '@chordinal/daw';
import { parseArgs, UsageError } from './args.ts';
import { openBrowser } from './browser.ts';
import { encodeMp3, libraryOption, needFfmpeg, secondsSince } from './command.ts';
import type { Command } from './command.ts';
import { soundtrackOf } from './songs-file.ts';
import type { SoundtrackTrack } from './songs-file.ts';
import {
  TAIL,
  checkLoop,
  timingOf,
  cutRender,
  crossfadeSeam,
  loudnessGainDb,
  wav32,
  decodeWindow,
  lagOf,
  decodeProblem,
  WINDOW,
} from './soundtrack.ts';
import { readTracksData, writeTracksData } from './tracks-data.ts';
import type { TrackInfo } from './tracks-data.ts';

const BITRATE = '160k';
const RATE = 44100; // every track at one rate, whatever the machine's sound device runs at

/** a track's mp3 as the tracks-data file names it: relative to the current folder, with `/` */
export const fileFor = (folder: string, id: string, cwd = process.cwd()): string =>
  path
    .relative(cwd, path.resolve(cwd, folder, `${id}.mp3`))
    .split(path.sep)
    .join('/');

/** the tracks to render: those named, or all; an unknown name is a UsageError */
export function pickTracks(tracks: readonly SoundtrackTrack[], ids: readonly string[]): SoundtrackTrack[] {
  const unknown = ids.filter((id) => !tracks.some((t) => t.id === id));
  if (unknown.length)
    throw new UsageError(
      `no track ${unknown.join(', ')}; the tracks are ${tracks.map((t) => t.id).join(', ')}`,
    );
  return ids.length ? tracks.filter((t) => ids.includes(t.id)) : [...tracks];
}

/** a rendered track: what the data file gets, and its left channel as encoded, for the decode check */
interface Done {
  info: TrackInfo;
  mp3: string;
  left: Float32Array;
}

const signed = (n: number): string => `${n >= 0 ? '+' : ''}${n}`;

export const renderCommand: Command = {
  name: 'render',
  summary: "render a game's soundtrack (a songs file) to mp3s, and its tracks-data file",
  usage: '<songs.js> <folder> [track id…] [--data <tracks-data.js>] [--bitrate 160k] [--library <id>]',
  options: { data: 'value', bitrate: 'value', library: 'value' },
  help: [
    "Renders a game's soundtrack to <folder>/<id>.mp3, one file per track of the songs file, or only the tracks named.",
    'The songs file is a module whose TRACKS lists them: { id, spec, loop?, trim?, shape?, ...extra }, with spec a',
    'song spec for the composer, loop the sections a looping track repeats as [first, end) indexes into its form (the',
    'section at end must be the same type as the one at first), trim to start the file at the loop, and shape(score)',
    'to change the composed notes before they are played. Every track is brought to the same loudness, a looping one',
    "is cut just after its loop's end with its seam crossfaded, and each mp3 is checked to decode in step with its render.",
    '',
    '  --data <file>     write the tracks-data file the game reads: export const TRACKS = { <id>: { file, title, tempo,',
    '                    beatsPerBar, offset, end, seconds, frames, rate, loop, bars?, ...extra } }, keeping entries',
    '                    for tracks not rendered this time',
    "  --bitrate <rate>  the mp3s' bitrate (160k without it)",
    "  --library <id>    the SoundFont library to play on (the app's default without it)",
    '',
    'Needs ffmpeg ($FFMPEG, or ffmpeg on the PATH).',
  ].join('\n'),
  async run(argv) {
    const args = parseArgs(argv, this.options);
    const [songsFile, folder, ...ids] = args.positional;
    if (!songsFile || !folder) throw new UsageError('name the songs file and the folder the mp3s go in');
    const library = libraryOption(args.values.library);
    const bitrate = args.values.bitrate ?? BITRATE;
    const dataFile = args.values.data;
    needFfmpeg('render');

    const all = soundtrackOf(await import(pathToFileURL(path.resolve(songsFile)).href), songsFile);
    const todo = pickTracks(all, ids);
    fs.mkdirSync(folder, { recursive: true });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chordinal-render-'));
    const browser = await openBrowser({ library, rate: RATE });
    const done = new Map<string, Done>();
    try {
      for (const track of todo) {
        const started = Date.now();
        // composed here: the composer is pure. The page only plays the project
        const score = compose(track.spec);
        track.shape?.(score);
        if (track.loop) checkLoop(track.id, score, track.loop);
        const timing = timingOf(score, track.loop, track.trim);
        const project = writeProject({ ...toProject(score), loop: null });
        const { channels, rate, leadIn } = await browser.play(project, score.beats, TAIL);

        const chans = cutRender(channels, rate, leadIn, timing);
        if (timing.loop) crossfadeSeam(chans, rate, timing.loop);
        const gainDb = loudnessGainDb(chans);
        const gain = 10 ** (gainDb / 20);
        const wav = path.join(tmp, `${track.id}.wav`),
          mp3 = path.join(folder, `${track.id}.mp3`);
        fs.writeFileSync(wav, wav32(chans, rate, gain));
        encodeMp3(wav, mp3, bitrate);
        const frames = chans[0]?.length ?? 0;
        const info: TrackInfo = {
          title: score.title,
          tempo: score.tempo,
          beatsPerBar: score.beatsPerBar,
          offset: timing.offset,
          end: timing.end,
          seconds: frames / rate,
          frames,
          rate,
          loop: timing.loop,
          bars: timing.bars,
        };
        const left = (chans[0] ?? new Float32Array()).map((v) => v * gain);
        done.set(track.id, { info, mp3, left });
        console.log(
          `${track.id}: "${score.title}", ${info.seconds.toFixed(1)} s in ${secondsSince(started)}, gain ${gainDb.toFixed(1)} dB, ${(fs.statSync(mp3).size / 1e6).toFixed(2)} MB`,
        );
      }

      // decode each file as the browser does and line it up with what was rendered
      for (const [id, { info, mp3, left }] of done) {
        const { onset, from, count } = decodeWindow(left);
        const got = await browser.decode(mp3, info.rate, from, count);
        const shift = lagOf(left.subarray(onset, onset + WINDOW), got.part, onset - from),
          longer = got.frames - info.frames;
        console.log(
          `${id}: decodes ${got.frames} frames (${signed(longer)}), first sound ${signed(shift)} frames from where it was rendered`,
        );
        const problem = decodeProblem(shift, longer);
        if (problem)
          throw new Error(
            `${id}.mp3 doesn't decode in step with its render (${problem}); its loop points would drift`,
          );
      }
    } finally {
      await browser.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }

    if (dataFile) {
      const old = fs.existsSync(dataFile)
        ? readTracksData(fs.readFileSync(dataFile, 'utf8'))
        : new Map<string, TrackInfo>();
      const fresh = new Map([...done].map(([id, d]) => [id, d.info]));
      fs.mkdirSync(path.dirname(path.resolve(dataFile)), { recursive: true });
      fs.writeFileSync(
        dataFile,
        writeTracksData(all, fresh, old, (id) => fileFor(folder, id)),
      );
      console.log(`wrote ${dataFile}`);
    }
  },
};
