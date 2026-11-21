// Automation lanes: keyframes a value moves through. Pure.
import type { Keyframe } from './project.ts';

/** a keyframed value at a beat, interpolated the way Web Audio ramps it */
export function valueAt(frames: Keyframe[], beat: number): number {
  const i = frames.findLastIndex((f) => f.beat <= beat);
  const a = frames[i < 0 ? 0 : i];
  if (!a) throw new TypeError('an automation lane needs a keyframe');
  if (i < 0) return a.value;
  const b = frames[i + 1];
  if (!b || b.curve === 'set' || b.beat <= a.beat) return a.value;
  const p = (beat - a.beat) / (b.beat - a.beat);
  return b.curve === 'exp' ? a.value * (b.value / a.value) ** p : a.value + (b.value - a.value) * p;
}
