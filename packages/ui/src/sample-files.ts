// A project's sample files (Chordinal PRD §14): kept in its samples/ folder through the project store, under the name
// they were dropped with, and read back as audio once each for Play, an export and musical typing. A project not saved
// yet keeps them here until its first save writes them.
import { SAMPLE_FILE } from '@chordinal/audio';
import { decodeSample, type SampleReader } from '@chordinal/playback';
import { place } from './place.ts';
import { notify, projectName } from './store.ts';
import { errorText } from './errors.ts';

const unsaved = new Map<string, Uint8Array>(); // samples of a project not saved yet, by file name
const decoded = new Map<string, Promise<AudioBuffer | null>>(); // project name and file → its audio

/** a name the store keeps: the dropped file's, with anything outside letters, digits, spaces, dots and dashes made a dash */
export function sampleName(dropped: string): string {
  const ext = SAMPLE_FILE.exec(dropped)?.[0] ?? '.wav';
  const stem = dropped.slice(0, dropped.length - ext.length).replace(/[^\w .-]/g, '-');
  return `${/^\w/.test(stem) ? stem : `sample${stem}`}${ext}`;
}

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/** what's kept under `file`, or null */
async function keptBytes(name: string, file: string): Promise<Uint8Array | null> {
  if (!name) return unsaved.get(file) ?? null;
  return place.files.readSample(name, file).then(
    (b) => new Uint8Array(b),
    () => null,
  );
}

/** keeps a sample's bytes with the project and resolves to the file name it's under: the dropped name, or the same
 * name with a number when another file has it */
export async function keepSample(dropped: string, bytes: Uint8Array): Promise<string> {
  const name = projectName.value;
  const base = sampleName(dropped);
  const ext = SAMPLE_FILE.exec(base)?.[0] ?? '';
  const stem = base.slice(0, base.length - ext.length);
  for (let n = 1; ; n++) {
    const file = n === 1 ? base : `${stem} ${n}${ext}`;
    const there = await keptBytes(name, file);
    if (there && same(there, bytes)) return file;
    if (there) continue;
    if (name) await place.files.writeSample(name, file, bytes);
    else unsaved.set(file, bytes);
    decoded.delete(`${name}\n${file}`);
    return file;
  }
}

/** drops the samples kept for a project not saved yet, when another project takes the window */
export const forgetUnsavedSamples = (): void => unsaved.clear();

/** writes the samples kept for a project not saved yet into the place it was first saved */
export async function writeUnsavedSamples(name: string): Promise<void> {
  try {
    for (const [file, bytes] of unsaved) await place.files.writeSample(name, file, bytes);
    unsaved.clear();
  } catch (e) {
    notify(`Saved ${place.where(name)}, but couldn't keep its samples: ${errorText(e)}`, 'error');
  }
}

/** reads the open project's samples as audio, each once */
export const readSample: SampleReader = (file) => {
  const name = projectName.value;
  const id = `${name}\n${file}`;
  let audio = decoded.get(id);
  if (!audio) {
    audio = keptBytes(name, file).then((b) => (b ? decodeSample(b.slice().buffer) : null));
    audio.catch(() => decoded.delete(id));
    decoded.set(id, audio);
  }
  return audio;
};
