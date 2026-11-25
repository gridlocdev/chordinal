// A project's sample files (Chordinal PRD §14): kept in its samples/ folder through the project store, under the name
// they were dropped with, and read back as audio once each for Play, an export and musical typing. A project not saved
// yet keeps them here until its first save writes them.
import type { SampleReader } from '@chordinal/playback';
import { place } from './place.ts';
import { projectFiles } from './project-files.ts';
import { TOO_BIG } from './store/browser-store.ts';

export { sampleName } from './project-files.ts';

const samples = projectFiles({
  what: 'samples',
  read: (name, file) => place.files.readSample(name, file),
  write: (name, file, bytes) => place.files.writeSample(name, file, bytes),
  limit: () => {
    const bytes = place.files.sampleLimit;
    return bytes === undefined ? undefined : { bytes, why: TOO_BIG };
  },
});

/** keeps a sample's bytes with the project and resolves to the file name it's under: the dropped name, or the same
 * name with a number when another file has it */
export const keepSample = (dropped: string, bytes: Uint8Array): Promise<string> =>
  samples.keep(dropped, bytes);

/** drops the samples kept for a project not saved yet, when another project takes the window */
export const forgetUnsavedSamples = (): void => samples.forgetUnsaved();

/** writes the samples kept for a project not saved yet into the place it was first saved */
export const writeUnsavedSamples = (name: string): Promise<void> => samples.writeUnsaved(name);

/** reads the open project's samples as audio, each once */
export const readSample: SampleReader = (file) => samples.read(file);
