// Keys played during a take (the computer keyboard or a MIDI keyboard) are recorded: paired into notes at their
// beats, and put into the clip the take starts in, which every clip of its pattern shares.
import test from 'node:test';
import assert from 'node:assert/strict';
import { playedNotes, recordInto } from '@chordinal/sketch';
import { keyBeat } from '@chordinal/playback';
import { emptyProject, addTrack, makeTrack, addClip, makePattern } from '@chordinal/daw';

test('a played key is timed from the take\'s first bar line, as heard after the count-in', ()=>
{
    const r = { start: 10, beatSec: 0.5, countBeats: 4 };
    assert.equal(keyBeat(r, 12), 0);
    assert.equal(keyBeat(r, 12.75), 1.5);
    assert.equal(keyBeat(r, 12.1, 0.1), 0, 'played along to a click heard late');
});

test('presses and releases pair into notes; notes held at the end stop there, and the count-in is dropped', ()=>
{
    const notes = playedNotes([
        { key: 60, on: true, vel: 90, beat: -2 }, { key: 60, on: false, beat: -1 },     // all in the count-in
        { key: 62, on: true, vel: 80, beat: -0.25 }, { key: 62, on: false, beat: 1 },    // early: starts on the bar
        { key: 64, on: true, vel: 100, beat: 1 }, { key: 64, on: false, beat: 2 },
        { key: 67, on: true, vel: 70, beat: 2 },                                          // still held
    ], 4);
    assert.deepEqual(notes, [
        { beat: 0, beats: 1, key: 62, vel: 80 },
        { beat: 1, beats: 1, key: 64, vel: 100 },
        { beat: 2, beats: 2, key: 67, vel: 70 },
    ]);
});

function withPattern()
{
    let p = emptyProject();
    p = addTrack(p, { ...makeTrack(p, { name: 'Keys' }), id: 't1' });
    p = addClip(p, 't1', { id: 'a', start: 0, beats: 4, notes: [{ beat: 0, beats: 1, key: 48, vel: 100 }] });
    p = makePattern(p, 't1', 'a', 'Riff');
    const pattern = p.tracks[0].clips[0].pattern;
    p = addClip(p, 't1', { id: 'b', start: 8, beats: 4, notes: [], pattern });
    return p;
}

test('notes played over a pattern clip go into it, and its other clips share them', ()=>
{
    const p = withPattern();
    const { project, clip } = recordInto(p, 't1', 8, [{ beat: 1, beats: 1, key: 60, vel: 90 }], 'b');
    assert.equal(clip, 'b');
    const [a, b] = project.tracks[0].clips;
    assert.deepEqual(b.notes.map(n => n.key), [48, 60]);
    assert.deepEqual(a.notes, b.notes, 'the pattern\'s other clip has them too');
    assert.equal(a.beats, 4);
});

test('playing past a clip\'s end grows it by whole bars; with no clip there, a new clip starts at the take', ()=>
{
    const p = withPattern();
    const grown = recordInto(p, 't1', 0, [{ beat: 4, beats: 1, key: 60, vel: 90 }]).project.tracks[0].clips;
    assert.deepEqual(grown.map(c => c.beats), [8, 8]);

    const { project, clip } = recordInto(p, 't1', 16, [{ beat: 0, beats: 5, key: 64, vel: 90 }]);
    const made = project.tracks[0].clips.find(c => c.id === clip);
    assert.equal(made.start, 16);
    assert.equal(made.beats, 8);
    assert.deepEqual(made.notes, [{ beat: 0, beats: 5, key: 64, vel: 90 }]);
});
