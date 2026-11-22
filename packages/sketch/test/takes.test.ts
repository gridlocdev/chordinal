import { test } from 'vitest';
import assert from 'node:assert/strict';
import { cut } from '@chordinal/sketch';

test('takes: cutting a stretch out of a chord leaves nothing, one piece or two', () => {
  const c = { beat: 0, beats: 8, symbol: 'I' };
  assert.deepEqual(cut(c, 8, 12), [c]);
  assert.deepEqual(cut(c, 0, 8), []);
  assert.deepEqual(cut(c, 0, 4), [{ beat: 4, beats: 4, symbol: 'I' }]);
  assert.deepEqual(cut(c, 2, 4), [
    { beat: 0, beats: 2, symbol: 'I' },
    { beat: 4, beats: 4, symbol: 'I' },
  ]);
});
