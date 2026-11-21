// Chordinal's menu bar: its File menu (§4: New, Open…, Open Recent, Save, Save As…), Track ▸ Generate Part… (§8) and
// Record Melody, Transport ▸ Whistle a Chord and New from Melody (§9.3), and Help, around the shared menus
// (packages/ui/src/menu-bar.ts). The app's own commands join the shared catalog here.
import { projectName, chordRange } from '@chordinal/ui';
import { recording } from '@chordinal/ui';
import { catalog, item, busy } from '@chordinal/ui';
import { editMenu, trackMenu, transportMenu, viewMenu, startMenus } from '@chordinal/ui';
import type { Menu, MenuEntry } from '@chordinal/ui';
import { recent, newSong, openFolder, openRecent, clearRecent, revealProject } from './files.ts';
import { openGenerate } from './generate.ts';
import { recordMelody, whistleChord } from './whistle.ts';

const kind = () => recording.value?.kind;

catalog.add([
  {
    id: 'new',
    group: 'File',
    title: 'New',
    shortcut: 'mod+n',
    run: newSong,
    description: 'Start a new project: 120 bpm, 4/4, drums and a piano.',
    keywords: 'create blank empty song',
  },
  {
    id: 'open',
    group: 'File',
    title: 'Open…',
    shortcut: 'mod+o',
    run: openFolder,
    description: 'Open a project folder, or its project.json.',
    keywords: 'load file folder',
  },
  {
    id: 'clearRecent',
    group: 'File',
    title: 'Clear Recent Projects',
    run: clearRecent,
    enabled: () => recent.value.length > 0,
    description: 'Empty the Open Recent menu.',
    keywords: 'forget history',
  },
  {
    id: 'reveal',
    group: 'File',
    title: 'Show in Finder',
    run: revealProject,
    enabled: () => !!projectName.value,
    description: 'Show the project’s folder in the Finder.',
    keywords: 'folder explorer reveal locate',
  },
  {
    id: 'generatePart',
    group: 'Track',
    title: 'Generate Part…',
    run: () => openGenerate(),
    description: 'Write a drum, bass, chord or melody part with the composer.',
    keywords: 'compose ai create auto',
  },
  {
    id: 'recordMelody',
    group: 'Track',
    title: 'Record Melody',
    run: () => recordMelody(),
    checked: () => kind() === 'melody',
    enabled: () => kind() !== 'chord',
    description: 'Whistle or play a melody onto the selected track.',
    keywords: 'whistle sing hum take',
  },
  {
    id: 'whistleChord',
    group: 'Transport',
    title: 'Whistle a Chord',
    run: whistleChord,
    checked: () => kind() === 'chord',
    enabled: () => kind() === 'chord' || (!kind() && !!chordRange.value),
    description: 'Whistle the notes of a chord onto the stretch picked on the chord track.',
    keywords: 'sing hum',
  },
]);

function fileMenu(): Menu {
  // the recent projects are items of their own, not commands; they wait while a dialog is open as commands do
  const list: MenuEntry[] = recent.value.map((r) => ({
    id: `recent:${r.path}`,
    label: r.name,
    enabled: r.exists,
    run: () => {
      if (!busy()) void openRecent(r.path);
    },
  }));
  return {
    label: 'File',
    submenu: [
      item('new'),
      item('open'),
      {
        label: 'Open Recent',
        submenu: [
          ...(list.length ? list : [{ label: 'No Recent Projects', enabled: false }]),
          '-',
          item('clearRecent', { label: 'Clear Menu' }),
        ],
      },
      '-',
      item('save'),
      item('saveAs'),
      item('revert'),
      '-',
      item('importMidi'),
      item('exportAudio'),
      item('exportMidi'),
      item('reveal'),
    ],
  };
}

function menuBar(): MenuEntry[] {
  return [
    fileMenu(),
    editMenu(),
    trackMenu([item('generatePart'), item('recordMelody')]),
    transportMenu(['-', item('whistleChord'), item('newFromMelody')]),
    viewMenu([item('commandMenu'), item('browser'), '-']),
    { label: 'Help', submenu: [item('shortcuts'), item('readme')] },
  ];
}

export const startChordinalMenus = (): void => startMenus(menuBar);
