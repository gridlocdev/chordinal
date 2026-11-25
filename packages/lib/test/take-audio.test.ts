import assert from 'node:assert/strict';
import { test } from 'vitest';
import { takeSamples } from '@chordinal/lib';

const block = (time: number, ...v: number[]) => ({ samples: Float32Array.from(v), time });

test('a take is laid out by its blocks’ stamps from its start, a gap left silent', () => {
  // rate 10, from 0.3 s: a block at 0.6 s starts at sample 3
  const out = takeSamples([block(0.2, 1, 2, 3), block(0.6, 4, 5), block(1, 6)], 0.3, 10);
  assert.deepEqual([...out], [2, 3, 0, 4, 5, 0, 0, 6]);
});

test('what came before the take starts is left out, and nothing before it gives nothing', () => {
  assert.deepEqual([...takeSamples([block(0, 1, 2)], 1, 10)], []);
  assert.deepEqual([...takeSamples([], 0, 10)], []);
});
