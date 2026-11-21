// The SoundFont libraries: the one picked, falling back to one that's installed, and downloading the others.
import { soundfontLibrary } from '@chordinal/audio';
import { soundfonts } from './platform/soundfonts.ts';
import { settings, setSettings, installedLibraries, libraryDownload, notify } from './store.ts';
import { reload } from './player.ts';
import { errorText } from './errors.ts';

/** plays the picked library, or the first installed one while it isn't installed */
function pick(): void {
  const have = installedLibraries.value;
  const want = settings.value.library || (soundfontLibrary.all[0]?.id ?? '');
  soundfontLibrary.select(have.includes(want) ? want : (have[0] ?? want));
}

/** finds which libraries are installed */
export async function checkLibraries(): Promise<void> {
  installedLibraries.value = (await soundfonts.installed()) ?? soundfontLibrary.all.map((l) => l.id);
  pick();
}

/** switches to an installed library */
export function chooseLibrary(id: string): void {
  setSettings({ library: id });
  pick();
  reload();
}

/** downloads a library, then switches to it */
export async function downloadLibrary(id: string): Promise<void> {
  if (libraryDownload.value) return;
  const name = soundfontLibrary.all.find((l) => l.id === id)?.name ?? id;
  libraryDownload.value = { id, fraction: 0 };
  try {
    await soundfonts.download(id, (loaded, total) => {
      libraryDownload.value = { id, fraction: loaded / total };
    });
    await checkLibraries();
    chooseLibrary(id);
    notify(`Downloaded ${name}`);
  } catch (e) {
    console.error(e);
    notify(`Could not download ${name}: ${errorText(e)}`, 'error');
  } finally {
    libraryDownload.value = null;
  }
}
