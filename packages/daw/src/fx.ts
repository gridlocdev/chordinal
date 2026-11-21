// MIDI FX: code that changes a track's notes as they play, a little differently on each pass round a loop. A type is
// registered once (the app registers them, so this layer needs none of their code); a track lists the types it uses
// in track.fx. One type runs once per pass for the whole project, so it can share a plan across its tracks.
import { trackNotes } from './project.ts';
import type { Note, Project, Track } from './project.ts';

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

export interface PitchMoves {
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
export type PlayedNote = Note & {
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

/** Every track's notes for one pass, through its FX, and the FX's events: tracks in the project's order, each sorted
 * by beat */
export function performProject(
  project: Project,
  pass: number,
): { tracks: PlayedNote[][]; events: FxEvent[] } {
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
