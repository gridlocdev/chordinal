// Edits to a list of notes, for a clip or the picked notes in the piano roll: quantize, humanize, scale and reverse.
// Pure: each returns new notes.
import type { Note } from './project.ts';

/** notes moved onto a grid (in beats), all the way or by a strength from 0 to 1, their ends too; none gets shorter than
 * a grid step, or than it was */
export function quantizeNotes<N extends Note>(notes: N[], grid: number, strength = 1): N[] {
  const on = (b: number) => Math.round(b / grid) * grid;
  return notes.map((n) => {
    const beat = Math.max(0, n.beat + (on(n.beat) - n.beat) * strength);
    const end = n.beat + n.beats,
      to = end + (on(end) - end) * strength;
    return { ...n, beat, beats: Math.max(Math.min(n.beats, grid), to - beat) };
  });
}

/** how loose humanizeNotes plays: up to `timing` beats early or late, and `velocity` softer or louder */
export interface HumanizeAmount {
  timing?: number;
  velocity?: number;
}

/** notes played a little looser: each moved by up to `timing` beats and its velocity by up to `velocity`, at random
 * (`random` gives 0..1, so a test can pass a fixed sequence) */
export function humanizeNotes<N extends Note>(
  notes: N[],
  { timing = 0.02, velocity = 8 }: HumanizeAmount = {},
  random: () => number = Math.random,
): N[] {
  const spread = (x: number) => (random() * 2 - 1) * x;
  return notes.map((n) => ({
    ...n,
    beat: Math.max(0, n.beat + spread(timing)),
    vel: Math.max(1, Math.min(127, Math.round(n.vel + spread(velocity)))),
  }));
}

/** notes played faster (k < 1) or slower (k > 1): their starts from `from` and their lengths scaled */
export const scaleNotes = <N extends Note>(notes: N[], k: number, from = 0): N[] =>
  notes.map((n) => ({ ...n, beat: from + (n.beat - from) * k, beats: n.beats * k }));

/** notes backwards over the stretch [from, to): a note ending at `to` starts at `from` */
export const reverseNotes = <N extends Note>(notes: N[], from: number, to: number): N[] =>
  notes
    .map((n) => ({ ...n, beat: Math.max(from, from + to - n.beat - n.beats) }))
    .sort((a, b) => a.beat - b.beat || a.key - b.key);
