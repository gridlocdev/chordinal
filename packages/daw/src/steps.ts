// The step grid's model (PRD §4): a clip's notes seen as rows of drum keys by columns of steps. Pure; edits return new
// notes or a new track, and the app passes them through updateClip, so a pattern's every clip follows.
import { CORE_ROWS, GM_DRUMS } from './gm-drums-data.ts';
import type { Clip, Note, Track } from './project.ts';

/** the step sizes a clip can have, in beats, with their names (PRD §4.4) */
export const STEP_SIZES: [number, string][] = [
  [0.5, '1/8'],
  [0.25, '1/16'],
  [0.125, '1/32'],
  [1 / 6, '1/16 triplet'],
];
export const DEFAULT_STEP = 0.25;
/** a note this close to a step's start is on it (PRD §4.7) */
const ON_GRID = 1e-3;
export const STEP_VELOCITY = 100;
export const ACCENT_VELOCITY = 127;

export const stepOf = (clip: Pick<Clip, 'step'>): number => clip.step ?? DEFAULT_STEP;

/** how many steps fit in the clip */
export const stepCount = (clip: Pick<Clip, 'beats' | 'step'>): number =>
  Math.max(1, Math.floor(clip.beats / stepOf(clip) + 1e-6));

export const drumName = (key: number): string => GM_DRUMS[key] ?? `Key ${key}`;

/** the rows, top first: the track's rows (or the core kit), then other keys the clip plays, low to high (PRD §4.6) */
export function gridRows(track: Pick<Track, 'stepRows'>, clip?: Pick<Clip, 'notes'> | null): number[] {
  const rows = [...(track.stepRows ?? CORE_ROWS)];
  const extra = [...new Set((clip?.notes ?? []).map((n) => n.key))]
    .filter((k) => !rows.includes(k))
    .sort((a, b) => a - b);
  return [...rows, ...extra];
}

const startOf = (i: number, step: number) => i * step;
const isOn = (n: Note, key: number, i: number, step: number) =>
  n.key === key && Math.abs(n.beat - startOf(i, step)) < ON_GRID;

/** what's in a cell: the note on its step, if any, and notes on that row starting elsewhere inside it */
export function cell<N extends Note>(
  notes: N[],
  key: number,
  i: number,
  step: number,
): { on: N | null; off: N[] } {
  const from = startOf(i, step) - ON_GRID,
    to = startOf(i + 1, step) - ON_GRID;
  const on = notes.find((n) => isOn(n, key, i, step)) ?? null;
  const off = notes.filter(
    (n) => n.key === key && n !== on && n.beat >= from && n.beat < to && !isOn(n, key, i, step),
  );
  return { on, off };
}

/** notes with a step turned on or off; notes off the grid are never touched (PRD §4.7, §4.8). Returns the same array
 * when nothing changes. */
export function setStep(notes: Note[], key: number, i: number, step: number, on: boolean): Note[] {
  const has = notes.some((n) => isOn(n, key, i, step));
  if (has === on) return notes;
  if (!on) return notes.filter((n) => !isOn(n, key, i, step));
  const added = { beat: startOf(i, step), beats: step, key, vel: STEP_VELOCITY };
  return [...notes, added].sort((a, b) => a.beat - b.beat || a.key - b.key);
}

/** an on step's accent toggled: 127, or back to 100 (PRD §4.9); an off step changes nothing */
export function toggleAccent<N extends Note>(notes: N[], key: number, i: number, step: number): N[] {
  const n = notes.find((x) => isOn(x, key, i, step));
  if (!n) return notes;
  const vel = n.vel === ACCENT_VELOCITY ? STEP_VELOCITY : ACCENT_VELOCITY;
  return notes.map((x) => (x === n ? { ...x, vel } : x));
}

/** a track with a row added to its step grid */
export function addRow<T extends Pick<Track, 'stepRows'>>(track: T, key: number): T {
  const rows = track.stepRows ?? CORE_ROWS;
  return rows.includes(key) ? track : { ...track, stepRows: [...rows, key] };
}

/** a track with a row hidden; a row the clip has notes on stays (PRD §4.6) */
export function hideRow<T extends Pick<Track, 'stepRows'>>(
  track: T,
  key: number,
  clip?: Pick<Clip, 'notes'> | null,
): T {
  const rows = track.stepRows ?? CORE_ROWS;
  if (!rows.includes(key) || clip?.notes.some((n) => n.key === key)) return track;
  return { ...track, stepRows: rows.filter((k) => k !== key) };
}
