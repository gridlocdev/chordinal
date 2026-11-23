// MIDI FX: code that changes a track's notes as they play, a little differently on each pass round a loop. A type is
// registered once (the app registers them, so this layer needs none of their code); a track lists the types it uses
// in track.fx. One type runs once per pass for the whole project, so it can share a plan across its tracks.
import { trackNotes, updateTrack } from './project.ts';
import { applyNoteFx, isNoteFx, noteFxName } from './note-fx.ts';
import type { Note, Project, Track, TrackFx } from './project.ts';

// The pitch moves a voice makes on top of its note (the player's pitch-moves.js plays them).

/** pitch wobble in cents at `rate` Hz, starting `delay` seconds into the note and reaching full depth `ramp` later */
export interface Vibrato {
  rate: number;
  cents: number;
  delay: number;
  ramp: number;
}

/** start `cents` off pitch (−100: a semitone low) and slide onto it over `seconds` */
export interface Scoop {
  cents: number;
  seconds: number;
}

/** semitones over the note to step through, `seconds` each, round and round for `until` seconds */
export interface Arp {
  steps: number[];
  seconds: number;
  until: number;
}

/** from `at` seconds into the note, slide `cents` off pitch (−1200: an octave down) over `seconds` */
export interface Fall {
  cents: number;
  seconds: number;
  at: number;
}

/**
 * detune: the whole note this many cents off its key, under the other moves (a quarter tone is 50, a just major 3rd
 * −13.7); a project's note can carry it as a mark of its own.
 * curve: cents over the detune `at` seconds after the voice starts, straight lines between, held after the last: a
 * note's bend mark as the player times it
 */
export interface PitchMoves {
  detune?: number;
  curve?: { at: number; cents: number }[];
  vibrato?: Vibrato;
  scoop?: Scoop;
  arp?: Arp;
  fall?: Fall;
}

/**
 * A played note: grid is where it belongs on the grid (a loop or a seek plays the notes whose grid is at or after
 * it, even those that sound a little early); glideFrom slides into it from that key; held means no note-off, as the
 * next note glides on from it; mono cuts whatever else its track is sounding; program plays it on another program
 * of the track's bank; the rest are the synth's pitch moves (vibrato, scoops, bends, arp).
 */
export type PlayedNote = Note &
  PitchMoves & {
    grid: number;
    glideFrom?: number;
    held?: boolean;
    mono?: boolean;
    program?: number;
  };

/** tapeStop: every track winds down in pitch and speed into the beat; sendSwell: a track's delay send opens across a
 * stretch */
export type FxEvent =
  | { kind: 'tapeStop'; beat: number; seconds: number; rate: number }
  | { kind: 'sendSwell'; track: string; beat: number; beats: number; send: number };

/** one pass of an FX type: the played notes of the tracks it changes, by track id, and its events */
export interface FxPass {
  notes: Map<string, PlayedNote[]>;
  events: FxEvent[];
}

export interface FxType {
  name: string;
  perform: (project: Project, pass: number) => FxPass;
}

const types = new Map<string, FxType>();

export const registerFx = (type: string, impl: FxType): void => {
  types.set(type, impl);
};

/** a track's notes as written, ready to play */
const plainNotes = (track: Track): PlayedNote[] => trackNotes(track).map((n) => ({ ...n, grid: n.beat }));

/** the project with each track's note FX (Scale, Chord…) played into its notes, as one clip, so the FX after them
 * (Humanize) play what they made; a track with none is left as it is */
function withNoteFx(project: Project): Project {
  let changed = false;
  const tracks = project.tracks.map((t) => {
    const written = trackNotes(t);
    const notes = applyNoteFx(written, t, project);
    if (notes === written) return t;
    changed = true;
    const beats = Math.max(1, ...notes.map((n) => n.beat + n.beats)) + 1;
    return { ...t, clips: [{ id: `${t.id}-fx`, start: 0, beats, notes }] };
  });
  return changed ? { ...project, tracks } : project;
}

/** Every track's notes for one pass, through its FX, and the FX's events: tracks in the project's order, each sorted
 * by beat */
export function performProject(
  project: Project,
  pass: number,
): { tracks: PlayedNote[][]; events: FxEvent[] } {
  project = withNoteFx(project);
  const used = new Set(
    project.tracks.flatMap((t) => t.fx.map((f) => f.type)).filter((type) => types.has(type)),
  );
  const results = new Map<string, FxPass>();
  for (const type of used) {
    const impl = types.get(type);
    if (impl) results.set(type, impl.perform(project, pass));
  }
  const tracks = project.tracks.map((t) => {
    // the last of the track's FX that played it
    const fx = t.fx.findLast((f) => results.get(f.type)?.notes.has(t.id));
    return (fx && results.get(fx.type)?.notes.get(t.id)) ?? plainNotes(t);
  });
  return { tracks, events: [...results.values()].flatMap((r) => r.events) };
}

/** a track FX's name in the app: a note effect's, a registered type's, or its type */
export const fxName = (type: string): string =>
  isNoteFx(type) ? noteFxName(type) : (types.get(type)?.name ?? type);

// ── edits to a track's FX list ──────────────────────────────────────────────────────────────────────────────────────

/** adds an FX at the end of the track's list */
export const addTrackFx = (p: Project, trackId: string, fx: TrackFx): Project =>
  updateTrack(p, trackId, (t) => ({ ...t, fx: [...t.fx, fx] }));

/** removes the track's FX at `index` */
export const removeTrackFx = (p: Project, trackId: string, index: number): Project =>
  updateTrack(p, trackId, (t) => (t.fx[index] ? { ...t, fx: t.fx.filter((_, i) => i !== index) } : t));

/** moves the track's FX at `index` by `by` places (−1: earlier, so it plays first), kept inside the list */
export const moveTrackFx = (p: Project, trackId: string, index: number, by: number): Project =>
  updateTrack(p, trackId, (t) => {
    const to = Math.max(0, Math.min(t.fx.length - 1, index + by));
    const fx = t.fx[index];
    if (!fx || to === index) return t;
    const rest = t.fx.filter((_, i) => i !== index);
    return { ...t, fx: [...rest.slice(0, to), fx, ...rest.slice(to)] };
  });

/** changes the settings of the track's FX at `index` (its type stays) */
export const setTrackFx = (
  p: Project,
  trackId: string,
  index: number,
  patch: Record<string, unknown>,
): Project =>
  updateTrack(p, trackId, (t) => {
    const fx = t.fx[index];
    if (!fx || Object.entries(patch).every(([k, v]) => fx[k] === v)) return t;
    return { ...t, fx: t.fx.map((f, i) => (i === index ? { ...f, ...patch, type: f.type } : f)) };
  });

/** Apply to Notes: writes the track's note effects that are on, up to and including the one at `index`, into its
 * clips' notes, and takes them off the list, so the notes play as before and can be edited. Each clip is done on its
 * own, so the copies of a pattern stay alike; notes past a clip's end, which don't play, are kept as they are. Not for
 * Humanize or a bypassed effect: the project comes back as it is. */
export function applyFxToNotes(p: Project, trackId: string, index: number): Project {
  const on = (f: TrackFx) => isNoteFx(f.type) && f.bypass !== true;
  const track = p.tracks.find((t) => t.id === trackId);
  const fx = track?.fx[index];
  if (!track || !fx || !on(fx)) return p;
  const baked = { ...track, fx: track.fx.slice(0, index + 1).filter(on) };
  return updateTrack(p, trackId, (t) => ({
    ...t,
    fx: t.fx.filter((f, i) => i > index || !on(f)),
    clips: t.clips.map((c) => {
      const plays = (n: Note) => n.beat >= -1e-9 && n.beat < c.beats - 1e-9;
      const inside = c.notes.filter(plays);
      const notes = applyNoteFx(inside, baked, p);
      return notes === inside ? c : { ...c, notes: [...notes, ...c.notes.filter((n) => !plays(n))] };
    }),
  }));
}
