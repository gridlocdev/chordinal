// The arithmetic of a drag on the piano roll, apart from the pointer: a note moved or resized by a drag, the velocity
// at a height in the velocity strip, and the notes inside a selection rectangle. Pure, so it's tested in Node.
import type { Note } from '@chordinal/daw';
import type { PlacedNote } from '../notes.ts';
import type { RollPoint } from './roll-view.ts';

/** what a drag does to a note: move it (and change its key) or resize it */
export type NoteDrag = 'move' | 'resize';

/**
 * A picked note as a drag leaves it: `o` is the note where the drag started (its beat in the project, its clip), `db`
 * and `dk` how far the pointer moved in beats and keys. It snaps to `grid` beats unless `free` (Alt), stays inside
 * its clip and on a MIDI key, and a resize keeps it at least a grid step long (a sliver when free).
 */
export function dragNote(
  o: Pick<PlacedNote, 'n' | 'at' | 'clip'>,
  n: Note,
  mode: NoteDrag,
  db: number,
  dk: number,
  grid: number,
  free: boolean,
): Note {
  if (mode === 'resize') {
    const end = free ? o.at + o.n.beats + db : Math.round((o.at + o.n.beats + db) / grid) * grid;
    return { ...n, beats: Math.max(free ? 0.02 : grid, end - o.at) };
  }
  const shift = free ? db : Math.round(db / grid) * grid;
  return {
    ...n,
    beat: Math.max(0, Math.min(o.clip.beats - 0.01, o.n.beat + shift)),
    key: Math.max(0, Math.min(127, o.n.key + dk)),
  };
}

/** the velocity (1..127) at a pointer's `y`, in a velocity strip `height` px tall whose bottom edge is at `bottom` */
export const velocityAt = (y: number, bottom: number, height: number): number =>
  Math.round(Math.max(1, Math.min(127, ((bottom - 2 - y) / (height - 6)) * 127)));

/** the notes a selection rectangle from corner a to corner b touches */
export function notesInBand(all: readonly PlacedNote[], a: RollPoint, b: RollPoint): PlacedNote[] {
  const [b0, b1] = [Math.min(a.beat, b.beat), Math.max(a.beat, b.beat)],
    [k0, k1] = [Math.min(a.key, b.key), Math.max(a.key, b.key)];
  return all.filter((o) => o.n.key >= k0 && o.n.key <= k1 && o.at < b1 && o.at + o.n.beats > b0);
}

/** a note cut in two at `at` beats into its clip, when `at` falls inside it; otherwise the note alone */
export function sliceNote(n: Note, at: number): Note[] {
  const EPS = 1e-6;
  if (at <= n.beat + EPS || at >= n.beat + n.beats - EPS) return [n];
  return [
    { ...n, beats: at - n.beat },
    { ...n, beat: at, beats: n.beat + n.beats - at },
  ];
}

/**
 * Where a cut at project beat `beat` across keys `k0`..`k1` goes through notes: clip id → (note index → the beat in
 * that clip to cut at). Each note once, by `canon` (a pattern's notes are cut through its first clip).
 */
export function cutsAt(
  all: readonly PlacedNote[],
  beat: number,
  k0: number,
  k1: number,
  canon: (clipId: string) => string,
): Map<string, Map<number, number>> {
  const [lo, hi] = [Math.min(k0, k1), Math.max(k0, k1)],
    out = new Map<string, Map<number, number>>();
  for (const o of all) {
    if (o.n.key < lo || o.n.key > hi || beat <= o.at || beat >= o.at + o.n.beats) continue;
    const c = canon(o.clip.id),
      m = out.get(c) ?? new Map<number, number>();
    if (!m.has(o.i)) m.set(o.i, o.n.beat + beat - o.at);
    out.set(c, m);
  }
  return out;
}
