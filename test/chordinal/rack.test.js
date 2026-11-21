// The channel rack and the browser, apart from how they look (Chordinal PRD §6, §7).
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.requestAnimationFrame ??= ()=> 0;
globalThis.cancelAnimationFrame ??= ()=> {};

const { instrumentGroups, kits, openTrack, addDrumTrack, addInstrumentTrack, dropInstrument, STANDARD_KIT, GM_FAMILIES } = await import('../../apps/web/src/rack.js');
const { previewNotes } = await import('@chordinal/ui');
const { moveTrackTo } = await import('@chordinal/ui');
const { soundfontLibrary } = await import('@chordinal/audio');
const { hist, project, selected, selectedClip, beat, settings } = await import('@chordinal/ui');
const { emptyProject, addTrack, makeTrack, addClip, findPattern } = await import('@chordinal/daw');
const { history } = await import('@chordinal/daw');

/** a project with these tracks ([name, bank]), nothing selected, the playhead at the start */
function start(tracks)
{
    let p = emptyProject();
    for (const [name, bank] of tracks) p = addTrack(p, makeTrack(p, { name, instrument: { bank, program: 0 } }));
    hist.value = history(p);
    selected.value = null;
    selectedClip.value = null;
    beat.value = 0;
    return p;
}
const ids = ()=> project.value.tracks.map(t => t.name);

test('the instruments are grouped by General MIDI family, in family order, with no kits among them; the kits are apart', ()=>
{
    const presets = soundfontLibrary.presets();
    const groups = instrumentGroups(presets);
    assert.equal(groups[0][0], 'Piano');
    assert.deepEqual(groups.map(g => g[0]), GM_FAMILIES.filter(f => groups.some(g => g[0] === f)), 'family order');
    for (const [family, list] of groups) for (const p of list) assert.equal(GM_FAMILIES[Math.floor(p.program / 8)], family);
    assert.ok(groups.flatMap(g => g[1]).every(p => p.bank < 128));
    assert.ok(groups.flatMap(g => g[1]).some(p => p.name.startsWith('Chip')), 'the chip instruments are in their families');
    const k = kits(presets);
    assert.ok(k.length && k.every(p => p.bank >= 128));
    assert.equal(groups.flatMap(g => g[1]).length + k.length, presets.length);
});

test('a preview is middle C for an instrument, and a kick, a snare and a closed hat for a kit', ()=>
{
    assert.deepEqual(previewNotes({ bank: 0, program: 0 }).map(n => n[0]), [60]);
    assert.deepEqual(previewNotes(STANDARD_KIT).map(n => n[0]), [36, 38, 42]);
});

test('double-clicking a drum row with no clip at the playhead makes a 1-bar pattern there and opens the step grid', ()=>
{
    start([['Drums', 128], ['Keys', 0]]);
    beat.value = 9;     // bar 3 in 4/4
    const drums = project.value.tracks[0];
    openTrack(drums.id);
    const c = project.value.tracks[0].clips[0];
    assert.equal(c.start, 8);
    assert.equal(c.beats, 4);
    assert.ok(findPattern(project.value, c.pattern), 'a pattern clip');
    assert.equal(settings.value.editorTab, 'grid');
    assert.deepEqual(selectedClip.value, { track: drums.id, clip: c.id });
    assert.equal(selected.value, drums.id);
});

test('double-clicking an instrument row opens the piano roll on the clip already at the playhead, adding nothing', ()=>
{
    let p = start([['Keys', 0]]);
    const keys = p.tracks[0];
    p = addClip(p, keys.id, { id: 'c1', start: 0, beats: 16, notes: [] });
    hist.value = history(p);
    beat.value = 5;
    openTrack(keys.id);
    assert.equal(project.value.tracks[0].clips.length, 1);
    assert.deepEqual(selectedClip.value, { track: keys.id, clip: 'c1' });
    assert.equal(settings.value.editorTab, 'roll');
});

test('+ Add Drums adds a drum track with the Standard kit below the selected track; + Add Track an instrument track', ()=>
{
    start([['A', 0], ['B', 0]]);
    selected.value = project.value.tracks[0].id;
    addDrumTrack();
    assert.deepEqual(ids(), ['A', 'Drums', 'B']);
    assert.deepEqual(project.value.tracks[1].instrument, STANDARD_KIT);
    assert.equal(selected.value, project.value.tracks[1].id);
    addInstrumentTrack();
    assert.equal(project.value.tracks[2].instrument.bank, 0);
    assert.equal(project.value.tracks.length, 4);
});

test('an instrument dropped on a row sets that track\'s; dropped below the rows it adds a track named after it', ()=>
{
    start([['A', 0]]);
    const a = project.value.tracks[0].id;
    dropInstrument(a, { bank: 0, program: 33, name: 'Fingered Bass' });
    assert.deepEqual(project.value.tracks[0].instrument, { bank: 0, program: 33 });
    dropInstrument(null, { bank: 0, program: 40, name: 'Violin' });
    assert.deepEqual(ids(), ['A', 'Violin']);
    assert.deepEqual(project.value.tracks[1].instrument, { bank: 0, program: 40 });
});

test('dragging a row to a new place reorders the tracks, in one undo step', ()=>
{
    start([['A', 0], ['B', 0], ['C', 0]]);
    const c = project.value.tracks[2].id;
    moveTrackTo(c, 0);
    assert.deepEqual(ids(), ['C', 'A', 'B']);
    moveTrackTo(c, 0);
    assert.deepEqual(ids(), ['C', 'A', 'B'], 'to where it is: nothing');
    assert.equal(hist.value.past.length, 1);
});
