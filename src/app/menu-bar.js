// Music Generator's menu bar (Chordinal PRD §9): File (New…, the songs in projects/, saving, Open in Chordinal and
// exporting), the text-field Edit menu, Transport, View and Help. Editing a song is Chordinal's, so the shared Edit and
// Track menus aren't here.
import { projectName, projectList } from '../ui/store.js';
import { openProject, watchProjects } from '../ui/document.js';
import { item, busy } from '../ui/commands.js';
import { startMenus } from '../ui/menu-bar.js';
import { openInChordinal } from './open-in-chordinal.js';

function menuBar()
{
    const open = projectList.value.map(x => ({ label: x.title, radio: true, checked: x.name === projectName.value, run: ()=> openProject(x.name) }));
    return [
        { label: 'File', submenu: [item('new'), { label: 'Open Song', submenu: open.length ? open : [{ label: 'No songs', enabled: false }] }, '-',
            item('save'), item('saveAs'), item('revert'), '-',
            { id: 'openInChordinal', label: 'Open in Chordinal', run: ()=> { if (!busy()) openInChordinal(); } }, '-',
            item('exportAudio'), item('exportMidi'), item('reveal')] },
        { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, '-', { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
        { label: 'Transport', submenu: [item('play'), item('start'), '-', item('metronome')] },
        { label: 'View', submenu: [{ role: 'togglefullscreen' }, '-', { label: 'Developer', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }] }] },
        { label: 'Help', submenu: [item('composing'), item('readme')] },
    ];
}

/** the menu bar, kept current, and projects/ listed as it changes */
export function startMusicGeneratorMenus()
{
    startMenus(menuBar);
    watchProjects();
}
