// MIDI files in: File → Import MIDI File opens one as a new project; one dropped on the arrangement adds its tracks to
// this project from the bar it was dropped on, as one undo step.
import { midiProject, addMidiTracks } from '@chordinal/daw';
import { readMidi } from '@chordinal/lib';
import { appMenu } from './platform/app-menu.ts';
import { project, selected, notify } from './store.ts';
import { edit, openNew } from './document.ts';
import { errorText } from './errors.ts';

export const isMidi = (file: { name: string }): boolean => /\.(mid|midi|smf)$/i.test(file.name);

/** asks for a MIDI file and opens it as a new project */
export async function importMidi(): Promise<void> {
  const file = await appMenu.openFile('MIDI File', ['mid', 'midi', 'smf']);
  if (!file) return;
  try {
    const p = midiProject(new Uint8Array(file.bytes), file.name.replace(/\.[^.]+$/, ''));
    if (await openNew(p))
      notify(`Imported ${file.name}: ${p.tracks.length} track${p.tracks.length === 1 ? '' : 's'}`);
  } catch (e) {
    notify(`Couldn't import ${file.name}: ${errorText(e)}`, 'error');
  }
}

/** MIDI files dropped at beat `at`: their tracks added from that bar */
export async function dropMidi(files: Iterable<File>, at: number): Promise<void> {
  for (const file of files) {
    try {
      const midi = readMidi(new Uint8Array(await file.arrayBuffer()));
      if (!midi.tracks.length) {
        notify(`${file.name} has no notes`);
        continue;
      }
      const before = project.value.tracks.length;
      edit((p) => addMidiTracks(p, midi, at));
      selected.value = project.value.tracks[before]?.id ?? selected.value;
      notify(`Added ${midi.tracks.length} track${midi.tracks.length === 1 ? '' : 's'} from ${file.name}`);
    } catch (e) {
      notify(`Couldn't read ${file.name}: ${errorText(e)}`, 'error');
    }
  }
}
