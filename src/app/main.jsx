// Music Generator (Chordinal PRD §9): writes songs and plays them. Loads the settings, opens the last song, and lays
// out the window: the player across the top, the songs in projects/ at the left, and the open song. Editing a song is
// Chordinal's: Open in Chordinal hands it over.
//
// The menu bar is in menu-bar.js; New… is the shared New dialog, and saving the shared document code.
import { render } from 'preact';
import { effect } from '@preact/signals';
import { audioEngine } from '../platform/audio-engine.js';
import { projectFiles } from '../platform/project-files.js';
import { typing } from '../platform/keys.js';
import { registerFx } from '../daw/fx.js';
import { HUMANIZE, humanizeFx } from '../composer/humanize-fx.js';
import { settings, loadSettings, project, dirty } from '../ui/store.js';
import { checkLibraries } from '../ui/libraries.js';
import { openProject, newProject } from '../ui/document.js';
import { toggle, seek } from '../ui/player.js';
import { textMenu } from '../ui/context-menus.js';
import { busy } from '../ui/commands.js';
import { NewProject } from '../ui/components/NewProject.jsx';
import { ExportDialog } from '../ui/components/ExportDialog.jsx';
import { Ask } from '../ui/components/Ask.jsx';
import { Player } from './components/Player.jsx';
import { SongList } from './components/SongList.jsx';
import { Song } from './components/Song.jsx';
import { startMusicGeneratorMenus } from './menu-bar.js';

function App()
{
    return (
        <div class="app music-generator">
            <Player />
            <SongList />
            <Song />
            <NewProject />
            <ExportDialog />
            <Ask />
        </div>
    );
}

// Space plays and stops, Return goes to the start; the rest is in the menus
addEventListener('keydown', (e)=>
{
    if (typing() || busy() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); seek(0); }
});
// text fields get the usual edit menu on a right-click
addEventListener('contextmenu', (e)=>
{
    const t = e.target;
    if (e.defaultPrevented || !(t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.type !== 'range'))) return;
    e.preventDefault();
    textMenu();
});

effect(()=> { document.title = `${project.value.title}${dirty.value ? ' *' : ''} · Music Generator`; });
// closing the window with a song not saved: the app asks first
addEventListener('beforeunload', (e)=> { if (dirty.value) { e.preventDefault(); e.returnValue = ''; } });

registerFx(HUMANIZE, humanizeFx);
await loadSettings();
await checkLibraries();
audioEngine.volume = settings.value.volume;
const list = await projectFiles.list().catch(()=> []);
const first = list.find(p => p.name === settings.value.project) ?? list[0];
if (!first || !await openProject(first.name)) newProject();
render(<App />, document.body);
startMusicGeneratorMenus();
