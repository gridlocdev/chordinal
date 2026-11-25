// The step grid's model (PRD §4): a clip's notes seen as rows of drum keys, or of a melodic track's notes (Chordinal
// PRD §17.1), by columns of steps. Pure; edits return new notes or a new track, and the app passes them through
// updateClip, so a pattern's every clip follows.
import { inScale, MODES } from '@chordinal/lib';
import type { Mode } from '@chordinal/lib';
import { CORE_ROWS, GM_DRUMS } from './gm-drums-data.ts';
import type { Clip, Note, Project, Track } from './project.ts';

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

/** a drum track's rows in the arrangement's strips of steps: its rows, then any other key in its clips (Chordinal PRD
 * §17.8) */
export const stripRows = (track: Pick<Track, 'stepRows' | 'clips'>): number[] =>
  gridRows(track, { notes: track.clips.flatMap((c) => c.notes) });

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

/** whether a note starts on one of the grid's steps */
const onGrid = (n: Note, step: number) =>
  Math.abs(n.beat / step - Math.round(n.beat / step)) * step < ON_GRID;

/** the note on an earlier step of the row that runs over step i (Chordinal PRD §17.4), or null */
export function heldOver<N extends Note>(notes: N[], key: number, i: number, step: number): N | null {
  const at = startOf(i, step);
  return (
    notes.find(
      (n) => n.key === key && onGrid(n, step) && n.beat < at - ON_GRID && n.beat + n.beats > at + ON_GRID,
    ) ?? null
  );
}

/**
 * notes with a step turned on or off; notes off the grid are never touched (PRD §4.7, §4.8). Turning on a step that
 * an earlier step's note runs over cuts that note short there (Chordinal PRD §17.4). Returns the same array when
 * nothing changes.
 */
export function setStep(notes: Note[], key: number, i: number, step: number, on: boolean): Note[] {
  const has = notes.some((n) => isOn(n, key, i, step));
  if (has === on) return notes;
  if (!on) return notes.filter((n) => !isOn(n, key, i, step));
  const at = startOf(i, step),
    over = heldOver(notes, key, i, step);
  const added = { beat: at, beats: step, key, vel: STEP_VELOCITY };
  return [...notes.map((n) => (n === over ? { ...n, beats: at - n.beat } : n)), added].sort(
    (a, b) => a.beat - b.beat || a.key - b.key,
  );
}

/** the longest a note can be: to the clip's end, or to the next note starting on its row */
export function longestLength(notes: Note[], n: Note, clipBeats: number): number {
  const next = notes
    .filter((x) => x.key === n.key && x.beat > n.beat + ON_GRID)
    .reduce((end, x) => Math.min(end, x.beat), clipBeats);
  return Math.max(0, next - n.beat);
}

/** the shortest a note dragged freely can be, in steps */
const LEAST_FREE = 0.25;

/**
 * notes with step i's note on the row made `beats` long, at least a step (a quarter of one when free) and never past
 * the clip's end or into the row's next note (Chordinal PRD §17.4); the same array when nothing changes or the step is
 * off
 */
export function setStepLength<N extends Note>(
  notes: N[],
  key: number,
  i: number,
  step: number,
  beats: number,
  clipBeats: number,
  free = false,
): N[] {
  const n = notes.find((x) => isOn(x, key, i, step));
  if (!n) return notes;
  const most = longestLength(notes, n, clipBeats),
    want = free ? Math.max(LEAST_FREE * step, beats) : Math.max(1, Math.round(beats / step)) * step,
    length = Math.min(most, want);
  if (length <= 0 || Math.abs(length - n.beats) < 1e-9) return notes;
  return notes.map((x) => (x === n ? { ...x, beats: length } : x));
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

/** the octaves of rows a melodic track's grid shows, and the octaves its rows can start in (Chordinal PRD §17.1) */
export const GRID_OCTAVES = 2;
export const GRID_OCTAVE_RANGE: readonly [low: number, high: number] = [0, 7];
const DEFAULT_GRID_OCTAVE = 3;
const isMode = (m: string): m is Mode => Object.hasOwn(MODES, m);

/** the octave a melodic track's rows start in: the track's, or 3 while the clip's notes fit there, or else the one
 * holding the clip's lowest note */
export function gridOctave(
  track: Pick<Track, 'gridOctave'>,
  key: Project['key'],
  clip?: Pick<Clip, 'notes'> | null,
): number {
  const [low, high] = GRID_OCTAVE_RANGE;
  if (track.gridOctave !== undefined) return Math.max(low, Math.min(high, track.gridOctave));
  // the default holds while the clip's notes fit in it, so painting in its rows never moves them
  const tonic = key?.tonic ?? 0,
    from = (DEFAULT_GRID_OCTAVE + 1) * 12 + tonic;
  const notes = (clip?.notes ?? []).map((n) => n.key);
  if (notes.every((k) => k >= from && k <= from + 12 * GRID_OCTAVES)) return DEFAULT_GRID_OCTAVE;
  return Math.max(low, Math.min(high, Math.floor((Math.min(...notes) - tonic) / 12) - 1));
}

/**
 * a melodic track's rows, highest first: the key's notes (all twelve when chromatic, or with no key or one in a mode it doesn't know) from its tonic in
 * the track's octave up two octaves, and any other note the clip plays, each in its place (Chordinal PRD §17.1)
 */
export function melodicRows(
  track: Pick<Track, 'gridOctave' | 'gridChromatic'>,
  key: Project['key'],
  clip?: Pick<Clip, 'notes'> | null,
): number[] {
  const low = (gridOctave(track, key, clip) + 1) * 12 + (key?.tonic ?? 0);
  const mode = key && isMode(key.mode) ? key.mode : null;
  const rows = new Set<number>();
  for (let k = low; k <= low + 12 * GRID_OCTAVES; k++)
    if (track.gridChromatic || !key || !mode || inScale(key.tonic, mode, k)) rows.add(k);
  for (const n of clip?.notes ?? []) rows.add(n.key);
  return [...rows].sort((a, b) => b - a);
}

/** what the lane under the grid sets: how hard a step plays, or its chance of playing (Chordinal PRD §17.5) */
export type LaneValue = 'vel' | 'chance';

/** the notes starting on step i, on any row: a chord is all of them */
export const stepNotes = <N extends Note>(notes: N[], i: number, step: number): N[] =>
  notes.filter((n) => Math.abs(n.beat - startOf(i, step)) < ON_GRID);

/** a note's value in the lane: its velocity, or its chance from 0 to 1 (none: 1) */
export const laneValueOf = (n: Note, what: LaneValue): number =>
  what === 'vel' ? n.vel : typeof n.chance === 'number' ? n.chance : 1;

/**
 * notes with every note on step i set to `value`: a velocity from 1 to 127, or a chance from 0 to 1, which at 1 is
 * dropped from the note (Chordinal PRD §17.5, §17.6); the same array when nothing changes
 */
export function setStepValue<N extends Note>(
  notes: N[],
  i: number,
  step: number,
  what: LaneValue,
  value: number,
): N[] {
  const on = new Set(stepNotes(notes, i, step));
  if (!on.size) return notes;
  const v = what === 'vel' ? Math.round(Math.max(1, Math.min(127, value))) : Math.max(0, Math.min(1, value));
  if ([...on].every((n) => laneValueOf(n, what) === v)) return notes;
  return notes.map((n) => {
    if (!on.has(n)) return n;
    if (what === 'vel') return { ...n, vel: v };
    const { chance: _chance, ...rest } = n;
    return (v < 1 ? { ...rest, chance: v } : rest) as N;
  });
}
