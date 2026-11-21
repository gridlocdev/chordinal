import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  KEEP,
  LOOP_SPARE,
  SEAM,
  TARGET_RMS_DB,
  PEAK_DB,
  WINDOW,
  LAG,
  checkLoop,
  timingOf,
  cutRender,
  crossfadeSeam,
  loudnessGainDb,
  wav32,
  decodeWindow,
  lagOf,
  decodeProblem,
} from '../src/soundtrack.ts';
import type { SoundtrackScore } from '../src/soundtrack.ts';

/** a score at 120 bpm (half a second a beat): sections of `bars` bars in `beatsPerBar` */
function score(
  sections: { type: string; bars: number; beatsPerBar?: number }[],
  tempoMap: SoundtrackScore['tempoMap'] = [{ beat: 0, bpm: 120 }],
): SoundtrackScore {
  let beat = 0;
  const out = sections.map((s, i) => {
    const beatsPerBar = s.beatsPerBar ?? 4,
      beats = s.bars * beatsPerBar;
    const section = { type: s.type, label: `${s.type}${i}`, beat, beats, beatsPerBar };
    beat += beats;
    return section;
  });
  return { beats: beat, beatsPerBar: 4, tempoMap, sections: out };
}

const FORM = score([
  { type: 'intro', bars: 2 },
  { type: 'A', bars: 4 },
  { type: 'B', bars: 4 },
  { type: 'A', bars: 4 },
]);

test("a loop's times: its sections' first beats, KEEP into the file; a one-shot has an end instead", () => {
  const t = timingOf(FORM, [1, 3], false);
  assert.equal(t.offset, KEEP);
  assert.deepEqual(t.loop, { start: KEEP + 4, end: KEEP + 20 }); // bars 2 and 10, at 2 s a bar
  assert.equal(t.end, null);
  assert.equal(t.cut, 0);
  assert.equal(t.bars, null);
  const once = timingOf(FORM, null, false);
  assert.equal(once.loop, null);
  assert.equal(once.end, KEEP + 28);
});

test('a trimmed track starts at its loop', () => {
  const t = timingOf(FORM, [1, 3], true);
  assert.equal(t.cut, 4);
  assert.deepEqual(t.loop, { start: KEEP, end: KEEP + 16 });
});

test('a change of meter lists every bar line to the loop end, the end among them', () => {
  const s = score([
    { type: 'intro', bars: 1 },
    { type: 'A', bars: 2, beatsPerBar: 3 },
    { type: 'A', bars: 1 },
  ]);
  const t = timingOf(s, [1, 2], false);
  // bars at beats 0, 4, 7 and the loop's end at 10: half a second a beat
  assert.deepEqual(t.bars, [KEEP, KEEP + 2, KEEP + 3.5, KEEP + 5]);
  const trimmed = timingOf(s, [1, 2], true);
  assert.deepEqual(trimmed.bars, [KEEP, KEEP + 1.5, KEEP + 3]);
});

test("a ritardando moves a one-shot's end", () => {
  const slowing = score(
    [{ type: 'A', bars: 2 }],
    [
      { beat: 0, bpm: 120 },
      { beat: 4, bpm: 120, to: 60 },
      { beat: 8, bpm: 60 },
    ],
  );
  const end = timingOf(slowing, null, false).end;
  assert.ok(end !== null && end > KEEP + 4);
});

test('a loop must start and end on the same type of section, inside the form, at one tempo', () => {
  assert.doesNotThrow(() => checkLoop('ok', FORM, [1, 3]));
  assert.throws(() => checkLoop('t', FORM, [1, 2]), /ends on a B, but starts on a A/);
  assert.throws(() => checkLoop('t', FORM, [1, 4]), /doesn't fit the form's 4 sections/);
  assert.throws(() => checkLoop('t', FORM, [3, 1]), /doesn't fit/);
  const pushed = score(
    FORM.sections.map((s) => ({ type: s.type, bars: s.beats / 4 })),
    [
      { beat: 0, bpm: 120 },
      { beat: 24, bpm: 126 },
    ],
  );
  assert.throws(
    () => checkLoop('t', pushed, [1, 3]),
    /the tempo changes at beat 24, before the loop's end at beat 40/,
  );
  const ramp = score(
    [
      { type: 'A', bars: 1 },
      { type: 'A', bars: 1 },
    ],
    [{ beat: 0, bpm: 120, to: 130 }],
  );
  assert.throws(() => checkLoop('t', ramp, [0, 1]), /tempo changes at beat 0/);
});

test('the render is cut KEEP before the first beat and LOOP_SPARE after the loop end', () => {
  const rate = 100,
    leadIn = 0.25;
  const ramp = Float32Array.from({ length: 3000 }, (_, i) => i);
  const t = timingOf(FORM, [1, 3], false);
  const [left] = cutRender([ramp, ramp], rate, leadIn, t);
  assert.equal(left?.[0], Math.round((leadIn - KEEP) * rate));
  assert.equal(left?.length, Math.round((t.loop!.end + LOOP_SPARE) * rate));
  const trimmed = cutRender([ramp], rate, leadIn, timingOf(FORM, [1, 3], true))[0];
  assert.equal(trimmed?.[0], Math.round((leadIn - KEEP + 4) * rate));
  const once = cutRender([ramp], rate, leadIn, timingOf(FORM, null, false))[0];
  assert.equal(once?.length, 3000 - Math.round((leadIn - KEEP) * rate));
  assert.notEqual(once, ramp, 'a copy');
});

test("the seam fades the loop's last SEAM seconds into what comes before its start", () => {
  const rate = 1000,
    n = SEAM * rate;
  const d = new Float32Array(1000).fill(1);
  d.fill(0, 100 - n, 100); // just before the loop's start: silence
  crossfadeSeam([d], rate, { start: 0.1, end: 0.9 });
  assert.equal(d[900 - n - 1], 1, 'before the seam, untouched');
  assert.ok(Math.abs(d[900 - n]! - (1 - 1 / n)) < 1e-6, 'the fade starts');
  assert.equal(d[899], 0, 'ends on what precedes the loop start');
  assert.equal(d[900], 1, 'after the loop end, untouched');
});

test('loudness: to TARGET_RMS_DB, unless the peak would pass PEAK_DB', () => {
  const quiet = new Float32Array(1000).fill(0.01); // −40 dB RMS, so +20 dB, peak −20 dB
  assert.ok(Math.abs(loudnessGainDb([quiet]) - (TARGET_RMS_DB + 40)) < 1e-6);
  const spiky = new Float32Array(1000).fill(0.01);
  spiky[10] = 0.5; // a peak at −6 dB: only 5 dB of room
  assert.ok(Math.abs(loudnessGainDb([spiky]) - (PEAK_DB - 20 * Math.log10(0.5))) < 1e-6);
  const withSilence = new Float32Array(2000).fill(0.01);
  withSilence.fill(0, 1000);
  assert.ok(
    Math.abs(loudnessGainDb([withSilence]) - loudnessGainDb([quiet])) < 1e-6,
    'silence is not counted',
  );
});

test('a 32-bit float WAV: header, interleaved frames, the gain applied', () => {
  const bytes = wav32([Float32Array.of(0.5, -0.25), Float32Array.of(0.125, 1)], 44100, 2);
  const v = new DataView(bytes.buffer);
  const text = (o: number): string => String.fromCharCode(...bytes.subarray(o, o + 4));
  assert.equal(text(0), 'RIFF');
  assert.equal(text(8), 'WAVE');
  assert.equal(v.getUint16(20, true), 3);
  assert.equal(v.getUint16(22, true), 2);
  assert.equal(v.getUint32(24, true), 44100);
  assert.equal(v.getUint16(34, true), 32);
  assert.equal(v.getUint32(40, true), 16);
  assert.deepEqual([...new Float32Array(bytes.buffer, 44)], [1, 0.25, -0.5, 2]);
});

/** a seeded noise, so the cross-correlation has one clear best lag */
function noise(length: number, seed = 1): Float32Array {
  let s = seed;
  return Float32Array.from({ length }, () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647 - 0.5;
  });
}

test('the cross-correlation finds how far a decoded copy sits from the render, either way', () => {
  const sound = noise(4000);
  const ref = sound.subarray(1000, 2000);
  for (const shift of [0, 37, -52]) {
    // the decoded part starts at frame 500 of the render, so the ref sits at 500 into it, moved by `shift`
    const part = new Float32Array(3000);
    part.set(sound.subarray(500 - shift, 3500 - shift));
    assert.equal(lagOf(ref, part, 500, 100), shift);
  }
});

test("the decode check looks at the render's first sound, with LAG either side", () => {
  const left = new Float32Array(WINDOW * 3);
  left[20000] = 0.5;
  assert.deepEqual(decodeWindow(left), { onset: 20000, from: 20000 - LAG, count: LAG + WINDOW + LAG });
  const short = new Float32Array(1000);
  short[10] = 1;
  assert.deepEqual(decodeWindow(short), { onset: 0, from: 0, count: WINDOW + LAG });
  assert.equal(decodeWindow(new Float32Array(WINDOW * 3)).onset, 0, 'silence looks from the start');
});

test('a decoded file is out of step beyond 400 frames of shift or 64 of length', () => {
  assert.equal(decodeProblem(0, 0), null);
  assert.equal(decodeProblem(-400, 64), null);
  assert.match(decodeProblem(1105, 0) ?? '', /1105 frames/);
  assert.match(decodeProblem(0, -65) ?? '', /-65 frames longer/);
});
