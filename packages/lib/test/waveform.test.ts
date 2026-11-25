import { test } from 'vitest';
import assert from 'node:assert/strict';
import { waveformPeaks } from '@chordinal/lib';

test('each column holds the loudest sample of its part, either sign, across every channel', () => {
  const left = new Float32Array([0.1, -0.5, 0.2, 0.3, 0, 0, -0.9, 0.4]);
  const right = new Float32Array([0, 0, 0.6, 0, 0, 0, 0, 0]);
  assert.deepEqual(
    [...waveformPeaks([left, right], 0, 8, 4)].map((v) => +v.toFixed(2)),
    [0.5, 0.6, 0, 0.9],
  );
});

test('a stretch drawn wider than it is repeats its samples; a part past the end is 0', () => {
  const ch = new Float32Array([0.25, 0.75]);
  assert.deepEqual([...waveformPeaks([ch], 0, 2, 4)], [0.25, 0.25, 0.75, 0.75]);
  assert.deepEqual([...waveformPeaks([ch], 1, 4, 3)], [0.75, 0, 0]);
});

test('no columns or no audio gives an empty or silent waveform', () => {
  assert.equal(waveformPeaks([new Float32Array(4)], 0, 4, 0).length, 0);
  assert.deepEqual([...waveformPeaks([], 0, 4, 2)], [0, 0]);
});
