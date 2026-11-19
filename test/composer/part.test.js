// composePart: one part over a stretch of bars, for Chordinal's Generate Part… (Chordinal PRD §8).
import test from 'node:test';
import assert from 'node:assert/strict';
import { composePart, romanFor, progressionOver, styleName, PARTS } from '../../src/composer/part.js';
import { parseChord, chordPitchClasses } from '../../src/lib/music-theory.js';

const A_MINOR = [9, 0, 4], F_MAJOR = [5, 9, 0], G7 = [7, 11, 2, 5];
const request = (more = {})=> ({ part: 'bass', style: 'feeling:hopeful', seed: 'ab12', tempo: 110, meter: '4/4', tonic: 0, mode: 'major', bars: 4, ...more });

test('a chord\'s tones spell the numeral that parses back to them, in the key\'s mode', ()=>
{
    const cases = [[A_MINOR, 0, 'major', 'vi'], [G7, 0, 'major', 'V7'], [[10, 2, 5], 0, 'major', 'bVII'], [[11, 2, 5, 9], 0, 'major', 'viiø'],
        [[8, 0, 3], 9, 'minor', 'VII/I'], [[4, 8, 11], 9, 'minor', 'V'], [[0, 4, 7, 11], 0, 'major', 'Imaj7'], [[2, 7, 9], 2, 'major', 'Isus4'], [[8, 0, 3], 0, 'minor', 'VI']];
    for (const [tones, tonic, mode, want] of cases)
    {
        const got = romanFor(tones, tonic, mode);
        assert.equal(got, want, `${tones} in ${tonic} ${mode}`);
        assert.deepEqual(chordPitchClasses(parseChord(got, tonic, mode)).sort(), [...tones].sort(), `${got} parses back`);
    }
});

test('the chords over a range become a progression in bars, gaps held by the chord before', ()=>
{
    const chords = [{ beat: 2, beats: 4, tones: A_MINOR }, { beat: 8, beats: 6, tones: F_MAJOR }, { beat: 40, beats: 4, tones: G7 }];
    assert.equal(progressionOver(chords, { from: 0, to: 16 }, 4, 0, 'major'), 'vi:2 IV:2');
    assert.equal(progressionOver(chords, { from: 16, to: 32 }, 4, 0, 'major'), null);
});

test('every part comes out, the same each time for the same request, over the range and no further', ()=>
{
    for (const part of Object.keys(PARTS))
    {
        const a = composePart(request({ part })), b = composePart(request({ part }));
        assert.ok(a.ok, `${part}: ${!a.ok && a.message}`);
        assert.ok(a.notes.length > 0, part);
        assert.equal(a.beats, 16);
        assert.ok(a.notes.every(n => n.beat >= 0 && n.beat + n.beats <= 16 + 1e-9), `${part} stays in the range`);
        assert.deepEqual(a, b, `${part} is deterministic`);
    }
    assert.deepEqual(composePart(request({ part: 'drums' })).instrument.bank >= 128, true, 'drums play a kit');
    assert.notDeepEqual(composePart(request()).notes, composePart(request({ seed: 'zz99' })).notes, 'another seed, another part');
});

test('a part follows the chords it is given: the bass starts each chord on its root', ()=>
{
    const r = composePart(request({ chords: [{ beat: 0, beats: 8, tones: A_MINOR, name: 'Am' }, { beat: 8, beats: 8, tones: F_MAJOR, name: 'F' }] }));
    assert.ok(r.ok);
    assert.deepEqual(r.chords.map(c => c.name), ['Am', 'F']);
    for (const [at, root] of [[0, 9], [8, 5]])
    {
        const first = r.notes.filter(n => n.beat >= at && n.beat < at + 1).sort((a, b)=> a.beat - b.beat)[0];
        assert.equal(first.key % 12, root, `the bass at beat ${at}`);
    }
});

test('with no chords the composer writes its own, and gives them back for the chord track', ()=>
{
    const r = composePart(request({ part: 'melody' }));
    assert.ok(r.ok && r.chords.length > 0);
    assert.equal(r.chords[0].beat, 0);
    assert.ok(r.chords.every(c => c.tones.length >= 3));
});

test('a style that cannot write a part in the meter says so', ()=>
{
    const r = composePart(request({ part: 'drums', style: 'genre:classical', meter: '7/8' }));
    assert.deepEqual(r, { ok: false, message: 'Classical can\'t write drums in 7/8.' });
    assert.equal(composePart(request({ meter: '11/16' })).ok, false, 'a meter the composer has no table for');
    assert.equal(styleName('genre:lo-fi-hip-hop'), 'Lo fi hip hop');
});
