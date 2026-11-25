// What the step grid does (PRD §4): steps painted on and off, accents, the step size, rows added and hidden, a melodic
// track's range (Chordinal PRD §17.1), the preview sound, and switching the editor between the piano roll and the grid
// as clips are selected, by the track's own choice (§17.3).
import { effect, signal } from '@preact/signals';
import {
  findClip,
  updateClip,
  updateTrack,
  isDrums,
  gridRows,
  melodicRows,
  gridOctave,
} from '@chordinal/daw';
import {
  stepOf,
  stepCount,
  setStep,
  setStepLength,
  setStepValue,
  toggleAccent,
  addRow,
  hideRow,
} from '@chordinal/daw';
import type { Clip, LaneValue, Note, Track } from '@chordinal/daw';
import { project, selectedClip, settings, setSettings, playing, picked, beat } from './store.ts';
import type { ClipRef, EditorTab } from './store.ts';
import { playheadStep } from './components/grid-view.ts';
import { focus } from './focus.ts';
import { edit } from './document.ts';
import { press, release } from './live.ts';

const PREVIEW_MS = 250; // how long a step's sound is held when it's turned on while stopped

/**
 * the step of `clip` the playhead is on, or −1 when stopped or outside it. Read inside a computed, its value changes
 * once a step, so the grid redraws on each step rather than on every frame of playback.
 */
export function playingStep(clip: Clip | null): number {
  if (!playing.value || !clip) return -1;
  const p = project.value;
  const linked = clip.pattern
    ? p.tracks.flatMap((t) => t.clips).filter((c) => c.pattern === clip.pattern)
    : [clip];
  const step: number = playheadStep(linked, beat.value, stepOf(clip), stepCount(clip));
  return step;
}

/** the selected clip and its track, or nulls */
export function gridTarget(): { track: Track | null; clip: Clip | null } {
  const sel = selectedClip.value,
    p = project.value;
  const track = sel ? (p.tracks.find((t) => t.id === sel.track) ?? null) : null;
  const clip = sel && track ? findClip(p, sel.track, sel.clip) : null;
  return { track, clip };
}

/** the rows the grid shows for a track's clip: drum keys, or a melodic track's notes (Chordinal PRD §17.1) */
export const rowsOf = (track: Track, clip: Clip | null): number[] =>
  isDrums(track) ? gridRows(track, clip) : melodicRows(track, project.value.key, clip);

/** the octave a melodic track's rows start in */
export const shownOctave = (track: Track, clip: Clip | null): number =>
  gridOctave(track, project.value.key, clip);

/** the clip's notes changed by fn(notes, step), as one undo step; nothing is recorded when nothing changes (PRD §6.1) */
function changeSteps(
  trackId: string,
  clipId: string,
  fn: (notes: Note[], step: number) => Note[],
  merge: string | null = null,
): void {
  const c = findClip(project.value, trackId, clipId);
  const notes = c && fn(c.notes, stepOf(c));
  if (!c || !notes || notes === c.notes) return;
  edit((p) => updateClip(p, trackId, clipId, { notes }), merge);
  // the grid reorders notes, so piano-roll picks (by index) would point at others
  picked.value = new Set();
}

/** one cell set on or off; `merge` makes a drag one undo step (PRD §4.8) */
export const paintStep = (
  trackId: string,
  clipId: string,
  key: number,
  i: number,
  on: boolean,
  merge?: string | null,
): void => changeSteps(trackId, clipId, (notes, step) => setStep(notes, key, i, step, on), merge);

/** step i's note on the row made `beats` long, a step at a time unless `free`; `merge` makes a drag one undo step
 * (Chordinal PRD §17.4) */
export function stretchStep(
  trackId: string,
  clipId: string,
  key: number,
  i: number,
  beats: number,
  free: boolean,
  merge: string,
): void {
  const c = findClip(project.value, trackId, clipId);
  if (c)
    changeSteps(
      trackId,
      clipId,
      (notes, step) => setStepLength(notes, key, i, step, beats, c.beats, free),
      merge,
    );
}

/** what the lane under the grid shows and sets (Chordinal PRD §17.5) */
export const laneShows = signal<LaneValue>('vel');

/** every note on step i set to `value` in the lane's terms; `merge` makes a drag one undo step */
export const paintLane = (trackId: string, clipId: string, i: number, value: number, merge: string): void =>
  changeSteps(trackId, clipId, (notes, step) => setStepValue(notes, i, step, laneShows.value, value), merge);

export const accentStep = (trackId: string, clipId: string, key: number, i: number): void =>
  changeSteps(trackId, clipId, (notes, step) => toggleAccent(notes, key, i, step));

/** the clip's step size; the size it has already changes nothing (PRD §4.4, §6.1) */
export function setStepSize(trackId: string, clipId: string, step: number): void {
  const c = findClip(project.value, trackId, clipId);
  if (c && stepOf(c) !== step) edit((p) => updateClip(p, trackId, clipId, { step }));
}

/** the track's rows changed by fn(track); nothing is recorded when nothing changes */
function changeRows(trackId: string, fn: (t: Track) => Track): void {
  const t = project.value.tracks.find((x) => x.id === trackId);
  const next = t && fn(t);
  if (t && next && next !== t) edit((p) => updateTrack(p, trackId, next));
}

export const addGridRow = (trackId: string, key: number): void => changeRows(trackId, (t) => addRow(t, key));

export const hideGridRow = (trackId: string, key: number, clip?: Pick<Clip, 'notes'> | null): void =>
  changeRows(trackId, (t) => hideRow(t, key, clip));

/** a melodic track's rows start in another octave (Chordinal PRD §17.1) */
export const setGridOctave = (trackId: string, octave: number): void =>
  changeRows(trackId, (t) => (t.gridOctave === octave ? t : { ...t, gridOctave: octave }));

/** a melodic track's rows show all twelve notes, or the key's again */
export const toggleChromatic = (trackId: string): void =>
  changeRows(trackId, (t) => {
    const { gridChromatic, ...rest } = t;
    return gridChromatic ? rest : { ...t, gridChromatic: true };
  });

/** the drum or note heard once, when a step is turned on while stopped (PRD §4.10, Chordinal PRD §17.2) */
export function previewStep(key: number): void {
  if (playing.value) return;
  press(key);
  setTimeout(() => release(key), PREVIEW_MS);
}

type ClipEditor = 'grid' | 'roll';

/** the editor a track's clips open in: its own choice, or the grid for drums and the piano roll for the rest */
export const editorOf = (track: Track): ClipEditor => track.editor ?? (isDrums(track) ? 'grid' : 'roll');

/**
 * shows an editor tab, chosen by hand. The piano roll or the grid, chosen while one of a MIDI track's clips is
 * selected, becomes that track's editor (Chordinal PRD §17.3); the default is kept as no choice at all.
 */
export function chooseEditor(tab: EditorTab): void {
  setSettings({ editorTab: tab });
  if (tab !== 'grid' && tab !== 'roll') return;
  const sel = selectedClip.peek(),
    track = sel && project.peek().tracks.find((t) => t.id === sel.track);
  if (!track || track.kind || editorOf(track) === tab) return;
  edit((p) =>
    updateTrack(p, track.id, (t) => {
      const { editor: _, ...rest } = t;
      return tab === (isDrums(t) ? 'grid' : 'roll') ? rest : { ...t, editor: tab };
    }),
  );
}

/** the editor follows the selection: the track's own editor for its clip (PRD §4.2, Chordinal PRD §17.3) */
export function startEditorFollow(): void {
  let last: ClipRef | null = null;
  effect(() => {
    const sel = selectedClip.value;
    if (!sel || (last && sel.track === last.track && sel.clip === last.clip)) return;
    last = sel;
    // a clip picked in the piano roll itself (clicking a note in it) keeps the roll (PRD §4.2)
    if (focus.peek() === 'roll') return;
    const track = project.peek().tracks.find((t) => t.id === sel.track);
    const tab = settings.peek().editorTab;
    if (!track || (tab !== 'roll' && tab !== 'grid')) return;
    const want = editorOf(track);
    if (want !== tab) setSettings({ editorTab: want });
  });
}
