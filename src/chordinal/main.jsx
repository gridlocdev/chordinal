// Chordinal: a DAW for making music by hand (Chordinal PRD). Loads the settings, reopens the last project or starts a
// new one, wires musical typing and MIDI, and lays out the window: the transport across the top, the arrangement, and
// the left panel (channel rack above the browser), and the editor below the arrangement (§5).
//
// Its File menu is in menu-bar.js, its files in files.js; everything else is shared with Music Generator (src/ui/).
import { render } from 'preact';
import { audioEngine } from '../platform/audio-engine.js';
import { registerFx } from '../daw/fx.js';
import { HUMANIZE, humanizeFx } from '../composer/humanize-fx.js';
import { settings, setSettings, loadSettings } from '../ui/store.js';
import { checkLibraries } from '../ui/libraries.js';
import { startLive, connectMidi } from '../ui/live.js';
import { startEditorFollow } from '../ui/steps.js';
import { handleKey } from '../ui/keys.js';
import { textMenu, setTrackItems } from '../ui/context-menus.js';
import { Transport } from '../ui/components/Transport.jsx';
import { Arrange } from '../ui/components/Arrange.jsx';
import { Editor } from '../ui/components/Editor.jsx';
import { ExportDialog } from '../ui/components/ExportDialog.jsx';
import { Ask } from '../ui/components/Ask.jsx';
import { LeftPanel } from './components/LeftPanel.jsx';
import { GeneratePart } from './components/GeneratePart.jsx';
import { openGenerate } from './generate.js';
import { recordMelody } from './whistle.js';
import { useProjectFolders, startUp, watchWindow, newSong } from './files.js';
import { startChordinalMenus } from './menu-bar.js';

const EDITOR_H = [140, 0.8];        // px, and at most this much of the window

function Split()
{
    const down = (e)=>
    {
        e.currentTarget.setPointerCapture(e.pointerId);
        const startY = e.clientY, startH = settings.value.editorHeight;
        const move = (m)=> setSettings({ editorHeight: Math.round(Math.max(EDITOR_H[0], Math.min(innerHeight * EDITOR_H[1], startH - (m.clientY - startY)))) });
        const up = ()=> { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
        addEventListener('pointermove', move);
        addEventListener('pointerup', up); addEventListener('pointercancel', up);
    };
    return <div class="split" onPointerDown={down} title="Drag to resize" />;
}

function App()
{
    return (
        <div class={`app chordinal ${settings.value.browserOpen ? '' : 'no-browser'}`}
            style={{ '--editor-h': `${settings.value.editorHeight}px`, '--browser-w': `${settings.value.leftWidth}px` }}>
            <Transport onNew={newSong} newLabel="New" />
            {settings.value.browserOpen && <LeftPanel />}
            <Arrange />
            <Split />
            <Editor />
            <ExportDialog />
            <GeneratePart />
            <Ask />
        </div>
    );
}

addEventListener('keydown', (e)=> { if (handleKey(e)) e.preventDefault(); });
// text fields get the usual edit menu on a right-click
addEventListener('contextmenu', (e)=>
{
    const t = e.target;
    if (e.defaultPrevented || !(t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.type !== 'range'))) return;
    e.preventDefault();
    textMenu();
});

useProjectFolders();
setTrackItems(trackId => [{ label: 'Generate Part…', run: ()=> openGenerate(trackId) }, { label: 'Record Melody', run: ()=> recordMelody(trackId) }]);
registerFx(HUMANIZE, humanizeFx);
await loadSettings();
await checkLibraries();
audioEngine.volume = settings.value.volume;
startLive();
connectMidi();
await startUp();
watchWindow();
render(<App />, document.body);
startChordinalMenus();
startEditorFollow();
