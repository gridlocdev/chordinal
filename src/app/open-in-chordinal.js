// Open in Chordinal (Chordinal PRD §9.2): the song is saved first if it has changes or was never saved, then the desktop
// app copies its folder into Documents/Chordinal/ and opens it in Chordinal, or shows the folder when it can't.
import { appMenu } from '../platform/app-menu.js';
import { project, projectName, dirty, status } from '../ui/store.js';
import { save } from '../ui/document.js';

/** the folder's last part: '/Users/me/Documents/Chordinal/Night Drive 2' → 'Night Drive 2' */
const lastPart = (dir)=> String(dir).split(/[\\/]/).filter(Boolean).at(-1) ?? '';

export async function openInChordinal()
{
    if ((dirty.value || !projectName.value) && !await save()) return;
    try
    {
        const { dir, opened } = await appMenu.openInChordinal(projectName.value);
        status.value = opened ? `Opened “${project.value.title}” in Chordinal, as Documents/Chordinal/${lastPart(dir)}`
            : `Saved “${project.value.title}” in Documents/Chordinal/${lastPart(dir)}: Chordinal isn't installed`;
    }
    catch (e) { status.value = `Couldn't open “${project.value.title}” in Chordinal: ${e.message}`; }
}
