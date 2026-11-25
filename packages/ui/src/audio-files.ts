// A project's audio tracks' files (Chordinal PRD §16.4): kept in its audio/ folder through the project store, as
// samples are in samples/, and read back as audio once each for Play, an export and the lanes' waveforms.
import { signal } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { place } from './place.ts';
import { projectFiles } from './project-files.ts';

/** why a file past the browser's limit isn't kept */
export const AUDIO_TOO_BIG = (mb: number): string =>
  `over ${mb} MB, more than the browser keeps for an audio track; the desktop app takes it`;

/** the project's audio/ folder */
export const audioFiles = projectFiles({
  what: 'audio files',
  read: (name, file) => place.files.readAudio(name, file),
  write: (name, file, bytes) => place.files.writeAudio(name, file, bytes),
  limit: () => {
    const bytes = place.files.audioLimit;
    return bytes === undefined ? undefined : { bytes, why: AUDIO_TOO_BIG(bytes / 1024 / 1024) };
  },
});

/** counts files read as audio, so the lanes draw their waveforms once they're in */
export const audioRead: Signal<number> = signal(0);
