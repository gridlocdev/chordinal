// Chordinal: a DAW for making music by hand (Chordinal PRD). Loads the settings, reopens the last project or starts a
// new one, wires musical typing and MIDI, and lays out the window: the transport across the top, the browser on the
// left, the arrangement (whose track headers carry each track's mute, solo and volume), the editor below it, and the
// status bar along the bottom (§5).
//
// Its File menu is in menu-bar.ts, its files in files.ts; the views and commands are in packages/ui/src/.
import '@chordinal/ui/ui.css';
import { render } from 'preact';
import type { TargetedPointerEvent } from 'preact';
import { audioEngine } from '@chordinal/playback';
import { registerFx } from '@chordinal/daw';
import { HUMANIZE, humanizeFx } from '@chordinal/composer';
import { settings, setSettings, loadSettings } from '@chordinal/ui';
import { startTheme, startChrome } from '@chordinal/ui';
import { checkLibraries } from '@chordinal/ui';
import { startLive, connectMidi, startNotices } from '@chordinal/ui';
import { startEditorFollow } from '@chordinal/ui';
import { handleKey } from '@chordinal/ui';
import { textMenu, setTrackItems } from '@chordinal/ui';
import { Transport, StatusBar } from '@chordinal/ui/components';
import { Arrange } from '@chordinal/ui/components';
import { Editor } from '@chordinal/ui/components';
import { ExportDialog } from '@chordinal/ui/components';
import { Ask } from '@chordinal/ui/components';
import type { ArrangeActions } from '@chordinal/ui/components';
import { CommandMenu, ShortcutsDialog } from '@chordinal/ui/components';
import { SidePanel } from './components/SidePanel.tsx';
import { openTrack, addInstrumentTrack, addDrumTrack, dropInstrument } from './rack.ts';
import { GeneratePart } from './components/GeneratePart.tsx';
import { openGenerate } from './generate.ts';
import { recordMelody } from './whistle.ts';
import { useProjectFolders, startUp, watchWindow, newSong } from './files.ts';
import { startChordinalMenus } from './menu-bar.ts';

const EDITOR_H = [140, 0.8] as const; // px, and at most this much of the window
/** what the arrangement's track headers and its foot do here (§6) */
const TRACK_ACTIONS: ArrangeActions = {
  open: openTrack,
  instrument: dropInstrument,
  addTrack: addInstrumentTrack,
  addDrums: addDrumTrack,
};

function Split() {
  const down = (e: TargetedPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const startY = e.clientY,
      startH = settings.value.editorHeight;
    const move = (m: PointerEvent) =>
      setSettings({
        editorHeight: Math.round(
          Math.max(EDITOR_H[0], Math.min(innerHeight * EDITOR_H[1], startH - (m.clientY - startY))),
        ),
      });
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  };
  return <div class="split" onPointerDown={down} title="Drag to resize" />;
}

function App() {
  return (
    <div
      class={`app chordinal ${settings.value.browserOpen ? '' : 'no-browser'}`}
      style={{
        '--editor-h': `${settings.value.editorHeight}px`,
        '--browser-w': `${settings.value.leftWidth}px`,
      }}
    >
      <Transport onNew={newSong} newLabel="New" />
      {settings.value.browserOpen && <SidePanel />}
      <Arrange actions={TRACK_ACTIONS} />
      <Split />
      <Editor />
      <StatusBar />
      <ExportDialog />
      <GeneratePart />
      <Ask />
      <CommandMenu />
      <ShortcutsDialog />
    </div>
  );
}

addEventListener('keydown', (e) => {
  if (handleKey(e)) e.preventDefault();
});
// text fields get the usual edit menu on a right-click
addEventListener('contextmenu', (e) => {
  const t = e.target;
  if (
    e.defaultPrevented ||
    !(t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.type !== 'range'))
  )
    return;
  e.preventDefault();
  textMenu();
});

useProjectFolders();
setTrackItems((trackId) => [
  { label: 'Generate Part…', run: () => openGenerate(trackId) },
  { label: 'Record Melody', run: () => recordMelody(trackId) },
]);
registerFx(HUMANIZE, humanizeFx);
await loadSettings();
startTheme();
startChrome();
await checkLibraries();
audioEngine.volume = settings.value.volume;
startLive();
startNotices();
connectMidi();
await startUp();
watchWindow();
render(<App />, document.body);
startChordinalMenus();
startEditorFollow();
