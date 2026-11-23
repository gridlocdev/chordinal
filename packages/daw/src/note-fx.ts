// Note FX: MIDI FX that change each note as it's played, in the order a track lists them, before Humanize and the
// other whole-project FX play the result. They're built in, so they need no registering: Scale moves notes into the
// project's key, and Chord stacks a chord on every note. A bypassed one is skipped. Pure.
import { MODES } from '@chordinal/lib';
import type { Mode } from '@chordinal/lib';
import type { Note, Project, Track, TrackFx } from './project.ts';

export const SCALE_FX = 'scale';
export const CHORD_FX = 'chord';

/** the chord shapes, as semitones over the note played; `key` builds the chord from the project's key instead */
export const CHORD_SHAPES = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  '7th': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  power: [0, 7, 12],
} as const satisfies Record<string, readonly number[]>;

export type ChordShape = keyof typeof CHORD_SHAPES | 'key';

/** a note effect: its name in the app, and what it does to one track's notes */
interface NoteFxType {
  name: string;
  apply: (notes: Note[], fx: TrackFx, project: Project) => Note[];
}

const isMode = (m: string): m is Mode => Object.hasOwn(MODES, m);
const mod = (n: number, m: number) => ((n % m) + m) % m;

/** the project's key as the pitch classes in it, or null with no key set */
function keyClasses(project: Project): number[] | null {
  const k = project.key;
  if (!k || !isMode(k.mode)) return null;
  return MODES[k.mode].map((i) => mod(k.tonic + i, 12));
}

/** the nearest key in the scale; a tie goes down, so a note between two moves the way a person would hear it fall */
export function snapToScale(key: number, classes: readonly number[]): number {
  for (let d = 0; d < 12; d++) {
    if (classes.includes(mod(key - d, 12))) return key - d;
    if (classes.includes(mod(key + d, 12))) return key + d;
  }
  return key;
}

/** the chord over a note: a fixed shape, or (shape `key`) thirds stacked up the project's key from the note */
export function chordOver(key: number, shape: ChordShape, classes: readonly number[] | null): number[] {
  if (shape !== 'key') return CHORD_SHAPES[shape].map((i) => key + i);
  if (!classes) return CHORD_SHAPES.major.map((i) => key + i);
  const sorted = [...classes].sort((a, b) => a - b);
  const at = sorted.indexOf(mod(key, 12));
  if (at < 0) return [key, key + 7]; // a note outside the key gets a fifth, which fits whatever chord it's passing
  const keys = [key];
  for (const step of [2, 4]) {
    const pc = sorted[(at + step) % sorted.length]!;
    keys.push(key + mod(pc - mod(key, 12), 12));
  }
  return keys;
}

/** a number param, kept in range */
const num = (v: unknown, otherwise: number, lo: number, hi: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : otherwise;

const isShape = (v: unknown): v is ChordShape =>
  v === 'key' || (typeof v === 'string' && Object.hasOwn(CHORD_SHAPES, v));

const NOTE_FX: Record<string, NoteFxType> = {
  [SCALE_FX]: {
    name: 'Scale',
    apply: (notes, _fx, project) => {
      const classes = keyClasses(project);
      return classes ? notes.map((n) => ({ ...n, key: snapToScale(n.key, classes) })) : notes;
    },
  },
  [CHORD_FX]: {
    name: 'Chord',
    apply: (notes, fx, project) => {
      const shape = isShape(fx.shape) ? fx.shape : 'key';
      const spread = Math.round(num(fx.octave, 0, -2, 2)) * 12; // the chord's notes over the note played move by octaves
      const classes = keyClasses(project);
      const seen = new Set<string>();
      const out: Note[] = [];
      for (const n of notes)
        for (const [i, k] of chordOver(n.key, shape, classes).entries()) {
          const key = i === 0 ? k : k + spread;
          const id = `${n.beat}:${key}`;
          if (key < 0 || key > 127 || seen.has(id)) continue; // two notes making the same key play it once
          seen.add(id);
          out.push({ ...n, key });
        }
      return out;
    },
  },
};

/** whether a track FX is a built-in note effect */
export const isNoteFx = (type: string): boolean => Object.hasOwn(NOTE_FX, type);

/** a note effect's name in the app */
export const noteFxName = (type: string): string => NOTE_FX[type]?.name ?? type;

/** a track's notes through its note FX, in order; the notes as written when it has none */
export function applyNoteFx(notes: Note[], track: Track, project: Project): Note[] {
  let out = notes;
  for (const fx of track.fx) {
    const type = NOTE_FX[fx.type];
    if (type && fx.bypass !== true) out = type.apply(out, fx, project);
  }
  return out === notes ? notes : out.sort((a, b) => a.beat - b.beat || a.key - b.key);
}
