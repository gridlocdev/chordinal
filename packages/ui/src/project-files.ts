// A project's audio files in one of its folders (samples/, PRD §14.3, or audio/, PRD §16.4): kept through the project
// store under the name they were dropped with, and read back as audio once each. A project not saved yet keeps them
// here until its first save writes them.
import { SAMPLE_FILE } from '@chordinal/audio';
import { decodeSample, type SampleReader } from '@chordinal/playback';
import { notify, projectName } from './store.ts';
import { errorText } from './errors.ts';
import { place } from './place.ts';

/** what a folder of the project store offers */
export interface FolderAccess {
  /** what the files are called in a notice: "samples", "audio files" */
  what: string;
  read(name: string, file: string): Promise<ArrayBuffer>;
  write(name: string, file: string, bytes: Uint8Array): Promise<void>;
  /** the largest file the store keeps, if it has a limit, and why one past it isn't kept */
  limit(): { bytes: number; why: string } | undefined;
}

/** a project folder's files: kept, read as audio, and written when a project not saved yet is first saved */
export interface ProjectFiles {
  keep(dropped: string, bytes: Uint8Array): Promise<string>;
  read: SampleReader;
  /** the decoded audio of a file read already, or undefined */
  decoded(file: string): AudioBuffer | null | undefined;
  forgetUnsaved(): void;
  writeUnsaved(name: string): Promise<void>;
}

/** a name the store keeps: the dropped file's, with anything outside letters, digits, spaces, dots and dashes made a dash */
export function sampleName(dropped: string): string {
  const ext = SAMPLE_FILE.exec(dropped)?.[0] ?? '.wav';
  const stem = dropped.slice(0, dropped.length - ext.length).replace(/[^\w .-]/g, '-');
  return `${/^\w/.test(stem) ? stem : `sample${stem}`}${ext}`;
}

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

export function projectFiles(folder: FolderAccess): ProjectFiles {
  const unsaved = new Map<string, Uint8Array>(); // files of a project not saved yet, by file name
  const decoding = new Map<string, Promise<AudioBuffer | null>>(); // project name and file → its audio
  const done = new Map<string, AudioBuffer | null>();

  /** what's kept under `file`, or null */
  const keptBytes = async (name: string, file: string): Promise<Uint8Array | null> => {
    if (!name) return unsaved.get(file) ?? null;
    return folder.read(name, file).then(
      (b) => new Uint8Array(b),
      () => null,
    );
  };

  return {
    /** keeps a file's bytes with the project and resolves to the name it's under: the dropped name, or the same
     * name with a number when another file has it */
    async keep(dropped, bytes) {
      const limit = folder.limit();
      if (limit && bytes.length > limit.bytes) throw new Error(limit.why);
      const name = projectName.value;
      const base = sampleName(dropped);
      const ext = SAMPLE_FILE.exec(base)?.[0] ?? '';
      const stem = base.slice(0, base.length - ext.length);
      for (let n = 1; ; n++) {
        const file = n === 1 ? base : `${stem} ${n}${ext}`;
        const there = await keptBytes(name, file);
        if (there && same(there, bytes)) return file;
        if (there) continue;
        if (name) await folder.write(name, file, bytes);
        else unsaved.set(file, bytes);
        decoding.delete(`${name}\n${file}`);
        done.delete(`${name}\n${file}`);
        return file;
      }
    },
    read(file) {
      const name = projectName.value;
      const id = `${name}\n${file}`;
      let audio = decoding.get(id);
      if (!audio) {
        audio = keptBytes(name, file).then((b) => (b ? decodeSample(b.slice().buffer) : null));
        audio.then(
          (a) => done.set(id, a),
          () => decoding.delete(id),
        );
        decoding.set(id, audio);
      }
      return audio;
    },
    decoded: (file) => done.get(`${projectName.value}\n${file}`),
    forgetUnsaved: () => unsaved.clear(),
    async writeUnsaved(name) {
      try {
        for (const [file, bytes] of unsaved) await folder.write(name, file, bytes);
        unsaved.clear();
      } catch (e) {
        notify(`Saved ${place.where(name)}, but couldn't keep its ${folder.what}: ${errorText(e)}`, 'error');
      }
    },
  };
}
