// The shared delay's echoes are a dotted eighth at the tempo playing, so its time follows each tempo change
// (through a ramp, a change per beat), not only the song's first tempo.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { delayTimes, type DelayTime } from '@chordinal/playback';

const round = (list: DelayTime[]) => list.map((d) => [d.beat, Math.round(d.seconds * 1000)]);

test('one tempo: one delay time, a dotted eighth', () => {
  assert.deepEqual(round(delayTimes([{ beat: 0, bpm: 120 }])), [[0, 375]]);
});

test('a tempo change halfway changes the delay time there', () => {
  assert.deepEqual(
    round(
      delayTimes([
        { beat: 0, bpm: 120 },
        { beat: 16, bpm: 90 },
      ]),
    ),
    [
      [0, 375],
      [16, 500],
    ],
  );
});

test('through a ramp the delay time moves a beat at a time', () => {
  const list = delayTimes([
    { beat: 0, bpm: 120, to: 60 },
    { beat: 4, bpm: 60 },
  ]);
  assert.deepEqual(
    list.map((d) => d.beat),
    [0, 1, 2, 3, 4],
  );
  for (const [i, d] of list.entries())
    if (i) assert.ok(d.seconds > list[i - 1]!.seconds, 'slower, longer echoes');
});

test('a very slow tempo keeps the delay within the four seconds it can hold', () => {
  assert.equal(delayTimes([{ beat: 0, bpm: 10 }])[0]?.seconds, 4);
});
