import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackPitch } from '@chordinal/lib';
import { transcribe, readLive, tuningOffset, measureVibrato, guessKeys, noteStarts, clickGrid, freeNotes } from '@chordinal/lib';
import { RATE, record, notesOf, namesOf } from './audio-synth.js';

const near = (a, b, eps)=> assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('pitch track: a recorded sine is read to within a few cents', ()=>
{
    const s = record([{ beat: 0, beats: 2, key: 83.3 }], { tempo: 60, jitter: 0 });
    const voiced = trackPitch(s, RATE).filter(f => f.midi !== null);
    assert.ok(voiced.length > 150);
    near(voiced[Math.floor(voiced.length / 2)].midi, 83.3, 0.03);
});

test('tuning offset: a take sung 30 cents sharp is put back on the semitones', ()=>
{
    const frames = [80.3, 82.32, 84.28, 85.31].map(midi => ({ midi }));
    near(tuningOffset(frames), 0.3, 0.02);
});

test('transcribe: the Lanterns chorus sung sharp, at a slower, rough tempo, comes back exactly', ()=>
{
    const text = 'G5 Bb5 Eb6 | D6:2 Bb5 | C6 Eb6 G6 | G6:2 D6 | Eb6:1.5 C6:0.5 Ab5 | Bb5 G5 Bb5 | F6:2 D6 | Eb6:3';
    // sung at 66 bpm, the player thinks "about 70"; the song itself is 84
    const s = record(notesOf(text), { tempo: 66, cents: 28 });
    const t = transcribe(trackPitch(s, RATE), { tempo: 70 });
    near(t.tempo, 66, 1);
    near(t.offset, 0.28, 0.05);
    assert.equal(namesOf(t.notes, { beatsPerBar: 3, flats: true }), text);
});

test('transcribe: repeated notes split where they are tongued, and held ones stay whole', ()=>
{
    const text = 'G5:0.5 G5:0.5 G5 E5:2 | C5 C5 C5:2';
    const s = record(notesOf(text), { tempo: 80 });
    const t = transcribe(trackPitch(s, RATE), { tempo: 80 });
    assert.equal(namesOf(t.notes), text);
});

test('transcribe: vibrato is found on the notes that have it, centred, not split into notes', ()=>
{
    const notes = notesOf('G5 B5 D6:2 | C6:2 B5:2');
    notes[2].vibrato = { rate: 6, depth: 0.45 };
    notes[4].vibrato = { rate: 5.5, depth: 0.3 };
    const s = record(notes, { tempo: 72, cents: -15 });
    const t = transcribe(trackPitch(s, RATE), { tempo: 72 });
    assert.equal(namesOf(t.notes), 'G5 B5 D6~:2 | C6:2 B5~:2');
    near(t.notes[2].vibrato.rate, 6, 0.5);
    near(t.notes[2].vibrato.depth, 0.45, 0.1);
    near(t.notes[2].cents, 0, 10);
});

test('vibrato: a straight note, jitter, or a slow drift is not vibrato', ()=>
{
    const fps = 100;
    let s = 3;
    const rand = ()=> (s = (s * 16807) % 2147483647) / 2147483647;
    assert.equal(measureVibrato(Array.from({ length: 80 }, ()=> 72 + (rand() - 0.5) * 0.08), fps), null);
    assert.equal(measureVibrato(Array.from({ length: 80 }, (_, i)=> 72 + i * 0.01), fps), null);
    const wobble = measureVibrato(Array.from({ length: 80 }, (_, i)=> 72 + 0.3 * Math.sin(2 * Math.PI * 6.5 * i / fps)), fps);
    near(wobble.rate, 6.5, 0.4);
    near(wobble.depth, 0.3, 0.03);
});

test('keys: a tune ending at home is heard in its key, major or minor', ()=>
{
    const eb = notesOf('Eb5 F5 G5 Bb5 | C6 Bb5 G5 F5 | Ab5 G5 F5 D5 | Eb5:4');
    assert.deepEqual([guessKeys(eb)[0].key, guessKeys(eb)[0].mode], ['Eb', 'major']);
    const am = notesOf('A5 C6 D6 E6 | F6 E6 D6 C6 | B5 G#5 A5:2');
    assert.deepEqual([guessKeys(am)[0].key, guessKeys(am)[0].mode], ['A', 'minor']);
});

test('transcribe: a legato line with no breaks between notes is split by its pitch changes', ()=>
{
    const text = 'D5:0.5 E5:0.5 F5:0.5 G5:0.5 A5 F5 | E5:1.5 C5:0.5 D5:2';
    const notes = notesOf(text).map(n => ({ ...n, gap: 0 }));
    const s = record(notes, { tempo: 90, cents: 12 });
    const t = transcribe(trackPitch(s, RATE), { tempo: 88 });
    assert.equal(namesOf(t.notes), text);
});

test('transcribe: triplets come back as thirds of a beat, among straight 8ths, and read back to whole beats', ()=>
{
    const text = 'Db5:1/3 Eb5:1/3 F5:1/3 Gb5 Ab5:0.5 Gb5:0.5 F5:1/3 Eb5:1/3 Db5:1/3 | Ab5:2 r:2/3 F5:1/3 Db5';
    const s = record(notesOf(text), { tempo: 70 });
    const t = transcribe(trackPitch(s, RATE), { tempo: 70 });
    assert.equal(namesOf(t.notes, { flats: true }), text);
    assert.deepEqual(notesOf(text).map(n => Math.round(n.beat * 1e9) / 1e9).filter(Number.isInteger), [0, 1, 2, 3, 4, 7]);
});

test('transcribe: short staccato notes, much shorter than their 8th, are kept', ()=>
{
    const text = 'C5:0.5 E5:0.5 G5:0.5 C6:0.5 B5:0.5 G5:0.5 E5 | D5:0.5 F5:0.5 A5:0.5 G5:0.5 C5:2';
    // each note sounds for about 0.1 s of its 0.43 s
    const notes = notesOf(text).map(n => ({ ...n, gap: n.beats * 60 / 70 - 0.1 }));
    const t = transcribe(trackPitch(record(notes, { tempo: 70 }), RATE), { tempo: 70 });
    assert.deepEqual(t.notes.map(n => n.key), notes.map(n => n.key));
});

test('click grid: a take recorded against a click keeps its bar lines, through latency and a player behind the beat', ()=>
{
    // a bar of count-in at 90 bpm, then the tune, sung 70 ms late (the click reaching the ear, the voice the mic)
    const text = 'D6 B5 A5 G5 | B5:2 G5:0.5 E5:0.5 G5 | C6 E6 G6 E6 | F#6:2 D6:2';
    const count = 4 * 60 / 90;
    const notes = notesOf(text).map(n => ({ ...n, beat: n.beat + 4 + 0.07 * 90 / 60 }));
    const frames = trackPitch(record(notes, { tempo: 90, lead: 0 }), RATE);
    const grid = clickGrid(noteStarts(frames), 90, count);
    near(grid.origin, count + 0.07, 0.03);
    const t = transcribe(frames, { tempo: 90, grid });
    assert.equal(namesOf(t.notes), text);
});

test('free notes: notes sung with no beat come back in order, glides dropped, repeats split where tongued', ()=>
{
    const s = record(notesOf('D5 F#5:2 A5:0.5 A5:0.5 | D6:3'), { tempo: 110, cents: -20 });
    const notes = freeNotes(trackPitch(s, RATE));
    assert.deepEqual(notes.map(n => n.key), [74, 78, 81, 81, 86]);
    near(notes[1].seconds, 2 * 60 / 110, 0.12);
    assert.ok(notes.every((n, i)=> i === 0 || n.time >= notes[i - 1].time + notes[i - 1].seconds - 1e-9));
});

test('live reading: a take read a little at a time, as it is recorded, gives the notes sung up to a beat behind', ()=>
{
    const text = 'D6 B5 A5 G5 | B5:2 G5:0.5 E5:0.5 G5 | C6 E6 G6 E6 | F#6:2 D6:2 | D6 E6 G6 B6 | A6:1.5 G6:0.5 E6 D6 | B5 D6 E6 G5 | A5:4';
    const count = 4 * 60 / 90;
    const notes = notesOf(text).map(n => ({ ...n, beat: n.beat + 4 + 0.05 * 90 / 60 }));
    const frames = trackPitch(record(notes, { tempo: 90, lead: 0, cents: 20 }), RATE);
    const offset = tuningOffset(frames);
    const behind = 60 / 90;
    let live = null;
    const seen = [];
    for (let now = count + 0.25; now <= frames.at(-1).time; now += 0.25)
    {
        const upTo = now - behind;
        live = readLive(live, frames.filter(f => f.time < now), { tempo: 90, downbeat: count, upTo, offset });
        seen.push(live?.notes.length ?? 0);
    }
    assert.ok(live.fixed);
    near(live.grid.origin, count + 0.05, 0.03);
    // every note but the last, still held when the take ends
    assert.equal(namesOf(live.notes), text.replace(/ \| A5:4$/, ''));
    // notes once given stay given: the count never goes down
    assert.ok(seen.every((n, i)=> i === 0 || n >= seen[i - 1] - 1));
});
