import { test } from 'vitest';
import assert from 'node:assert/strict';
import { renderPauses } from '@chordinal/playback';

test('an offline render pauses only on whole blocks inside the render, each block once', () => {
  // whole-bar songs at 128 bpm plus a 3 s tail: lengths close to a multiple of 0.1 s used to pause past the end
  for (const rate of [44100, 48000])
    for (let bars = 1; bars <= 128; bars++) {
      const seconds = (bars * 4 * 60) / 128 + 3,
        length = Math.ceil(seconds * rate);
      const frames = renderPauses(seconds, rate, 0.1).map((t) => Math.round(t * rate));
      assert.ok(
        frames.every((f) => f % 128 === 0 && f > 0 && f < length),
        `${bars} bars at ${rate}`,
      );
      assert.equal(new Set(frames).size, frames.length);
      // never longer than a step and a block between pauses, so the player's lookahead always covers the gap
      [0, ...frames, length].forEach((f, i, all) => {
        if (i) assert.ok(f - all[i - 1]! <= 0.1 * rate + 2 * 128);
      });
    }
});
