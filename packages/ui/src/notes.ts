// The notes picked in the piano roll, on the selected track, and what can be done to them: delete, transpose, quantize,
// set velocity, make legato, nudge, humanize, change speed, reverse. Each is one undo step.
import { updateClip } from '@chordinal/daw';
import { quantizeNotes, humanizeNotes, scaleNotes } from '@chordinal/daw';
import type { Clip, Note, Track } from '@chordinal/daw';
import { selectedTrack, selectedClip, settings, picked } from './store.ts';
import { edit } from './document.ts';

/** a snap choice: its length in beats and its name */
export type GridChoice = [beats: number, name: string];

/** the piano roll's snap choices */
export const GRIDS: GridChoice[] = [
  [1, '1/4'],
  [0.5, '1/8'],
  [0.25, '1/16'],
  [1 / 3, '1/8T'],
  [1 / 6, '1/16T'],
];

/** a note with where it is: its clip, its index there, and its beat in the project */
export interface PlacedNote {
  n: Note;
  i: number;
  clip: Clip;
  at: number;
}

export const noteId = (clip: string, i: number): string => `${clip}:${i}`;

/** a note id's clip and index */
const parseId = (id: string): [clip: string, index: number] => {
  const [c = '', i] = id.split(':');
  return [c, Number(i)];
};

/** a track's notes with where they are: clip, index, and the beat in the project */
export const notesOf = (track: Track | null | undefined): PlacedNote[] =>
  track
    ? track.clips.flatMap((c) =>
        c.notes
          .map((n, i) => ({ n, i, clip: c, at: c.start + n.beat }))
          .filter((x) => x.n.beat < x.clip.beats),
      )
    : [];

/** the first clip on the track that plays the same pattern, or the clip itself: the clips of a pattern share their
 * notes, so an edit to picked notes goes through that one clip once, and every clip of the pattern follows (PRD §3.3) */
export function canonicalClip(track: Track | null | undefined, clipId: string): string {
  const c = track?.clips.find((x) => x.id === clipId);
  return c?.pattern ? (track?.clips.find((x) => x.pattern === c.pattern)?.id ?? clipId) : clipId;
}

/** note ids with each clip replaced by its canonical clip, so a note picked in two linked clips is changed once */
export function canonicalIds(track: Track | null | undefined, ids: Iterable<string>): Set<string> {
  return new Set(
    [...ids].map((id) => {
      const [c, i] = parseId(id);
      return noteId(canonicalClip(track, c), i);
    }),
  );
}

/** whether a note is picked, here or in a clip linked to this one */
export const isPicked = (
  track: Track | null | undefined,
  clipId: string,
  i: number,
  ids: Set<string> = canonicalIds(track, picked.value),
): boolean => ids.has(noteId(canonicalClip(track, clipId), i));

/** the picked notes on the selected track, where they were picked, once each (a note picked in two linked clips counts once, at the first) */
export function pickedNotes(): PlacedNote[] {
  const t = selectedTrack.value,
    seen = new Set<string>();
  return notesOf(t).filter((o) => {
    if (!picked.value.has(noteId(o.clip.id, o.i))) return false;
    const id = noteId(canonicalClip(t, o.clip.id), o.i);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** whether any picked note is on the selected track now: picks left from another track or project don't count */
export const hasPicks = (): boolean => picked.value.size > 0 && pickedNotes().length > 0;

/** Changes notes clip by clip: a map of clip id → (notes)=> notes. */
export function changeNotes(
  trackId: string,
  changes: Map<string, (notes: Note[]) => Note[]>,
  merge: string | null = null,
): void {
  edit((p) => {
    let out = p;
    for (const [clip, fn] of changes)
      out = updateClip(out, trackId, clip, (c) => ({ ...c, notes: fn(c.notes) }));
    return out;
  }, merge);
}

/** the clips the picked notes are in */
const clipsOf = (ids: Set<string>) => new Set([...ids].map((id) => parseId(id)[0]));

/** changes each picked note with fn(note) */
function mapPicked(fn: (n: Note) => Note, merge: string | null = null): boolean {
  const t = selectedTrack.value,
    ids = canonicalIds(t, picked.value);
  if (!t || !ids.size) return false;
  const clips = clipsOf(ids);
  changeNotes(
    t.id,
    new Map(
      [...clips].map((c) => [c, (notes: Note[]) => notes.map((n, i) => (ids.has(noteId(c, i)) ? fn(n) : n))]),
    ),
    merge,
  );
  return true;
}

export function deletePicked(): boolean {
  const t = selectedTrack.value;
  if (!t || !picked.value.size) return false;
  const byClip = new Map<string, number[]>();
  for (const id of canonicalIds(t, picked.value)) {
    const [c, i] = parseId(id);
    byClip.set(c, [...(byClip.get(c) ?? []), i]);
  }
  changeNotes(
    t.id,
    new Map(
      [...byClip].map(([c, list]) => [c, (notes: Note[]) => notes.filter((_, i) => !list.includes(i))]),
    ),
  );
  picked.value = new Set();
  return true;
}

// Key repeats on the same picked notes are one undo step; picking other notes starts a new one
const pickings = new WeakMap<Set<string>, number>();
let pickingCount = 0;
const sameNotes = (kind: string) => {
  const s = picked.value;
  if (!pickings.has(s)) pickings.set(s, ++pickingCount);
  return `${kind}-${pickings.get(s)}`;
};

export const transposePicked = (by: number): boolean =>
  mapPicked((n) => ({ ...n, key: Math.max(0, Math.min(127, n.key + by)) }), sameNotes('transpose'));

export const setVelocity = (vel: number): boolean => mapPicked((n) => ({ ...n, vel }));

export const quantizePicked = (): boolean =>
  mapPicked((n) => quantizeNotes([n], settings.value.grid)[0] ?? n);

/** each picked note held until the next note starts, in its clip */
export function legatoPicked(): boolean {
  const t = selectedTrack.value,
    ids = canonicalIds(t, picked.value);
  if (!t || !ids.size) return false;
  const clips = clipsOf(ids);
  changeNotes(
    t.id,
    new Map(
      [...clips].map((c) => [
        c,
        (notes: Note[]) =>
          notes.map((n, i) => {
            if (!ids.has(noteId(c, i))) return n;
            const next = Math.min(...notes.filter((m) => m.beat > n.beat + 1e-6).map((m) => m.beat));
            return Number.isFinite(next) ? { ...n, beats: next - n.beat } : n;
          }),
      ]),
    ),
  );
  return true;
}

export const clearPicked = (): void => {
  picked.value = new Set();
};

/** every note of the selected clip, or of the track when no clip of it is selected */
export function pickAll(): void {
  const t = selectedTrack.value,
    sel = selectedClip.value;
  if (!t) return;
  const clips = t.clips.filter((c) => sel?.track !== t.id || c.id === sel.clip);
  picked.value = new Set(clips.flatMap((c) => c.notes.map((_, i) => noteId(c.id, i))));
}

/** every note of the track at a key */
export const pickKey = (key: number): void => {
  picked.value = new Set(
    notesOf(selectedTrack.value)
      .filter((o) => o.n.key === key)
      .map((o) => noteId(o.clip.id, o.i)),
  );
};

/** the picked notes moved later (or earlier) by some beats, none before its clip's start */
export const nudgePicked = (by: number): boolean =>
  mapPicked((n) => ({ ...n, beat: Math.max(0, n.beat + by) }), sameNotes('nudge'));

/** fn(notes, from, to) on the picked notes of each clip, given the stretch they span in it */
function mapPickedTogether(fn: (notes: Note[], from: number, to: number) => Note[]): boolean {
  const t = selectedTrack.value,
    ids = canonicalIds(t, picked.value);
  if (!t || !ids.size) return false;
  const clips = clipsOf(ids);
  changeNotes(
    t.id,
    new Map(
      [...clips].map((c) => [
        c,
        (notes: Note[]) => {
          const mine = notes.filter((_, i) => ids.has(noteId(c, i)));
          const from = Math.min(...mine.map((n) => n.beat)),
            to = Math.max(...mine.map((n) => n.beat + n.beats));
          const changed = fn(mine, from, to);
          let k = 0;
          // keeps each note at its index, so the picks still point at them
          return notes.map((n, i) => (ids.has(noteId(c, i)) ? (changed[k++] ?? n) : n));
        },
      ]),
    ),
  );
  return true;
}

export const humanizePicked = (): boolean => mapPickedTogether((notes) => humanizeNotes(notes));

/** the picked notes faster (k < 1) or slower (k > 1), from the first of them */
export const scalePicked = (k: number): boolean =>
  mapPickedTogether((notes, from) => scaleNotes(notes, k, from));

/** the picked notes backwards, over the stretch they span */
export const reversePicked = (): boolean =>
  mapPickedTogether((notes, from, to) => notes.map((n) => ({ ...n, beat: from + to - n.beat - n.beats })));
