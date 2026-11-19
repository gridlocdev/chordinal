// Chordinal's menu bar: its File menu (§4: New, Open…, Open Recent, Save, Save As…), Track ▸ Generate Part… (§8) and
// Help, around the menus both apps share.
import { projectName } from '../ui/store.js';
import { item, busy } from '../ui/commands.js';
import { editMenu, trackMenu, transportMenu, viewMenu, startMenus } from '../ui/menu-bar.js';
import { recent, newSong, openFolder, openRecent, clearRecent, revealProject } from './files.js';
import { openGenerate } from './generate.js';

/** an item of this app's own, waiting while a dialog is open as the shared commands do */
const own = (id, label, run, more = {})=> ({ id, label, ...more, run: ()=> { if (!busy()) run(); } });

function fileMenu()
{
    const list = recent.value.map(r => own(`recent:${r.path}`, r.name, ()=> openRecent(r.path), { enabled: r.exists }));
    return { label: 'File', submenu: [
        own('new', 'New', newSong, { accelerator: 'CmdOrCtrl+N' }),
        own('open', 'Open…', openFolder, { accelerator: 'CmdOrCtrl+O' }),
        { label: 'Open Recent', submenu: [...(list.length ? list : [{ label: 'No Recent Projects', enabled: false }]), '-',
            own('clearRecent', 'Clear Menu', clearRecent, { enabled: list.length > 0 })] },
        '-', item('save'), item('saveAs'), item('revert'), '-',
        item('importMidi'), item('exportAudio'), item('exportMidi'),
        own('reveal', 'Show in Finder', revealProject, { enabled: !!projectName.value }),
    ] };
}

function menuBar()
{
    const generate = own('generatePart', 'Generate Part…', ()=> openGenerate());
    return [fileMenu(), editMenu(), trackMenu([generate]), transportMenu(), viewMenu(), { label: 'Help', submenu: [item('readme')] }];
}

export const startChordinalMenus = ()=> startMenus(menuBar);
