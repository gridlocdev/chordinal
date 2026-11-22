import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessChords, chordVocabulary, chordKey, nameChord } from '@chordinal/lib';
import { trackPitch } from '@chordinal/lib';
import { transcribe, guessKeys, freeNotes } from '@chordinal/lib';
import { parseChord, pitchClass } from '@chordinal/lib';
import { RATE, whistle, notesOf } from './whistle-synth.js';

/** chords as text: a symbol, and its length in bars after ':' when it isn't one */
const symbols = (list, beatsPerBar = 4)=> list.map(c => c.symbol + (c.beats === beatsPerBar ? '' : `:${Math.round(c.beats / beatsPerBar * 1000) / 1000}`)).join(' ');
const chords = (text, key, mode, beatsPerBar = 4)=>
    symbols(guessChords(notesOf(text), { tonic: pitchClass(key), mode, beatsPerBar }), beatsPerBar);

test('chords: every chord in the vocabulary parses in its mode', ()=>
{
    for (const mode of ['major', 'minor', 'dorian', 'mixolydian'])
        for (const [symbol] of chordVocabulary(mode)) assert.doesNotThrow(()=> parseChord(symbol, 0, mode), `${symbol} in ${mode}`);
});

test('chords: one arpeggio a bar is one chord a bar', ()=>
{
    assert.equal(chords('C5 E5 G5 C6 | A4 C5 E5 A5 | F5 A5 C6 A5 | G5 B5 D6 B5', 'C', 'major'), 'I vi IV V');
});

test('chords: the changes are found, held chords stay whole and quick ones split the bar', ()=>
{
    assert.equal(chords('C5 E5 G5 C6 | G5 E5 G5 E5 | F5 A5 G5 B5 | C6 G5 E5 C5', 'C', 'major'), 'I:2 IV:0.5 V:0.5 I');
});

test('chords: an arpeggio that starts on the third is an inversion; a 7th whistled is a 7th chord', ()=>
{
    assert.equal(chords('G5 B5 D6 G6 | F#5 A5 D6 F#6 | E5 G5 B5 E6 | D5 F#5 A5 C6', 'G', 'major'), 'I V/7 vi V7');
    // starting on the fifth is just the chord: whistlers start there for range
    assert.equal(chords('D5 G5 B5 D6 | C6 E6 G6 E6', 'G', 'major'), 'I IV');
});

test('chords: minor keys, with the raised 7th making a major V', ()=>
{
    assert.equal(chords('A5 C6 E6 A6 | D6 F6 A6 F6 | E6 G#6 B6 G#6 | A6 E6 C6 A5', 'A', 'minor'), 'i iv V i');
});

test('chords: each chord comes with its runners-up', ()=>
{
    const out = guessChords(notesOf('C5 E5 G5 E5 | A4 C5 E5 C5'), { tonic: 0, mode: 'major' });
    assert.equal(out.length, 2);
    assert.equal(out[0].others.length, 3);
    assert.ok(out[0].others.every(o => o.score <= out[0].score));
});

test('chords: a whistled waltz arpeggio take, from audio to progression', ()=>
{
    // Lanterns on the Lake's chorus chords, one arpeggio a bar in 3/4, whistled sharp and a little loose
    const text = 'Eb5 G5 Bb5 | D5 F5 Bb5 | C5 Eb5 G5 | G5 Bb5 D6 | Ab5 C6 Eb6 | G5 Bb5 Eb6 | Bb4 D5 Ab5 | Eb5 G5 Bb5';
    const s = whistle(notesOf(text), { tempo: 100, cents: 20 });
    const t = transcribe(trackPitch(s, RATE), { tempo: 96 });
    const key = guessKeys(t.notes)[0];
    assert.deepEqual([key.key, key.mode], ['Eb', 'major']);
    assert.equal(symbols(guessChords(t.notes, { tonic: key.tonic, mode: key.mode, beatsPerBar: 3 }), 3), 'I V/7 vi iii IV I/3 V7 I');
});

test('chords: 8th-note arpeggios up and down, a borrowed iv, and a held maj7 with its 7th in every bar', ()=>
{
    const e = (s)=> s.split(' ').map(d => `${d}:0.5`).join(' ');
    assert.equal(chords(`${e('D5 F#5 A5 D6 A5 F#5 D5 F#5')} | ${e('B4 D5 F#5 B5 F#5 D5 B4 D5')} | ${e('E5 G5 B5 E6 B5 G5 E5 G5')} | ${e('A4 C#5 E5 A5 E5 C#5 A4 C#5')}`, 'D', 'major'), 'I vi ii V');
    assert.equal(chords('F5 A5 C6 A5 | Bb5 Db6 F6 Db6 | F5:4', 'F', 'major'), 'I iv I');
    assert.equal(chords('C5 E5 G5 B5 | E5 G5 B5 C6 | F5 A5 C6 A5 | G5 B5 D6 B5', 'C', 'major'), 'Imaj7:2 IV V');
});

test('chords: the chords settle the key when the notes alone could be either of two relative keys', ()=>
{
    const e = (s)=> s.split(' ').map(d => `${d}:0.5`).join(' ');
    const notes = notesOf(`${e('G5 B5 D6 G6 D6 B5 G5 B5')} | ${e('E5 G5 B5 E6 B5 G5 E5 G5')} | ${e('C6 E6 G6 E6 C6 E6 G6 E6')} | ${e('D5 F#5 A5 D6 A5 F#5 D5 F#5')}`);
    const { key, chords } = chordKey(notes, guessKeys(notes));
    assert.deepEqual([key.key, key.mode, symbols(chords)], ['G', 'major', 'I vi IV V']);
});

test('chords: a tune is harmonised a chord a bar or half bar, with no slash basses from its first note', ()=>
{
    const harmonise = (text, key, mode, beatsPerBar = 4)=>
        symbols(guessChords(notesOf(text), { tonic: pitchClass(key), mode, beatsPerBar, melody: true }), beatsPerBar);
    assert.equal(harmonise('C5 D5 E5 G5 | E5:2 C5:2', 'C', 'major'), 'I:2');
    // passing notes (the Ds of bar 1) don't pull a chord in, and a bar of one repeated note takes the chord that leads home
    assert.equal(harmonise('E5 D5 C5 D5 | E5 E5 E5:2 | D5 D5 D5:2 | E5 G5 G5:2 | E5 D5 C5 D5 | E5 E5 E5 E5 | D5 D5 E5 D5 | C5:4', 'C', 'major'), 'I:2 V I:3 V I');
});

test('chords: a chord whistled freely for a stretch is named from how long each note was held', ()=>
{
    // no beat to it: a loose arpeggio at an unrelated tempo, notes of uneven length
    const whistled = (text, tempo = 133)=> freeNotes(trackPitch(whistle(notesOf(text), { tempo, cents: 15 }), RATE));
    const name = (text, key = 'C', mode = 'major')=> nameChord(whistled(text), { tonic: pitchClass(key), mode }).symbol;
    assert.equal(name('C5 E5:1.5 G5:0.5 C6 G5'), 'I');
    assert.equal(name('A4 C5 E5:2 A5'), 'vi');
    assert.equal(name('E5 G5 C6:2'), 'I/3');               // the lowest note first, on the third: an inversion
    assert.equal(name('G4 C5:2 E5 G5'), 'I');              // on the fifth: just the chord
    assert.equal(name('G4 B4 D5 F5:2'), 'V7');
    assert.equal(name('A5 C6 E6 A6', 'A', 'minor'), 'i');
    const read = nameChord(whistled('F5 A5 C6 A5'), { tonic: 0, mode: 'major' });
    assert.equal(read.symbol, 'IV');
    assert.equal(read.others.length, 3);
    assert.equal(nameChord([], { tonic: 0, mode: 'major' }), null);
});

test('chords: a bar of 7/8 or 5/8 ends between beats, and the chords still tile the take', ()=>
{
    for (const bpb of [3.5, 2.5])
        for (const melody of [false, true])
        {
            // C E G under the first bar, F A C under the second
            const notes = [[0, 60], [1, 64], [2, 67], [bpb, 65], [bpb + 1, 69], [bpb + 2, 72]].map(([beat, key])=> ({ beat, beats: 0.5, key }));
            const chords = guessChords(notes, { tonic: 0, mode: 'major', beatsPerBar: bpb, melody });
            assert.equal(chords[0].beat, 0);
            assert.equal(chords.at(-1).beat + chords.at(-1).beats, 2 * bpb);
            for (let i = 1; i < chords.length; i++) assert.equal(chords[i].beat, chords[i - 1].beat + chords[i - 1].beats);
        }
});
