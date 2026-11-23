// Ending a melody take (PRD §9.3): the playhead goes back to the start of the clip the take went into, or of the take
// when nothing was kept, and the take's live notes are cleared.
import { test, beforeEach } from 'vitest';
import assert from 'node:assert/strict';
import { emptyProject, makeTrack, addTrack, addClip, history } from '@chordinal/daw';
import type { Recording } from '@chordinal/playback';
import { hist, project, selected, selectedClip, beat, status } from '../src/store.ts';
import { recording, takeNotes, takeClock, finish } from '../src/recording.ts';
import type { RecordedKey, Take } from '../src/recording.ts';

globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};

beforeEach(() => {
  takeClock.now = () => 10;
  takeClock.latency = () => 0;
});

/** a recording at 120 bpm whose count-in ended at 0 s on the audio clock */
function rec(): Recording {
  return {
    kind: 'melody',
    tempo: 120,
    meter: '4/4',
    click: false,
    rate: 48000,
    beatSec: 0.5,
    bpb: 4,
    countBeats: 4,
    start: -2,
    origin: 0,
    buffer: new Float32Array(0),
    length: 0,
    frames: [],
    raw: [],
    nextFrame: 0,
    peak: 0,
    offset: 0,
    tune: { x: 0, y: 0 },
    seconds: 0,
    playhead: 0,
    countIn: 0,
    nextBeat: 0,
    notes: [],
    gridOrigin: null,
    firmedAt: 0,
    live: null,
    reading: null,
  };
}

/** a melody take on track t1 from `start`, with these keys played */
function take(start: number, played: RecordedKey[]): Take {
  return {
    track: 't1',
    start,
    rec: rec(),
    played,
    unhear: () => {},
    mic: false,
  };
}

/** a project with one track, t1, and a clip c1 over beats 4 to 12, selected */
function setUp(): void {
  let p = emptyProject({ bars: 8 });
  p = addTrack(p, { ...makeTrack(p, { name: 'Keys' }), id: 't1' });
  p = addClip(p, 't1', { id: 'c1', start: 4, beats: 8, notes: [] });
  hist.value = history(p);
  selected.value = 't1';
  selectedClip.value = { track: 't1', clip: 'c1' };
}

test('keys played from inside a clip go into it, and the playhead goes back to the start of that clip', async () => {
  setUp();
  recording.value = take(8, [
    { key: 60, on: true, time: 0, beat: 0 },
    { key: 60, on: false, time: 0.5, beat: 1 },
  ]);
  takeNotes.value = [{ beat: 8, beats: 1, key: 60, vel: 100 }];
  beat.value = 11;
  await finish();
  assert.equal(beat.value, 4);
  assert.deepEqual(takeNotes.value, []);
  const clip = project.value.tracks[0]?.clips.find((c) => c.id === 'c1');
  assert.deepEqual(
    clip?.notes.map((n) => [n.beat, n.beats, n.key]),
    [[4, 1, 60]],
  );
});

test('a take with nothing in it puts the playhead back where the take started', async () => {
  setUp();
  recording.value = take(16, []);
  beat.value = 23;
  status.value = '';
  await finish();
  assert.equal(beat.value, 16);
  assert.match(status.value, /No keys were played/);
});
