import test from 'node:test';
import assert from 'node:assert/strict';
import { heldAt } from '../../src/daw/player.js';

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
