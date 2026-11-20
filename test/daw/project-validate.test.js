// A project.json the app can't play is refused on open with what is wrong, rather than opening and failing later
// (audit: only the top-level keys were checked, so a note with no key opened and played silence or NaN).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readProject, writeProject } from '../../src/daw/project-format.js';
import { emptyProject, makeTrack, addTrack } from '../../src/daw/project.js';

/** a written project with one track and one clip, then `spoil` applied to its parsed JSON */
function spoiled(spoil)
{
    let p = emptyProject({ title: 'Check' });
    p = addTrack(p, makeTrack(p));
    p.tracks[0].clips = [{ id: 'c1', start: 0, beats: 4, notes: [{ beat: 0, beats: 1, key: 60, vel: 100 }] }];
    const data = JSON.parse(writeProject(p));
    spoil(data);
    return JSON.stringify(data);
}

test('a sound project reads', ()=>
{
    assert.equal(readProject(spoiled(()=> {})).tracks[0].clips[0].notes[0].key, 60);
});

for (const [what, spoil, message] of [
    ['a note with no key', (d)=> { d.tracks[0].clips[0].notes[0][2] = null; }, /track 1, clip c1, note 1 has no key/],
    ['a note with a length of 0', (d)=> { d.tracks[0].clips[0].notes[0][1] = 0; }, /note 1 has no length/],
    ['a tempo of 0', (d)=> { d.tempoMap[0].bpm = 0; }, /tempo change 1/],
    ['a meter that is not like 4/4', (d)=> { d.meters[0].sig = 'four'; }, /meter 1/],
    ['two clips with one id', (d)=> { d.tracks[0].clips.push({ ...d.tracks[0].clips[0] }); }, /no id of its own/],
    ['tracks that are not a list', (d)=> { d.tracks = {}; }, /tracks are not a list/],
    ['a clip with no notes list', (d)=> { delete d.tracks[0].clips[0].notes; }, /clip c1 has no list of notes/],
])
{
    test(`${what} is refused, saying what is wrong`, ()=>
    {
        assert.throws(()=> readProject(spoiled(spoil)), message);
    });
}
