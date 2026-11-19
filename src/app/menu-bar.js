// Music Generator's menu bar: its File menu (the projects in projects/) and Help, around the menus both apps share.
import { projectName, projectList } from '../ui/store.js';
import { openProject, watchProjects } from '../ui/document.js';
import { item } from '../ui/commands.js';
import { editMenu, trackMenu, transportMenu, viewMenu, startMenus } from '../ui/menu-bar.js';

function menuBar()
{
    const open = projectList.value.map(x => ({ label: x.title, radio: true, checked: x.name === projectName.value, run: ()=> openProject(x.name) }));
    return [
        { label: 'File', submenu: [item('new'), item('open'), { label: 'Open Project', submenu: open.length ? open : [{ label: 'No projects', enabled: false }] }, '-',
            item('save'), item('saveAs'), item('revert'), '-', item('importMidi'), item('exportAudio'), item('exportMidi'), item('reveal')] },
        editMenu(),
        trackMenu(),
        transportMenu(['-', item('newFromMelody')]),
        viewMenu([item('browser'), '-']),
        { label: 'Help', submenu: [item('composing'), item('readme')] },
    ];
}

/** the menu bar, kept current, and projects/ listed as it changes */
export function startMusicGeneratorMenus()
{
    startMenus(menuBar);
    watchProjects();
}
