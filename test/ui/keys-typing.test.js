// With no menu bar (the browser), the page answers the Cmd shortcuts itself; while a text field has focus, the ones
// marked `field` are left to the field, so Cmd+Backspace deletes text there instead of the selected track. While the
// piano roll has the focus its letters play notes, so the plain-letter commands (B, C, M, Q, R) wait until it hasn't.
// While a take records, the letters play wherever the focus is, and R still stops the take.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.requestAnimationFrame ??= ()=> 0;
globalThis.cancelAnimationFrame ??= ()=> {};
class HTMLElement { constructor(tag, type) { this.tagName = tag; this.type = type; this.isContentEditable = false; } }
globalThis.HTMLElement = HTMLElement;
globalThis.document = { activeElement: null };

const { handleKey } = await import('@chordinal/ui');
const { COMMANDS } = await import('@chordinal/ui');
const { hist, selected, settings, setSettings } = await import('@chordinal/ui');
const { focus, musicalTyping, takingKeys } = await import('@chordinal/ui');
const { emptyProject, addTrack, makeTrack } = await import('@chordinal/daw');
const { history } = await import('@chordinal/daw');

const key = (code, mods = {})=> ({ code, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, repeat: false, ...mods });

test('Cmd+Backspace deletes the track, but not while typing in a text field', ()=>
{
    let p = emptyProject({ title: 'Keys' });
    p = addTrack(p, { ...makeTrack(p, { name: 'Keys' }), id: 't1' });
    hist.value = history(p);
    selected.value = 't1';
    const tracks = ()=> hist.value.present.tracks.length;
    const before = tracks();

    document.activeElement = new HTMLElement('INPUT', 'text');
    assert.equal(handleKey(key('Backspace', { metaKey: true })), false);
    assert.equal(tracks(), before);

    document.activeElement = null;
    assert.equal(handleKey(key('Backspace', { metaKey: true })), true);
    assert.equal(tracks(), before - 1);
});

test('the shortcuts left to a text field are the editing ones; File and View shortcuts still work while typing', ()=>
{
    const field = Object.keys(COMMANDS).filter(id => COMMANDS[id].field);
    assert.deepEqual(field.sort(), ['deleteTrack', 'duplicate', 'duplicateTrack', 'join', 'makePattern', 'newTrack', 'split', 'trackDown', 'trackUp']);
    for (const id of ['save', 'saveAs', 'revert', 'zoomIn', 'roll']) assert.ok(!COMMANDS[id].field, id);
});

test('the letters play notes only while the piano roll is showing and focused, and B toggles the browser everywhere else', ()=>
{
    document.activeElement = null;
    setSettings({ editorTab: 'roll', browserOpen: false });
    focus.value = 'roll';
    assert.equal(musicalTyping(), true);
    assert.equal(handleKey(key('KeyB')), false, 'B is left to musical typing');
    assert.equal(settings.value.browserOpen, false);

    focus.value = 'arrange';
    assert.equal(musicalTyping(), false);
    assert.equal(handleKey(key('KeyB')), true);
    assert.equal(settings.value.browserOpen, true);

    focus.value = 'roll';
    setSettings({ editorTab: 'mixer' });
    assert.equal(musicalTyping(), false, 'the roll is not showing');
    assert.equal(handleKey(key('KeyB')), true);
    assert.equal(settings.value.browserOpen, false);
});

test('while a take records, the letters play notes wherever the focus is, and R still reaches Record', ()=>
{
    document.activeElement = null;
    setSettings({ editorTab: 'mixer', browserOpen: false });
    focus.value = 'arrange';
    takingKeys.value = true;
    try
    {
        assert.equal(musicalTyping(), true);
        assert.equal(handleKey(key('KeyB')), false, 'B is a note during the take');
        assert.equal(settings.value.browserOpen, false);
        const record = COMMANDS.record.run;
        let stopped = 0;
        COMMANDS.record.run = ()=> { stopped++; };
        try { assert.equal(handleKey(key('KeyR')), true); }
        finally { COMMANDS.record.run = record; }
        assert.equal(stopped, 1);
    }
    finally { takingKeys.value = false; }
});
