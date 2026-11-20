// Generate Part… on the project (Chordinal PRD §8): where the clip goes, the chord track, undo, and Generate Again.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.requestAnimationFrame ??= ()=> 0;
globalThis.cancelAnimationFrame ??= ()=> {};

const { generatePart, rangeChoices, defaultPart, canAgain } = await import('../../src/chordinal/generate.js');
const { hist, project, selected, selectedClip, chordRange } = await import('../../src/ui/store.js');
const { undo } = await import('../../src/ui/document.js');
const { emptyProject, addTrack, makeTrack, addClip, findPattern, updateClip } = await import('../../src/daw/project.js');
const { history } = await import('../../src/daw/history.js');
const { setLoop } = await import('../../src/daw/timeline.js');
const { edit } = await import('../../src/ui/document.js');

function start({ tracks = [['Drums', 128], ['Keys', 0]], key = { tonic: 0, mode: 'major' }, chords = [] } = {})
{
    let p = { ...emptyProject({ bars: 8 }), key, chords };
    for (const [name, bank] of tracks) p = addTrack(p, makeTrack(p, { name, instrument: { bank, program: 0 } }));
    hist.value = history(p);
    selected.value = null;
    selectedClip.value = null;
    chordRange.value = null;
    return p;
}
const ask = (more = {})=> ({ part: 'melody', style: 'feeling:hopeful', seed: 's1', range: { from: 0, to: 16 }, trackId: null, ...more });
const track = (i)=> project.value.tracks[i];

test('the dialog starts on drums for a drum track and the melody otherwise, over the selection, else the loop, else the project', ()=>
{
    const p = start();
    assert.equal(defaultPart(p.tracks[0]), 'drums');
    assert.equal(defaultPart(p.tracks[1]), 'melody');
    assert.equal(defaultPart(null), 'melody');
    assert.deepEqual(rangeChoices().map(r => r.id), ['project']);
    assert.deepEqual(rangeChoices()[0].range, { from: 0, to: 32 });
    hist.value = history(setLoop(project.value, { from: 4, to: 12 }));
    chordRange.value = { beat: 8, beats: 8 };
    assert.deepEqual(rangeChoices().map(r => [r.id, r.range]), [['selection', { from: 8, to: 16 }], ['loop', { from: 4, to: 12 }], ['project', { from: 0, to: 32 }]]);
});

test('a drum part is one pattern clip over the range on the drum track, laid over what is there, in one undo step', ()=>
{
    let p = start();
    p = addClip(p, p.tracks[0].id, { id: 'old', start: 0, beats: 32, notes: [{ key: 36, beat: 0, beats: 0.25, vel: 100 }] });
    hist.value = history(p);
    const r = generatePart(ask({ part: 'drums', trackId: track(0).id, range: { from: 8, to: 16 } }));
    assert.ok(r.ok);
    const clips = track(0).clips;
    assert.equal(clips.length, 2, 'the clip already there is kept');
    const c = clips.find(x => x.id === r.clipId);
    assert.equal(c.start, 8);
    assert.equal(c.beats, 8);
    assert.ok(c.notes.length > 0);
    assert.ok(findPattern(project.value, c.pattern), 'a pattern clip');
    assert.deepEqual(project.value.chords, [], 'drums write no chords');
    assert.deepEqual(selectedClip.value, { track: track(0).id, clip: r.clipId });
    undo();
    assert.equal(track(0).clips.length, 1);
});

test('with no chords over the range, a melody fills the chord track too, in the same undo step', ()=>
{
    start();
    const r = generatePart(ask({ trackId: track(1).id, range: { from: 16, to: 32 } }));
    assert.ok(r.ok);
    const c = track(1).clips[0];
    assert.equal(c.pattern, undefined, 'an ordinary clip');
    assert.ok(project.value.chords.length > 0);
    assert.ok(project.value.chords.every(x => x.beat >= 16 && x.beat + x.beats <= 32 + 1e-9));
    undo();
    assert.deepEqual(project.value.chords, []);
    assert.equal(track(1).clips.length, 0);
});

test('with chords over the range, the part follows them and the chord track is left alone', ()=>
{
    const chords = [{ beat: 0, beats: 8, name: 'Am', tones: [9, 0, 4] }, { beat: 8, beats: 8, name: 'F', tones: [5, 9, 0] }];
    start({ chords });
    const r = generatePart(ask({ part: 'bass', trackId: track(1).id }));
    assert.ok(r.ok);
    assert.equal(project.value.chords, chords);
    assert.equal(track(1).clips[0].notes.find(n => n.beat === 0)?.key % 12, 9);
});

test('with no track selected, the part goes on a new track with its usual instrument; with no key, the one asked for', ()=>
{
    start({ key: null });
    const r = generatePart(ask({ part: 'bass', key: { tonic: 2, mode: 'minor' } }));
    assert.ok(r.ok);
    assert.equal(project.value.tracks.length, 3);
    assert.equal(track(2).name, 'Bass');
    assert.equal(track(2).instrument.bank, 0);
    assert.equal(selected.value, track(2).id);
    assert.equal(project.value.chords[0].tones[0], 2, 'D minor: the first chord is on D');
});

test('Generate Again replaces the last generated clip while it is untouched, and adds a new one after an edit', ()=>
{
    start();
    const id = track(1).id;
    generatePart(ask({ trackId: id }));
    const firstNotes = track(1).clips[0].notes;
    assert.ok(canAgain(id));
    const again = generatePart(ask({ trackId: id, seed: 's2' }), { again: true });
    assert.ok(again.ok);
    assert.equal(track(1).clips.length, 1, 'replaced');
    assert.notDeepEqual(track(1).clips[0].notes, undefined);
    undo();
    assert.equal(track(1).clips[0].notes, firstNotes, 'one undo step back to the first, as it was');
    generatePart(ask({ trackId: id, seed: 's3' }), { again: true });
    assert.equal(track(1).clips.length, 1, 'the first, back by undo, is replaced in turn');
    const c = track(1).clips[0];
    edit(p => updateClip(p, id, c.id, { mute: true }));
    assert.equal(canAgain(id), false, 'edited since');
    generatePart(ask({ trackId: id, seed: 's4' }), { again: true });
    assert.equal(track(1).clips.length, 2, 'the edited clip is kept');
});

test('a part the style cannot write adds nothing', ()=>
{
    start();
    hist.value = history({ ...project.value, meters: [{ beat: 0, sig: '7/8' }] });
    const before = project.value;
    const r = generatePart(ask({ part: 'drums', style: 'genre:classical', trackId: track(0).id }));
    assert.deepEqual(r, { ok: false, message: 'Classical can\'t write drums in 7/8.' });
    assert.equal(project.value, before);
});
