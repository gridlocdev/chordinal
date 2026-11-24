import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackPitch, guardOctaves, finishFrames } from '@chordinal/lib';

const hz = (midi)=> 440 * 2 ** ((midi - 69) / 12);

/** a held tone at `key`: a sine, or a voice-like buzz of harmonics falling off as 1/n, with a little noise */
function tone(key, { rate = 48000, seconds = 1, harmonics = 1, seed = 1 } = {})
{
    const out = new Float32Array(Math.round(seconds * rate));
    let s = seed;
    const rand = ()=> (s = (s * 16807) % 2147483647) / 2147483647;
    const f = hz(key);
    for (let i = 0; i < out.length; i++)
    {
        let x = 0;
        for (let n = 1; n <= harmonics && n * f < rate / 2; n++) x += Math.sin(2 * Math.PI * n * f * i / rate) / n;
        out[i] = 0.4 * x + 0.005 * (rand() * 2 - 1);
    }
    return out;
}

/** the middle pitch of the frames that have one */
function heard(frames)
{
    const voiced = frames.filter(f => f.midi !== null).map(f => f.midi).sort((a, b) => a - b);
    assert.ok(voiced.length > frames.length * 0.9, `only ${voiced.length} of ${frames.length} frames have a pitch`);
    return voiced[voiced.length >> 1];
}

const near = (a, b, eps = 0.05)=> assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

for (const [name, key] of [['low (A1, 55 Hz)', 33], ['low (C3)', 48], ['middle (A4)', 69], ['high (B6)', 95], ['very high (B7)', 107]])
{
    test(`pitch track: a ${name} sine is read to within a few cents`, ()=>
    {
        near(heard(trackPitch(tone(key), 48000)), key, key > 100 ? 0.1 : 0.05);
    });
}

for (const [name, key] of [['bass voice (E2)', 40], ['tenor voice (A3)', 57], ['soprano voice (E5)', 76]])
{
    test(`pitch track: a ${name}, rich in harmonics, is read at its fundamental, not a harmonic`, ()=>
    {
        near(heard(trackPitch(tone(key, { rate: 44100, harmonics: 12 }), 44100)), key);
    });
}

test('pitch track: works at the sample rates audio files come in', ()=>
{
    for (const rate of [22050, 44100, 48000, 96000]) near(heard(trackPitch(tone(45, { rate, seconds: 0.5 }), rate)), 45);
});

test('pitch track: a take tracked in pieces raw and finished together comes out as the whole does', ()=>
{
    const rate = 48000, s = new Float32Array(rate);
    s.set(tone(50, { rate, seconds: 0.5 }), 0);
    s.set(tone(74, { rate, seconds: 0.4 }), rate / 2);
    const whole = trackPitch(s, rate);
    const pieces = [];
    let next = 0;
    for (const end of [12000, 25000, 31234, rate])
    {
        const from = next * 480, part = trackPitch(s.subarray(from, end), rate, { raw: true });
        for (const f of part) f.time += from / rate;
        pieces.push(...part);
        next += part.length;
    }
    const finished = finishFrames(pieces);
    // the whole reaches a little further into the end: the frames left for the last piece
    assert.equal(finished.length, whole.length);
    for (let i = 0; i < whole.length; i++)
    {
        near(finished[i].time, whole[i].time, 1e-9);
        assert.deepEqual({ ...finished[i], time: 0 }, { ...whole[i], time: 0 });
    }
});

test('octave guard: a frame an octave off from both sides is put back, a real leap stays', ()=>
{
    const frames = (keys)=> keys.map(midi => ({ midi }));
    const slip = guardOctaves(frames([60, 60, 60, 60, 72, 60, 60, 60, 60])).map(f => f.midi);
    assert.deepEqual(slip, [60, 60, 60, 60, 60, 60, 60, 60, 60]);
    const under = guardOctaves(frames([55, 55, 55, 43.1, 43, 55, 55, 55])).map(f => f.midi);
    assert.deepEqual(under.map(Math.round), [55, 55, 55, 55, 55, 55, 55, 55]);
    const leap = guardOctaves(frames([60, 60, 60, 60, 72, 72, 72, 72])).map(f => f.midi);
    assert.deepEqual(leap, [60, 60, 60, 60, 72, 72, 72, 72]);
    const rests = guardOctaves(frames([null, 60, 60, null, 72, null, 60, 60, 60])).map(f => f.midi);
    assert.deepEqual(rests, [null, 60, 60, null, 72, null, 60, 60, 60]);
});

test('pitch track: the recording click, a tick of high-passed noise, is not read as a note', ()=>
{
    const rate = 48000, s = new Float32Array(rate * 2);
    let seed = 7, prev = 0, last = 0;
    const rand = ()=> (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let beat = 0; beat < 4; beat++)
    {
        const at = beat * rate / 2, a = Math.exp(-2 * Math.PI * (beat ? 2000 : 900) / rate);
        for (let i = 0; i < rate * 0.04; i++)
        {
            // white noise through a one-pole high-pass, fading out over the tick
            const x = rand() * 2 - 1;
            last = a * (last + x - prev);
            prev = x;
            s[at + i] = 0.6 * last * Math.exp(-i / (rate * 0.008));
        }
    }
    const voiced = trackPitch(s, rate).filter(f => f.midi !== null);
    assert.ok(voiced.length <= 1, `${voiced.length} frames read as notes: ${voiced.map(f => f.midi.toFixed(1))}`);
});
