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
