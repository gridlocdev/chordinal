// What can be done to tracks and clips from the arrangement, the mixer and the menus. Each is one undo step.
import { signal } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { barAt } from '@chordinal/daw';
import {
  makeTrack,
  addTrack,
  removeTrack,
  updateTrack,
  setMixer,
  moveTrack,
  duplicateTrack,
  addClip,
  updateClip,
  removeClip,
  findClip,
  joinClips,
  splitAt,
  newId,
  isDrums,
  makePattern,
  makeUnique,
  renamePattern,
  nextPatternName,
  findPattern,
} from '@chordinal/daw';
import { setLoop } from '@chordinal/daw';
import { quantizeNotes, humanizeNotes, scaleNotes, reverseNotes } from '@chordinal/daw';
import type { Clip, Loop, Mixer, Track } from '@chordinal/daw';
import { synthSettings } from '@chordinal/audio';
import { presetFor } from '@chordinal/playback';
import { project, selected, selectedClip, settings, setSettings, picked } from './store.ts';
import { edit } from './document.ts';
import { askText } from './ask.ts';

/** an instrument: its bank and program, and a synth's settings when it's a synth (PRD §13) */
export interface InstrumentRef {
  bank: number;
  program: number;
  synth?: object;
}

/** just the instrument of a ref: a SoundFont preset drops a synth the track had */
const instrumentOf = ({ bank, program, synth }: InstrumentRef): InstrumentRef => ({
  bank,
  program,
  ...(synth && { synth }),
});

/** what the track header, the mixer and musical typing call an instrument: its synth's name, or its preset's */
export const instrumentName = (i: InstrumentRef): string =>
  i.synth ? synthSettings(i.synth).name : (presetFor(i.bank, i.program)?.name ?? '');

/** the arrangement's zoom in px per beat, or 0 to fit the project to the window */
export const arrangeZoom: Signal<number> = signal(0);
/** the arrangement's px per beat as drawn now, to zoom in and out from */
export const arrangePpb: Signal<number> = signal(0);

export const trackOf = (id: string | null): Track | null =>
  project.value.tracks.find((t) => t.id === id) ?? null;

/** a new track below the others (or below one), selected, with the browser open to pick its instrument */
export function addNewTrack({
  instrument = null,
  after = null,
  name = '',
}: { instrument?: InstrumentRef | null; after?: string | null; name?: string } = {}): string {
  let id = '';
  edit((p) => {
    const t = makeTrack(p, {
      name: name || `Track ${p.tracks.length + 1}`,
      ...(instrument && { instrument: instrumentOf(instrument) }),
    });
    id = t.id;
    const at = after ? p.tracks.findIndex((x) => x.id === after) + 1 : p.tracks.length;
    return addTrack(p, t, at || p.tracks.length);
  });
  selected.value = id;
  if (!instrument) setSettings({ browserTab: 'instruments', browserOpen: true });
  return id;
}

/** puts an instrument on a track */
export const assignPreset = (trackId: string, instrument: InstrumentRef): void =>
  edit((p) => updateTrack(p, trackId, { instrument: instrumentOf(instrument) }));

/** selects a track and opens the instruments, to pick one for it */
export function chooseInstrument(trackId: string | null): void {
  selected.value = trackId;
  setSettings({ browserTab: 'instruments', browserOpen: true });
}

export async function renameTrack(trackId: string | null): Promise<void> {
  const t = trackOf(trackId);
  const name = t && (await askText('Track name', t.name, 'Rename'));
  if (name && trackId) edit((p) => updateTrack(p, trackId, { name }));
}

export function deleteTrack(trackId: string | null): void {
  const i = project.value.tracks.findIndex((t) => t.id === trackId);
  if (trackId) edit((p) => removeTrack(p, trackId));
  const tracks = project.value.tracks;
  if (selected.value === trackId) selected.value = tracks[Math.min(i, tracks.length - 1)]?.id ?? null;
  if (selectedClip.value?.track === trackId) selectedClip.value = null;
}

export function duplicateTheTrack(trackId: string | null): void {
  if (trackId) edit((p) => duplicateTrack(p, trackId));
  const tracks = project.value.tracks;
  selected.value = tracks[tracks.findIndex((t) => t.id === trackId) + 1]?.id ?? selected.value;
}

export const moveTrackBy = (trackId: string | null, by: number): void => {
  if (trackId) edit((p) => moveTrack(p, trackId, by));
};
/** moves a track to a place in the list (0 is the top) */
export function moveTrackTo(trackId: string, index: number): void {
  const from = project.value.tracks.findIndex((t) => t.id === trackId);
  if (from >= 0 && index !== from) moveTrackBy(trackId, index - from);
}
export const setTrackColor = (trackId: string, color: number[]): void =>
  edit((p) => updateTrack(p, trackId, { color }));
export const toggleMute = (trackId: string | null): void => {
  if (trackId) edit((p) => setMixer(p, trackId, { mute: !trackOf(trackId)?.mixer.mute }));
};
/** solos the track alone (any other solo turns off), or turns its solo off */
export const toggleSolo = (trackId: string | null): void => {
  if (!trackId) return;
  const on = !trackOf(trackId)?.mixer.solo;
  edit((p) =>
    p.tracks.reduce(
      (q, t) =>
        t.id === trackId
          ? setMixer(q, t.id, { solo: on })
          : t.mixer.solo && on
            ? setMixer(q, t.id, { solo: false })
            : q,
      p,
    ),
  );
};
export const setMix = (trackId: string, patch: Partial<Mixer>): void =>
  edit((p) => setMixer(p, trackId, patch));

// ── clips ────────────────────────────────────────────────────────────────────────────────────────────────────────────

const NEW_CLIP_BARS = 4;

/** an empty clip of a few bars from the bar a beat is in */
export function newClipAt(trackId: string, beat: number, bars = NEW_CLIP_BARS): void {
  const meters = project.value.meters,
    start = barAt(meters, beat).start;
  let id = '';
  edit((p) => {
    id = newId(p, 'c');
    const out = addClip(p, trackId, { id, start, beats: barAt(meters, start).beatsPerBar * bars, notes: [] });
    // PRD §3.4: on a drum track a drawn clip is a new pattern
    const t = out.tracks.find((x) => x.id === trackId);
    return t && isDrums(t) ? makePattern(out, trackId, id, nextPatternName(out, t.name)) : out;
  });
  selected.value = trackId;
  selectedClip.value = { track: trackId, clip: id };
}

// ── patterns (PRD §3) ────────────────────────────────────────────────────────────────────────────────────────────────

export const patternOf = (trackId: string, clipId: string): string | null =>
  findClip(project.value, trackId, clipId)?.pattern ?? null;

export function makePatternOf(trackId: string, clipId: string): void {
  const t = trackOf(trackId);
  if (t) edit((p) => makePattern(p, trackId, clipId, nextPatternName(p, t.name)));
}

export const makeUniqueOf = (trackId: string, clipId: string): void =>
  edit((p) => makeUnique(p, trackId, clipId));

export async function renamePatternOf(trackId: string, clipId: string): Promise<void> {
  const id = patternOf(trackId, clipId);
  const pattern = id === null ? null : findPattern(project.value, id);
  const name = pattern && (await askText('Pattern name', pattern.name, 'Rename'));
  if (pattern && name) edit((p) => renamePattern(p, pattern.id, name));
}

export function deleteClip(trackId: string, clipId: string): void {
  edit((p) => removeClip(p, trackId, clipId));
  if (selectedClip.value?.clip === clipId) selectedClip.value = null;
}

/** splits a track's clips at a beat, or every track's with no track */
export const splitClipsAt = (beat: number, trackId: string | null = null): void =>
  reorder(() => edit((p) => splitAt(p, beat, trackId)));

// an edit that gives notes new clips or indexes: the picks would point at other notes
function reorder(fn: () => void): void {
  fn();
  picked.value = new Set();
}

/** the clip after this one on its track, which it can join */
export function nextClip(trackId: string, clipId: string): Clip | null {
  const t = trackOf(trackId),
    c = t?.clips.find((x) => x.id === clipId);
  return t && c
    ? (t.clips.filter((x) => x !== c && x.start >= c.start).sort((a, b) => a.start - b.start)[0] ?? null)
    : null;
}

export function joinWithNext(trackId: string, clipId: string): void {
  const next = nextClip(trackId, clipId);
  if (next) reorder(() => edit((p) => joinClips(p, trackId, [clipId, next.id])));
}

/** a clip's length in bars, from its start */
export function setClipBars(trackId: string, clipId: string, bars: number): void {
  const c = findClip(project.value, trackId, clipId);
  if (c) edit((p) => updateClip(p, trackId, clipId, { beats: barAt(p.meters, c.start).beatsPerBar * bars }));
}

export function quantizeClip(trackId: string, clipId: string): void {
  reorder(() =>
    edit((p) =>
      updateClip(p, trackId, clipId, (c) => ({ ...c, notes: quantizeNotes(c.notes, settings.value.grid) })),
    ),
  );
}

export function transposeClip(trackId: string, clipId: string, by: number): void {
  edit((p) =>
    updateClip(p, trackId, clipId, (c) => ({
      ...c,
      notes: c.notes.map((n) => ({ ...n, key: Math.max(0, Math.min(127, n.key + by)) })),
    })),
  );
}

export const toggleClipMute = (trackId: string, clipId: string): void =>
  edit((p) => updateClip(p, trackId, clipId, (c) => ({ ...c, mute: !c.mute })));

/** a clip moved later (or earlier) by some beats, not before the start */
export const nudgeClip = (trackId: string, clipId: string, by: number): void =>
  edit(
    (p) => updateClip(p, trackId, clipId, (c) => ({ ...c, start: Math.max(0, c.start + by) })),
    `nudge ${clipId}`,
  );

export const humanizeClip = (trackId: string, clipId: string): void =>
  reorder(() =>
    edit((p) => updateClip(p, trackId, clipId, (c) => ({ ...c, notes: humanizeNotes(c.notes) }))),
  );

/** a clip played faster (k < 1) or slower (k > 1): its notes and its length scaled */
export const scaleClip = (trackId: string, clipId: string, k: number): void =>
  reorder(() =>
    edit((p) =>
      updateClip(p, trackId, clipId, (c) => ({ ...c, beats: c.beats * k, notes: scaleNotes(c.notes, k) })),
    ),
  );

export const reverseClip = (trackId: string, clipId: string): void =>
  reorder(() =>
    edit((p) => updateClip(p, trackId, clipId, (c) => ({ ...c, notes: reverseNotes(c.notes, 0, c.beats) }))),
  );

/** loops playback over a stretch, or stops looping with null */
export const loopOver = (range: Loop | null): void => edit((p) => setLoop(p, range));

export const clipRange = (trackId: string, clipId: string): Loop | null => {
  const c = findClip(project.value, trackId, clipId);
  return c ? { from: c.start, to: c.start + c.beats } : null;
};
