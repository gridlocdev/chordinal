// What every command has, and what several share: the SoundFont library option and ffmpeg.
import { execFileSync } from 'node:child_process';
import { LIBRARIES } from '@chordinal/audio';
import { UsageError } from './args.ts';
import type { OptionKinds } from './args.ts';

export interface Command {
  name: string;
  /** one line for `chordinal help` */
  summary: string;
  /** the arguments it takes, after its name */
  usage: string;
  /** what `chordinal <command> --help` prints under the usage */
  help: string;
  options: OptionKinds;
  /** runs it with its arguments (after its name), from the current folder */
  run(argv: readonly string[]): Promise<void>;
}

/** the SoundFont library `id` names, checked; null (the app's default) without one */
export function libraryOption(id: string | undefined): string | null {
  if (id === undefined) return null;
  if (!LIBRARIES.some((l) => l.id === id))
    throw new UsageError(
      `no SoundFont library ${id}; the libraries are ${LIBRARIES.map((l) => l.id).join(', ')}`,
    );
  return id;
}

/** ffmpeg: $FFMPEG, or ffmpeg on the PATH */
export const ffmpeg = (): string => process.env.FFMPEG || 'ffmpeg';

/** fails clearly when ffmpeg isn't there; `why` says what needs it */
export function needFfmpeg(why: string): void {
  try {
    execFileSync(ffmpeg(), ['-version'], { stdio: 'ignore' });
  } catch {
    throw new Error(
      `${why} needs ffmpeg, and there is no ${ffmpeg()}: install it (brew install ffmpeg) or set FFMPEG to its path`,
    );
  }
}

/** encodes a WAV file to an mp3 at `bitrate` */
export function encodeMp3(wav: string, mp3: string, bitrate: string): void {
  execFileSync(ffmpeg(), ['-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', bitrate, mp3]);
}

/** a duration since `started` (ms), as whole seconds */
export const secondsSince = (started: number): string => `${((Date.now() - started) / 1000).toFixed(0)} s`;
