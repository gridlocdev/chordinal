import test from 'node:test';
import assert from 'node:assert/strict';
import { hist, selected, project } from '../../src/ui/store.js';
import { history, emptyProject, makeTrack, addTrack } from '../../src/daw/project.js';
import { undo } from '../../src/ui/document.js';
import { down } from '../../src/ui/components/roll-input.js';

globalThis.requestAnimationFrame ??= ()=> 0;
globalThis.cancelAnimationFrame ??= ()=> {};

/** a pretend piano roll canvas holder that records its listeners */
function roll()
{
    const on = {};
    return {
        on,
        getBoundingClientRect: ()=> ({ left: 0, top: 0, width: 900, height: 500, right: 900, bottom: 500 }),
        setPointerCapture() {}, releasePointerCapture() {},
        addEventListener: (k, fn)=> { on[k] = fn; }, removeEventListener: (k)=> { delete on[k]; },
    };
}

test('drawing a note on an empty lane, and dragging its length, is one undo step', ()=>
{
    let p = emptyProject({ bars: 4 });
    p = addTrack(p, { ...makeTrack(p, { name: 'Keys' }), id: 't1' });
    hist.value = history(p);
    selected.value = 't1';
    const el = roll();
    down({ button: 0, currentTarget: el, clientX: 300, clientY: 250, timeStamp: 1, pointerId: 1, altKey: false, shiftKey: false, metaKey: false, ctrlKey: false }, p, p.tracks[0]);
    el.on.pointermove?.({ clientX: 360, clientY: 250, altKey: false });
    el.on.pointerup?.({});
    assert.equal(project.value.tracks[0].clips.length, 1);
    assert.equal(project.value.tracks[0].clips[0].notes.length, 1);
    undo();
    assert.equal(project.value.tracks[0].clips.length, 0, 'one undo takes back the note and the clip made for it');
});
