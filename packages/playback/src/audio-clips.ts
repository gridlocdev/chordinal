// Plays an audio track's clips (Chordinal PRD §16): each one a buffer source at the file's own speed, through a gain
// that holds its fades, into the track's strip. A segment that starts partway through a clip starts it partway.
import type { AudioClip } from '@chordinal/daw';

/** a point of a clip's gain envelope: `ramp` glides there from the point before, else it is set at `at` */
export interface GainPoint {
  at: number;
  value: number;
  ramp: boolean;
}

/** how one clip plays in a stretch of playback: when it starts, from where in its file, for how long, and its gain */
export interface ClipPlan {
  when: number;
  offset: number;
  duration: number;
  gains: GainPoint[];
}

/**
 * clip c's plan, in audio time: `start` is when its first beat sounds, `from` when the stretch starts (a clip
 * already under way starts partway), `cut` when it must stop (a loop's end), if anywhere. Null when none of it sounds.
 */
export function clipPlan(c: AudioClip, start: number, from: number, cut = Infinity): ClipPlan | null {
  const end = start + c.seconds;
  const when = Math.max(start, from),
    stop = Math.min(end, cut);
  if (c.mute || c.seconds <= 0 || stop - when <= 1e-6) return null;
  const fadeInEnd = start + c.fadeIn,
    fadeOutStart = end - c.fadeOut;
  const at = (t: number) =>
    c.gain *
    Math.min(1, c.fadeIn > 0 ? (t - start) / c.fadeIn : 1, c.fadeOut > 0 ? (end - t) / c.fadeOut : 1);
  const gains: GainPoint[] = [{ at: when, value: Math.max(0, at(when)), ramp: false }];
  if (c.fadeIn > 0 && fadeInEnd > when && fadeInEnd < stop)
    gains.push({ at: fadeInEnd, value: c.gain, ramp: true });
  if (c.fadeOut > 0 && fadeOutStart > when && fadeOutStart < stop)
    gains.push({ at: fadeOutStart, value: at(fadeOutStart), ramp: false });
  if (c.fadeOut > 0 || c.fadeIn > 0) gains.push({ at: stop, value: Math.max(0, at(stop)), ramp: true });
  return { when, offset: c.offset + (when - start), duration: stop - when, gains };
}

/** starts a clip's plan on `buffer` into `out`; the source, so it can be stopped early */
export function playClip(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  plan: ClipPlan,
  out: AudioNode,
): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  for (const g of plan.gains)
    if (g.ramp) gain.gain.linearRampToValueAtTime(g.value, g.at);
    else gain.gain.setValueAtTime(g.value, g.at);
  src.connect(gain).connect(out);
  src.addEventListener('ended', () => gain.disconnect());
  src.start(plan.when, plan.offset, plan.duration);
  return src;
}
