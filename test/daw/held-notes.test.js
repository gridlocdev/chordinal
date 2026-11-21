import test from 'node:test';
import assert from 'node:assert/strict';
import { heldAt, ownsKey } from '@chordinal/daw';

const note = (beat, beats, key = 60, grid = beat)=> ({ beat, beats, key, vel: 90, grid });

test('playing from mid-song restarts the notes held across that beat, but not drum hits', ()=>
{
    const tracks = [{ instrument: { bank: 0, program: 88 } }, { instrument: { bank: 128, program: 0 } }];
    const pad = note(0, 8), later = note(4, 4, 64), ended = note(0, 2, 67);
    const kick = note(0, 4, 36);
    const played = [[pad, later, ended], [kick]];
    assert.deepEqual(heldAt(played, tracks, 3), [{ i: 0, n: pad }]);
    assert.deepEqual(heldAt(played, tracks, 0), [], 'nothing is held into the very start');
    assert.deepEqual(heldAt(played, tracks, 4), [{ i: 0, n: pad }], 'a note starting on the beat is played as usual, not restarted');
});

test('a note-off releases its key only while that note still holds it', ()=>
{
    const a = { key: 60 }, b = { key: 60 };
    const sounding = new Map([['0:60', { i: 0, key: 60, n: b }]]);   // b retriggered the key a was holding
    assert.equal(ownsKey(sounding, '0:60', a), false, "a's end doesn't cut b short");
    assert.equal(ownsKey(sounding, '0:60', b), true);
    assert.equal(ownsKey(new Map(), '0:60', a), true, 'nothing recorded: release as before');
});
