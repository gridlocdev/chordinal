// chordinal export: exports project folders to <name>.mid and <name>.wav, as the app's Export as MIDI and Export as
// Audio File make them with their defaults (the whole project, the mix, a 3 s tail, not normalized), and with --mp3
// an MP3 too. The MIDI is written in Node; the WAV is rendered in the hidden render browser (browser.ts).
import fs from 'node:fs';
import path from 'node:path';
import { readProject, projectMidi } from '@chordinal/daw';
import { encodeWavChannels } from '@chordinal/lib';
import { parseArgs, UsageError } from './args.ts';
import { openBrowser } from './browser.ts';
import { encodeMp3, libraryOption, needFfmpeg, secondsSince } from './command.ts';
import type { Command } from './command.ts';

const TAIL = 3; // seconds after the last beat, for reverb and release, as the app exports
const MP3_BITRATE = '320k';

/** each folder's project file and the name its exports take (the folder's name); two of one name is a UsageError */
export function exportsOf(folders: readonly string[]): { name: string; file: string }[] {
  const seen = new Set<string>();
  return folders.map((folder) => {
    const file = path.join(folder, 'project.json');
    if (!fs.existsSync(file))
      throw new UsageError(`${folder} isn't a project folder: it has no project.json`);
    const name = path.basename(path.resolve(folder));
    if (seen.has(name))
      throw new UsageError(`two projects are named ${name}, and their exports would overwrite each other`);
    seen.add(name);
    return { name, file };
  });
}

export const exportCommand: Command = {
  name: 'export',
  summary: 'export project folders to MIDI and WAV (and MP3), as the app exports them',
  usage: '<project folder…> [--out <dir>] [--mp3] [--library <id>]',
  options: { out: 'value', mp3: 'flag', library: 'value' },
  help: [
    "Exports each project folder to <out>/<folder's name>.mid and .wav, as the app's Export as MIDI and Export as",
    'Audio File make them: the whole project, the mix, a 3 s tail, not normalized. The WAV is rendered offline in a',
    'hidden window.',
    '',
    '  --out <dir>       where the files go (the current folder without it)',
    '  --mp3             an MP3 too, at 320 kbps (needs ffmpeg: $FFMPEG, or ffmpeg on the PATH)',
    "  --library <id>    the SoundFont library to play on (the app's default without it)",
  ].join('\n'),
  async run(argv) {
    const args = parseArgs(argv, this.options);
    if (!args.positional.length) throw new UsageError('name one or more project folders');
    const songs = exportsOf(args.positional);
    const library = libraryOption(args.values.library);
    const mp3 = args.flags.has('mp3');
    if (mp3) needFfmpeg('--mp3');
    const out = args.values.out ?? '.';
    fs.mkdirSync(out, { recursive: true });

    // MIDI, here
    const texts = songs.map(({ name, file }) => {
      const text = fs.readFileSync(file, 'utf8');
      fs.writeFileSync(path.join(out, `${name}.mid`), projectMidi(readProject(text)));
      return text;
    });
    console.log(`MIDI: ${songs.length} file${songs.length > 1 ? 's' : ''}`);

    // WAV, in the browser
    const started = Date.now();
    const browser = await openBrowser({ library, rate: null });
    let failed = 0;
    try {
      for (const [i, { name }] of songs.entries()) {
        try {
          const { channels, rate, leadIn } = await browser.play(texts[i]!, null, TAIL);
          const skip = Math.round(leadIn * rate);
          const wav = path.join(out, `${name}.wav`);
          fs.writeFileSync(
            wav,
            encodeWavChannels(
              channels.map((c) => c.slice(skip)),
              rate,
            ),
          );
          if (mp3) encodeMp3(wav, path.join(out, `${name}.mp3`), MP3_BITRATE);
          console.log(`${i + 1}/${songs.length} ${name} (${secondsSince(started)})`);
        } catch (e) {
          failed++;
          console.error(`${name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } finally {
      await browser.close();
    }
    console.log(
      `Exported to ${path.relative(process.cwd(), out) || '.'}/${failed ? `; ${failed} failed` : ''}`,
    );
    if (failed) process.exitCode = 1;
  },
};
