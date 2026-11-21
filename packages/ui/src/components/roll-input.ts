// What a pointer does on the piano roll: draw, move and resize notes, pick them, set velocities, scroll and zoom, and
// the right-click menus.
import { barAt, addClip, newId } from '@chordinal/daw';
import type { Clip, Note, Project, Track } from '@chordinal/daw';
import { selectedClip, selectedTrack, settings, picked } from '../store.ts';
import { edit } from '../document.ts';
import { seek } from '../player.ts';
import { press, release } from '../live.ts';
import { focus } from '../focus.ts';
import { noteId, notesOf, changeNotes, canonicalClip, isPicked, pickedNotes } from '../notes.ts';
import type { PlacedNote } from '../notes.ts';
import { noteMenu, rollMenu } from '../context-menus.ts';
import { GUTTER, STRIP, PPB, VEL_H, EDGE, band, view, geometry, snap } from './roll-view.ts';
import { dragNote, notesInBand, velocityAt } from './roll-edit.ts';
import type { NoteDrag } from './roll-edit.ts';

const NEW_VEL = 90;

/** what a drag reads of each pointer move */
export interface RollMove {
  clientX: number;
  clientY: number;
  altKey: boolean;
}

type DragEvent = 'pointermove' | 'pointerup' | 'pointercancel';

/** the element pressed on: where it is, and the pointer's moves until it lets go */
export interface RollTarget {
  getBoundingClientRect(): { left: number; top: number; width: number; height: number; bottom: number };
  setPointerCapture(pointerId: number): void;
  addEventListener(type: DragEvent, fn: (m: RollMove) => void): void;
  removeEventListener(type: DragEvent, fn: (m: RollMove) => void): void;
}

/** a press on the roll: a pointerdown event, or what a test makes of one */
export interface RollPress extends RollMove {
  button: number;
  shiftKey: boolean;
  timeStamp: number;
  pointerId: number;
  currentTarget: RollTarget;
}

/** the wheel scrolls (Shift: across); Cmd/Ctrl + wheel zooms around the pointer */
export function wheel(e: WheelEvent & { currentTarget: Element }): void {
  e.preventDefault();
  const v = view.value;
  if (e.metaKey || e.ctrlKey) {
    const r = e.currentTarget.getBoundingClientRect(),
      x = e.clientX - r.left - GUTTER,
      at = v.from + x / v.ppb;
    const ppb = Math.max(PPB[0], Math.min(PPB[1], v.ppb * Math.exp(-e.deltaY * 0.004)));
    view.value = { ...v, ppb, from: Math.max(0, at - x / ppb) };
  } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY))
    view.value = { ...v, from: Math.max(0, v.from + (e.deltaX || e.deltaY) / v.ppb) };
  else view.value = { ...v, low: Math.max(0, Math.min(115, v.low - Math.round(e.deltaY / 12))) };
}

/** a press on the roll of project p's track: seek, set velocities, pick, move or resize notes, or draw one */
export function down(e: RollPress, p: Project, track: Track | null): void {
  if (e.button !== 0 || !track) return;
  focus.value = 'roll';
  const el = e.currentTarget,
    r = el.getBoundingClientRect();
  const G = geometry(r.width, r.height);
  const px = e.clientX - r.left,
    py = e.clientY - r.top;
  if (px < GUTTER) {
    if (py >= STRIP + 4 && py < G.bottom) playKeys(el, e.pointerId, r.top, py, G.keyAt);
    return;
  }
  if (py < STRIP + 4) {
    seek(G.beatAt(px));
    return;
  }
  el.setPointerCapture(e.pointerId);
  const gesture = `roll-${e.timeStamp}`;
  const all = notesOf(track);

  // the velocity strip: drag across notes to set how hard each is played
  if (py >= G.bottom) {
    const merge = `velocity-${e.timeStamp}`; // one drag is one undo step
    const setVel = (m: RollMove) => {
      const x = m.clientX - r.left,
        vel = velocityAt(m.clientY, r.bottom, VEL_H);
      const near = all.filter(
        (o) => Math.abs(G.x(o.at) - x) <= 4 && (!picked.value.size || isPicked(track, o.clip.id, o.i)),
      );
      if (!near.length) return;
      const ids = new Set(near.map((o) => noteId(o.clip.id, o.i)));
      changeNotes(
        track.id,
        new Map(
          [...new Set(near.map((o) => o.clip.id))].map((c) => [
            c,
            (notes: Note[]) => notes.map((n, i) => (ids.has(noteId(c, i)) ? { ...n, vel } : n)),
          ]),
        ),
        merge,
      );
    };
    setVel(e);
    const up = () => {
      el.removeEventListener('pointermove', setVel);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', setVel);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return;
  }

  const b = G.beatAt(px),
    key = G.keyAt(py);
  const hit = all.findLast((o) => o.n.key === key && b >= o.at && b < o.at + o.n.beats);
  let mode: NoteDrag, grabbed: PlacedNote;
  if (hit) {
    const id = noteId(hit.clip.id, hit.i);
    if (e.shiftKey) {
      const s = new Set(picked.value);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      picked.value = s;
      return;
    }
    if (!picked.value.has(id)) picked.value = new Set([id]);
    selectedClip.value = { track: track.id, clip: hit.clip.id };
    mode = G.x(hit.at + hit.n.beats) - px <= EDGE ? 'resize' : 'move';
    grabbed = hit;
    press(hit.n.key);
  } else if (e.shiftKey) {
    // Shift-drag on empty space picks every note the rectangle touches, added to what was picked
    const was = picked.value,
      a = { beat: b, key };
    const drag = (m: RollMove) => {
      const c = { beat: G.beatAt(m.clientX - r.left), key: G.keyAt(m.clientY - r.top) };
      band.value = { a, b: c };
      picked.value = new Set([...was, ...notesInBand(all, a, c).map((o) => noteId(o.clip.id, o.i))]);
    };
    const done = () => {
      band.value = null;
      el.removeEventListener('pointermove', drag);
      el.removeEventListener('pointerup', done);
      el.removeEventListener('pointercancel', done);
    };
    el.addEventListener('pointermove', drag);
    el.addEventListener('pointerup', done);
    el.addEventListener('pointercancel', done);
    return;
  } else {
    // a new note, in the clip under it or a new bar's clip: the clip, the note and dragging its length are one undo step
    let clip: Clip | undefined = track.clips.findLast((c) => b >= c.start && b < c.start + c.beats);
    const start = Math.max(0, snap(b - (e.altKey ? 0 : settings.value.grid / 2), e));
    if (!clip) {
      const bar = barAt(p.meters, b);
      const made: Clip = { id: newId(p, 'c'), start: bar.start, beats: bar.beatsPerBar, notes: [] };
      clip = made;
      edit((q) => addClip(q, track.id, made), gesture);
    }
    const note: Note = {
      beat: Math.max(0, start - clip.start),
      beats: settings.value.grid,
      key,
      vel: NEW_VEL,
    };
    const index = clip.notes.length;
    changeNotes(track.id, new Map([[clip.id, (notes: Note[]) => [...notes, note]]]), gesture);
    selectedClip.value = { track: track.id, clip: clip.id };
    picked.value = new Set([noteId(clip.id, index)]);
    grabbed = { n: note, i: index, clip, at: clip.start + note.beat };
    mode = 'resize';
    press(key);
  }
  // what the picked notes were at the start of the drag, to move or resize from
  const startTrack = selectedTrack.value;
  // once per note of a pattern, however many of its clips it was picked in (PRD §3.3)
  // (edited through the pattern's first clip, but snapped where it was picked)
  const before = new Map(
    pickedNotes().map((o) => {
      const cid = canonicalClip(startTrack, o.clip.id);
      return [noteId(cid, o.i), { ...o, cid }];
    }),
  );
  let sounding = grabbed.n.key;
  const move = (m: RollMove) => {
    const db = G.beatAt(m.clientX - r.left) - b,
      dk = G.keyAt(m.clientY - r.top) - key;
    const changes = new Map<string, (notes: Note[]) => Note[]>();
    for (const [, o] of before) {
      const [c, i] = [o.cid, o.i];
      const fn = changes.get(c) ?? ((notes: Note[]) => notes);
      changes.set(c, (notes) =>
        fn(notes).map((n, k) => (k !== i ? n : dragNote(o, n, mode, db, dk, settings.value.grid, m.altKey))),
      );
    }
    changeNotes(track.id, changes, gesture);
    const now = grabbed.n.key + (mode === 'move' ? dk : 0);
    if (now !== sounding) {
      release(sounding);
      press(now);
      sounding = now;
    }
  };
  const up = () => {
    release(sounding);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

/** the keyboard in the gutter: a press plays its key until the pointer lets go, and a drag glides to the keys it
 * passes over; the key's lane lights up while it sounds (roll-draw.ts) */
function playKeys(
  el: RollTarget,
  pointerId: number,
  top: number,
  py: number,
  keyAt: (y: number) => number,
): void {
  let sounding = keyAt(py);
  press(sounding);
  el.setPointerCapture(pointerId);
  const move = (m: RollMove) => {
    const now = keyAt(m.clientY - top);
    if (now === sounding) return;
    release(sounding);
    press(now);
    sounding = now;
  };
  const up = () => {
    release(sounding);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

/** the note under a point of the roll's track, if any (none on the chord strip or the velocity strip) */
function noteAt(e: MouseEvent & { currentTarget: Element }, track: Track) {
  const r = e.currentTarget.getBoundingClientRect(),
    G = geometry(r.width, r.height);
  const px = e.clientX - r.left,
    py = e.clientY - r.top;
  const b = G.beatAt(px),
    key = G.keyAt(py);
  const hit =
    py > STRIP + 4 && py < G.bottom
      ? notesOf(track).findLast((o) => o.n.key === key && b >= o.at && b < o.at + o.n.beats)
      : undefined;
  return { G, px, py, b, hit };
}

/** the cursor for what a press would do here */
export function hover(e: MouseEvent & { currentTarget: HTMLElement }, track: Track | null): void {
  if (!track || e.buttons) return;
  const { G, px, py, hit } = noteAt(e, track);
  e.currentTarget.style.cursor =
    py >= G.bottom
      ? 'ns-resize'
      : hit
        ? G.x(hit.at + hit.n.beats) - px <= EDGE
          ? 'ew-resize'
          : 'grab'
        : px > GUTTER && py > STRIP + 4
          ? 'crosshair'
          : '';
}

// right-click a note for what can be done to the picked notes (it's picked, if it wasn't), or the background
export function menu(e: MouseEvent & { currentTarget: Element }, track: Track | null): void {
  e.preventDefault();
  if (!track) return;
  const { b, hit } = noteAt(e, track);
  if (!hit) {
    rollMenu(track.id, Math.max(0, b));
    return;
  }
  const id = noteId(hit.clip.id, hit.i);
  if (!picked.value.has(id)) picked.value = new Set([id]);
  selectedClip.value = { track: track.id, clip: hit.clip.id };
  noteMenu();
}
