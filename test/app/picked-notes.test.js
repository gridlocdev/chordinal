import test from 'node:test';
import assert from 'node:assert/strict';
import { hist, selected, picked } from '../../src/app/store.js';
import { history } from '../../src/daw/project.js';
import { pickedNotes } from '../../src/app/notes.js';
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
