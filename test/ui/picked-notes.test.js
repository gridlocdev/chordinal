import test from 'node:test';
import assert from 'node:assert/strict';
import { hist, selected, picked } from '../../src/ui/store.js';
import { history } from '../../src/daw/project.js';
import { pickedNotes } from '../../src/ui/notes.js';
import { emptyProject, makeTrack, addTrack, addClip, makePattern } from '../../src/daw/project.js';

test('picked notes in a linked copy are where they were picked, once each (PRD §3.3)', ()=>
{
    let p = emptyProject();
    p = addTrack(p, { ...makeTrack(p, { name: 'Drums' }), id: 't1' });
    p = addClip(p, 't1', { id: 'c1', start: 0, beats: 4, notes: [{ beat: 0, beats: 0.25, key: 36, vel: 100 }, { beat: 1, beats: 0.25, key: 38, vel: 100 }] });
    p = makePattern(p, 't1', 'c1', 'Drums 1');
    p = addClip(p, 't1', { id: 'c2', start: 16, beats: 4, notes: [], pattern: p.tracks[0].clips[0].pattern });
    hist.value = history(p);
    selected.value = 't1';
    picked.value = new Set(['c2:0', 'c2:1', 'c1:1']);
    const list = pickedNotes();
    assert.deepEqual(list.map(o => [o.clip.id, o.i, o.at]), [['c1', 1, 1], ['c2', 0, 16]]);
});

test('opening another project drops the picks, and picks left from elsewhere enable nothing', async ()=>
{
    const { canCopy } = await import('../../src/ui/clipboard.js');
    const { focus } = await import('../../src/ui/focus.js');
    const { openNew } = await import('../../src/ui/document.js');
    const { selectedClip } = await import('../../src/ui/store.js');
    globalThis.cancelAnimationFrame ??= ()=> {};
    let p = emptyProject();
    p = addTrack(p, { ...makeTrack(p, { name: 'Keys' }), id: 't1' });
    hist.value = history(p);
    selected.value = 't1';
    selectedClip.value = null;
    focus.value = 'roll';
    // Duplicate would paste notes that aren't here, as a clip with no start
    picked.value = new Set(['gone:0', 'gone:1']);
    assert.equal(canCopy(), false, 'Copy and Duplicate stay off: those notes are not here');
    const { asking, answer } = await import('../../src/ui/ask.js');
    const opened = openNew(emptyProject({ title: 'Other' }));
    await new Promise(r => setTimeout(r, 0));
    if (asking.value) answer('');     // discard this project's unsaved changes
    await opened;
    assert.equal(picked.value.size, 0);
    assert.equal(focus.value, 'arrange');
});

test('transposing other notes after picking them is its own undo step', async ()=>
{
    const { transposePicked } = await import('../../src/ui/notes.js');
    const { undo } = await import('../../src/ui/document.js');
    const { project } = await import('../../src/ui/store.js');
    let p = emptyProject();
    p = addTrack(p, { ...makeTrack(p, { name: 'Keys' }), id: 't1' });
    p = addClip(p, 't1', { id: 'c1', start: 0, beats: 4, notes: [{ beat: 0, beats: 1, key: 60, vel: 90 }, { beat: 1, beats: 1, key: 64, vel: 90 }] });
    hist.value = history(p);
    selected.value = 't1';
    const keys = ()=> project.value.tracks[0].clips[0].notes.map(n => n.key);
    picked.value = new Set(['c1:0']);
    transposePicked(1); transposePicked(1);    // a key held down: one step
    picked.value = new Set(['c1:1']);
    transposePicked(1);
    assert.deepEqual(keys(), [62, 65]);
    undo();
    assert.deepEqual(keys(), [62, 64], 'undo takes back only the second note');
    undo();
    assert.deepEqual(keys(), [60, 64], 'and then both presses on the first');
});
