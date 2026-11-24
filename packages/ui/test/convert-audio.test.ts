// Convert Audio Again (PRD §9.3): a clip read from audio keeps that audio while its project is open, and reads it again
// with another grid, snapped to the key or with another sensitivity, as one undo step.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { emptyProject, makeTrack, addTrack, addClip, history } from '@chordinal/daw';
import type { Project } from '@chordinal/daw';
import { CONVERT_DEFAULTS } from '@chordinal/sketch';
import { hist, project, saved, selectedClip } from '../src/store.ts';
import { undo, newProject } from '../src/document.ts';
import { placeAudio, convertAgain, convertChoices, sourceOf } from '../src/recording.ts';

globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};

const RATE = 22050,
  TEMPO = 120;

/** a made-up take at 120 bpm from a downbeat at 0.5 s: each note a tongued sine, `cents` sharp */
function sung(notes: { key: number; beats: number; cents?: number }[]): Float32Array {
  const spb = 60 / TEMPO,
    total = notes.reduce((s, n) => s + n.beats, 0);
  const out = new Float32Array(Math.ceil((0.5 + total * spb + 0.3) * RATE));
  let t = 0.5,
    phase = 0;
  for (const n of notes) {
    const hz = 440 * 2 ** ((n.key + (n.cents ?? 0) / 100 - 69) / 12);
    const a = Math.round(t * RATE),
      b = Math.round((t + n.beats * spb - 0.04) * RATE);
    for (let i = a; i < b; i++) {
      phase += (2 * Math.PI * hz) / RATE;
      out[i] = 0.5 * Math.min(1, (i - a) / 200, (b - i) / 200) * Math.sin(phase);
    }
    t += n.beats * spb;
  }
  return out;
}

/** a project in C major with one track, t1 */
function setUp(): void {
  let p: Project = { ...emptyProject({ bars: 8 }), key: { tonic: 0, mode: 'major' } };
  p = addTrack(p, { ...makeTrack(p, { name: 'Melody' }), id: 't1' });
  hist.value = history(p);
  convertChoices.value = { ...CONVERT_DEFAULTS };
}

const keysOf = (clip: string) =>
  project.value.tracks[0]?.clips.find((c) => c.id === clip)?.notes.map((n) => n.key);

const audio = (samples: Float32Array) => ({
  samples,
  rate: RATE,
  tempo: TEMPO,
  meter: '4/4',
  downbeat: 0.5,
  label: 'the take',
});

test('a clip read from audio is read again snapped to the key, and Undo takes it back', () => {
  setUp();
  // C, then a C# sung sharp (D, off the key), then E
  const clip = placeAudio(
    't1',
    4,
    audio(
      sung([
        { key: 60, beats: 1 },
        { key: 61, beats: 1, cents: 30 },
        { key: 64, beats: 2 },
      ]),
    ),
  );
  assert.ok(clip);
  assert.deepEqual(selectedClip.value, { track: 't1', clip });
  assert.deepEqual(keysOf(clip), [60, 61, 64]);
  assert.ok(sourceOf('t1', clip));
  convertAgain('t1', clip, { ...convertChoices.value, snap: true });
  assert.deepEqual(keysOf(clip), [60, 62, 64]);
  // the choice sticks for the next audio
  assert.equal(convertChoices.value.snap, true);
  undo();
  assert.deepEqual(keysOf(clip), [60, 61, 64]);
});

test('a clip read again on another grid, growing by whole bars when it needs to', () => {
  setUp();
  const runs = [72, 74, 76, 77].map((key) => ({ key, beats: 0.25 }));
  const clip = placeAudio('t1', 0, audio(sung([...runs, { key: 72, beats: 3 }])), undefined);
  convertAgain('t1', clip, { ...convertChoices.value, grid: '16ths' });
  const c = project.value.tracks[0]?.clips.find((x) => x.id === clip);
  assert.deepEqual(
    c?.notes.map((n) => [n.beat, n.beats, n.key]),
    [
      [0, 0.25, 72],
      [0.25, 0.25, 74],
      [0.5, 0.25, 76],
      [0.75, 0.25, 77],
      [1, 3, 72],
    ],
  );
  assert.equal(c?.beats, 4);
});

test('the audio goes with its project: another project, or the clip gone, leaves nothing to convert again', async () => {
  setUp();
  const clip = placeAudio('t1', 0, audio(sung([{ key: 67, beats: 2 }])));
  assert.ok(sourceOf('t1', clip));
  undo();
  assert.equal(sourceOf('t1', clip), null);
  // the same clip id in a new project isn't the clip the audio was read into
  const again = placeAudio('t1', 0, audio(sung([{ key: 67, beats: 2 }])));
  assert.ok(sourceOf('t1', again));
  saved.value = project.value;
  await newProject();
  let p = addTrack(project.value, { ...makeTrack(project.value, { name: 'Melody' }), id: 't1' });
  p = addClip(p, 't1', { id: again, start: 0, beats: 4, notes: [] });
  hist.value = history(p);
  assert.equal(sourceOf('t1', again), null);
});
