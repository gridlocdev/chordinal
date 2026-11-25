// Probability and swing as a clip plays (Chordinal PRD §17.6, §17.7): which notes play this pass, and where swung
// steps land. The written notes never change; the player, the exports and `chordinal render` all play through here,
// and a MIDI export writes the notes as written. Pure.
import { stepOf } from './steps.ts';
import type { Clip, Note, Project } from './project.ts';

/** the most swing a clip takes: the off step lands three quarters of the way through its pair */
export const MAX_SWING = 0.75;

/** a note's chance of playing, 0 to 1; none means it always plays */
export const chanceOf = (n: Note): number => (typeof n.chance === 'number' ? n.chance : 1);

/** a clip's swing, 0 to MAX_SWING; none means straight */
export const swingOf = (c: Pick<Clip, 'swing'>): number => Math.min(MAX_SWING, Math.max(0, c.swing ?? 0));

/** the clip with swing `swing`, kept to whole percents from 0 to MAX_SWING; straight leaves no swing on it */
export function withSwing(c: Clip, swing: number): Clip {
  const { swing: _swing, ...rest } = c,
    s = Math.round(Math.min(MAX_SWING, Math.max(0, swing)) * 100) / 100;
  return s > 0 ? { ...rest, swing: s } : rest;
}

/** a number from 0 to 1 fixed by `text` (FNV-1a, then a mix so close texts land far apart) */
function roll(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

/** whether a note of clip `c` plays on loop pass `pass`: fixed by the clip's pattern (or the clip), the note, the
 * clip's start and the pass, so every way of playing the song plays the same notes */
export function plays(c: Clip, n: Note, pass: number): boolean {
  const chance = chanceOf(n);
  if (chance >= 1) return true;
  if (chance <= 0) return false;
  return roll(`${c.pattern ?? c.id}|${n.beat}|${n.key}|${c.start}|${pass}`) < chance;
}

/**
 * Where a beat lands with swing `swing` on steps of `step` beats: each pair of steps, counted from the song's start,
 * keeps its ends, and its middle moves later by two thirds of the swing's share of a step (50%: two thirds of the way
 * through the pair, 75%: three quarters). A beat inside the pair moves in proportion.
 */
export function swungBeat(beat: number, step: number, swing: number): number {
  if (swing <= 0 || step <= 0) return beat;
  const pair = 2 * step,
    from = Math.floor(beat / pair + 1e-9) * pair,
    x = beat - from,
    mid = step * (1 + (2 * swing) / 3);
  return from + (x <= step ? (x / step) * mid : mid + ((x - step) / step) * (pair - mid));
}

/** a clip's notes as they play on pass `pass`: those that roll in, swung, each kept inside the clip */
export function playedClipNotes(c: Clip, pass: number): Note[] {
  const swing = swingOf(c),
    step = stepOf(c);
  const out: Note[] = [];
  for (const n of c.notes) {
    if (!plays(c, n, pass)) continue;
    if (!swing) {
      out.push(n);
      continue;
    }
    const at = swungBeat(c.start + n.beat, step, swing) - c.start,
      end = swungBeat(c.start + n.beat + n.beats, step, swing) - c.start;
    // a note swung past the clip's end, at the end of a clip of an odd number of steps, stays where it was written
    if (at >= c.beats - 1e-9) out.push(n);
    else out.push({ ...n, beat: at, beats: Math.max(1e-3, end - at) });
  }
  return out;
}

/** the project as it plays on pass `pass`, with no chance or swing left in it; a project with neither is returned
 * as it is */
export function rollProject(p: Project, pass: number): Project {
  const touched = (c: Clip) => swingOf(c) > 0 || c.notes.some((n) => chanceOf(n) < 1);
  if (!p.tracks.some((t) => t.clips.some(touched))) return p;
  return {
    ...p,
    tracks: p.tracks.map((t) =>
      t.clips.some(touched)
        ? {
            ...t,
            clips: t.clips.map((c) => {
              if (!touched(c)) return c;
              const { swing: _swing, ...rest } = c;
              return { ...rest, notes: playedClipNotes(c, pass) };
            }),
          }
        : t,
    ),
  };
}
