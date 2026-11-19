// A menu item runs its command only if the command is still enabled when it runs: the menu bar is rebuilt a moment
// after the app changes, so a click or shortcut in between must not run a command that just became disabled.
import test from 'node:test';
import assert from 'node:assert/strict';
import { item } from '../../src/ui/commands.js';
import { exportDialog } from '../../src/ui/bounce.js';
import { hist } from '../../src/ui/store.js';
import { emptyProject, makeTrack, addTrack, history } from '../../src/daw/project.js';

globalThis.requestAnimationFrame ??= ()=> 0;
globalThis.cancelAnimationFrame ??= ()=> {};

test('an item built while its command was enabled does nothing once the command is disabled', ()=>
{
    let p = emptyProject({ title: 'Clips', bpm: 120, sig: '4/4', bars: 4 });
    p = addTrack(p, makeTrack(p, { name: 'Piano', instrument: { bank: 0, program: 0 } }));
    const withClip = { ...p, tracks: p.tracks.map(t => ({ ...t, clips: [{ id: 'c1', start: 0, length: 4, notes: [] }] })) };
    hist.value = history(withClip);
    const exportItem = item('exportAudio');
    assert.equal(exportItem.enabled, true);

    hist.value = history(p);    // the clips are gone before the menu bar is rebuilt
    exportItem.run();
    assert.equal(exportDialog.value, false, 'Export did not open with nothing to export');

    hist.value = history(withClip);
    exportItem.run();
    assert.equal(exportDialog.value, true, 'enabled again: it runs');
    exportDialog.value = false;
});
