// How an audio clip plays in a stretch of playback (Chordinal PRD §16): when it starts, from where in its file, for how
// long, and its gain through its fades, whole or partway through, and cut at a loop's end.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { clipPlan } from '@chordinal/playback';
import type { AudioClip } from '@chordinal/daw';

const clip = (c: Partial<AudioClip> = {}): AudioClip => ({
  id: 'a1',
  start: 0,
  file: 'take.wav',
  offset: 1,
  seconds: 4,
  gain: 0.5,
  fadeIn: 0,
  fadeOut: 0,
  ...c,
});

test('a whole clip plays from its offset for its length at its gain', () => {
  const plan = clipPlan(clip(), 10, 10);
  assert.deepEqual(plan, { when: 10, offset: 1, duration: 4, gains: [{ at: 10, value: 0.5, ramp: false }] });
});

test('a clip under way when playback starts plays from there in its file', () => {
  const plan = clipPlan(clip(), 10, 12.5);
  assert.equal(plan?.when, 12.5);
  assert.equal(plan?.offset, 3.5);
  assert.equal(plan?.duration, 1.5);
});

test('a clip over, muted or past a loop end does not play', () => {
  assert.equal(clipPlan(clip(), 10, 14), null);
  assert.equal(clipPlan(clip({ mute: true }), 10, 10), null);
  assert.equal(clipPlan(clip(), 10, 9, 10), null);
});

test('a loop end cuts a clip', () => {
  const plan = clipPlan(clip(), 10, 10, 12);
  assert.equal(plan?.duration, 2);
});

test('the fades rise from silence and fall to it, and start partway when playback does', () => {
  const plan = clipPlan(clip({ fadeIn: 1, fadeOut: 2 }), 10, 10);
  assert.deepEqual(plan?.gains, [
    { at: 10, value: 0, ramp: false },
    { at: 11, value: 0.5, ramp: true },
    { at: 12, value: 0.5, ramp: false },
    { at: 14, value: 0, ramp: true },
  ]);
  const late = clipPlan(clip({ fadeIn: 2 }), 10, 11);
  assert.deepEqual(late?.gains, [
    { at: 11, value: 0.25, ramp: false },
    { at: 12, value: 0.5, ramp: true },
    { at: 14, value: 0.5, ramp: true },
  ]);
  const cut = clipPlan(clip({ fadeOut: 2 }), 10, 10, 13);
  assert.deepEqual(cut?.gains.at(-1), { at: 13, value: 0.25, ramp: true });
});
