// The menu bar's Edit, Track, Transport and View menus, built from the commands, and the loop that keeps the bar
// enabled, checked and listed as the app changes. The File and Help menus are in apps/web/src/menu-bar.ts.
import { effect } from '@preact/signals';
import { appMenu } from './platform/app-menu.ts';
import type { MenuEntry, MenuItem } from './platform/app-menu.ts';
import { typing } from './platform/keys.ts';
import { item, snapItems } from './commands.ts';

/** a menu of the bar: its title and its items */
export interface Menu extends MenuItem {
  label: string;
  submenu: MenuEntry[];
}

export const editMenu = (): Menu => ({
  label: 'Edit',
  submenu: [
    item('undo'),
    item('redo'),
    '-',
    item('cut'),
    item('copy'),
    item('paste'),
    item('duplicate'),
    item('delete'),
    '-',
    item('selectAll'),
    item('deselect'),
    '-',
    item('split'),
    item('join'),
    item('muteClip'),
    '-',
    item('makePattern'),
    item('makeUnique'),
    '-',
    item('quantize'),
    item('humanize'),
    { label: 'Snap', submenu: snapItems() },
    '-',
    item('up'),
    item('down'),
    item('octaveUp'),
    item('octaveDown'),
    item('nudgeLeft'),
    item('nudgeRight'),
    '-',
    item('doubleSpeed'),
    item('halfSpeed'),
    item('reverse'),
    '-',
    item('insertBars'),
    item('deleteBars'),
  ],
});

/** `more`: the app's own items, after Choose Instrument */
export const trackMenu = (more: MenuEntry[] = []): Menu => ({
  label: 'Track',
  submenu: [
    item('newTrack'),
    item('duplicateTrack'),
    item('renameTrack'),
    item('instrument'),
    ...more,
    '-',
    item('mute'),
    item('solo'),
    item('showAutomation'),
    '-',
    item('trackUp'),
    item('trackDown'),
    '-',
    item('deleteTrack'),
  ],
});

/** `more`: the app's own items at the end */
export const transportMenu = (more: MenuEntry[] = []): Menu => ({
  label: 'Transport',
  submenu: [
    item('play'),
    item('record'),
    '-',
    item('start'),
    item('end'),
    item('prevBar'),
    item('nextBar'),
    item('prevMarker'),
    item('nextMarker'),
    '-',
    item('loop'),
    item('loopSelection'),
    item('metronome'),
    item('click'),
    '-',
    item('addMarker'),
    item('tempo'),
    item('meter'),
    ...more,
  ],
});

/** `first`: the app's own items at the top (its panels) */
export const viewMenu = (first: MenuEntry[] = []): Menu => ({
  label: 'View',
  submenu: [
    ...first,
    item('roll'),
    item('mixer'),
    item('stepGrid'),
    '-',
    item('zoomIn'),
    item('zoomOut'),
    item('fit'),
    '-',
    item('follow'),
    item('ghosts'),
    '-',
    { label: 'Theme', submenu: [item('themeSystem'), item('themeLight'), item('themeDark')] },
    { role: 'togglefullscreen' },
    '-',
    { label: 'Developer', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }] },
  ],
});

/**
 * Keeps the menu bar's items enabled, checked and listed as the app changes, a moment after it does.
 * `menuBar`: the app's whole bar.
 */
export function startMenus(menuBar: () => MenuEntry[]): void {
  let timer = 0;
  effect(() => {
    const bar = menuBar();
    clearTimeout(timer);
    timer = setTimeout(() => appMenu.setBar(bar), 60);
  });
  const focusChanged = () => appMenu.typing(typing());
  addEventListener('focusin', focusChanged);
  addEventListener('focusout', () => setTimeout(focusChanged));
}
