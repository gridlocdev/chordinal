// The menu bar's Edit, Track, Transport and View menus, built from the commands, and the loop that keeps the bar
// enabled, checked and listed as the app changes. The File and Help menus are in src/chordinal/menu-bar.js.
import { effect } from '@preact/signals';
import { appMenu } from './platform/app-menu.js';
import { typing } from './platform/keys.js';
import { item, snapItems } from './commands.js';

export const editMenu = ()=> ({ label: 'Edit', submenu: [item('undo'), item('redo'), '-', item('cut'), item('copy'), item('paste'), item('duplicate'), item('delete'), '-',
    item('selectAll'), item('deselect'), '-', item('split'), item('join'), item('muteClip'), '-', item('makePattern'), item('makeUnique'), '-',
    item('quantize'), item('humanize'), { label: 'Snap', submenu: snapItems() }, '-',
    item('up'), item('down'), item('octaveUp'), item('octaveDown'), item('nudgeLeft'), item('nudgeRight'), '-',
    item('doubleSpeed'), item('halfSpeed'), item('reverse'), '-', item('insertBars'), item('deleteBars')] });

/** @param {any[]} more  the app's own items, after Choose Instrument */
export const trackMenu = (more = [])=> ({ label: 'Track', submenu: [item('newTrack'), item('duplicateTrack'), item('renameTrack'), item('instrument'), ...more, '-',
    item('mute'), item('solo'), '-', item('trackUp'), item('trackDown'), '-', item('deleteTrack')] });

/** @param {any[]} more  the app's own items at the end */
export const transportMenu = (more = [])=> ({ label: 'Transport', submenu: [item('play'), item('record'), '-',
    item('start'), item('end'), item('prevBar'), item('nextBar'), item('prevMarker'), item('nextMarker'), '-',
    item('loop'), item('loopSelection'), item('metronome'), item('click'), '-', item('addMarker'), item('tempo'), item('meter'), ...more] });

/** @param {any[]} first  the app's own items at the top (its panels) */
export const viewMenu = (first = [])=> ({ label: 'View', submenu: [...first, item('roll'), item('mixer'), item('stepGrid'), '-',
    item('zoomIn'), item('zoomOut'), item('fit'), '-', item('follow'), item('ghosts'), '-',
    { label: 'Theme', submenu: [item('themeSystem'), item('themeLight'), item('themeDark')] }, { role: 'togglefullscreen' }, '-',
    { label: 'Developer', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }] }] });

/**
 * Keeps the menu bar's items enabled, checked and listed as the app changes, a moment after it does.
 * @param {()=> any[]} menuBar  the app's whole bar
 */
export function startMenus(menuBar)
{
    let timer = 0;
    effect(()=>
    {
        const bar = menuBar();
        clearTimeout(timer);
        timer = setTimeout(()=> appMenu.setBar(bar), 60);
    });
    const focusChanged = ()=> appMenu.typing(typing());
    addEventListener('focusin', focusChanged);
    addEventListener('focusout', ()=> setTimeout(focusChanged));
}
