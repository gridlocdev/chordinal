import test from 'node:test';
import assert from 'node:assert/strict';
import { heardDifferently } from '../../src/app/player.js';
import { emptyProject, makeTrack, addTrack, setMeterAt, updateTrack } from '../../src/daw/project.js';

test('an edit while playing restarts playback when it changes what is heard (meter, key, chords, length, title)', ()=>
{
    let p = emptyProject({ bars: 4 });
    p = addTrack(p, makeTrack(p, { name: 'Keys' }));
    const id = p.tracks[0].id;
    for (const [what, q] of [
        ['meter', setMeterAt(p, 4, '3/4')],
        ['key', { ...p, key: { tonic: 2, mode: 'minor' } }],
        ['chords', { ...p, chords: [{ beat: 0, beats: 4, name: 'C', tones: [0, 4, 7] }] }],
        ['length', { ...p, length: p.length + 4 }],
        ['title', { ...p, title: 'Other' }],
    ]) assert.equal(heardDifferently(p, q), true, what);
    const louder = updateTrack(p, id, t => ({ ...t, mixer: { ...t.mixer, volumeDb: -3 } }));
    assert.equal(heardDifferently(p, louder), false, 'a fader plays on without a restart');
});
