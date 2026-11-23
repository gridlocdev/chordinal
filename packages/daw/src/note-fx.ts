// Note FX: MIDI FX that change each note as it's played, in the order a track lists them, before Humanize and the
// other whole-project FX play the result. They're built in, so they need no registering: Scale moves notes into the
// project's key, Chord stacks a chord on every note, and Arpeggiator plays the notes held together one at a time, in
// steps timed in beats so they follow the tempo. A bypassed one is skipped. Pure.
import { MODES } from '@chordinal/lib';
import type { Mode } from '@chordinal/lib';
import type { Note, Project, Track, TrackFx } from './project.ts';

export const SCALE_FX = 'scale';
export const CHORD_FX = 'chord';
export const ARP_FX = 'arp';

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

// ── Arpeggiator ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** the arpeggiator's rates: a step's length in beats (a beat is a quarter note; `t` is a triplet) */
export const ARP_RATES = {
  '1/4': 1,
  '1/8': 1 / 2,
  '1/8t': 1 / 3,
  '1/16': 1 / 4,
  '1/16t': 1 / 6,
  '1/32': 1 / 8,
} as const;
export type ArpRate = keyof typeof ARP_RATES;
/** the order it plays the held notes in: low to high, high to low, up then back down, the order they were pressed in,
 * or a random order that is the same every time */
export const ARP_DIRECTIONS = ['up', 'down', 'updown', 'played', 'random'] as const;
export type ArpDirection = (typeof ARP_DIRECTIONS)[number];

export interface ArpSettings {
  rate: ArpRate;
  /** a step's length in beats */
  step: number;
  direction: ArpDirection;
  /** how many octaves up it climbs, 1 to 4 */
  octaves: number;
  /** how much of a step each note sounds for, 0.05 to 1 */
  gate: number;
}

/** an arpeggiator's settings, with the defaults for any missing or out of range */
export function arpSettings(fx: TrackFx): ArpSettings {
  const rate =
    typeof fx.rate === 'string' && Object.hasOwn(ARP_RATES, fx.rate) ? (fx.rate as ArpRate) : '1/16';
  const direction = ARP_DIRECTIONS.find((d) => d === fx.direction) ?? 'up';
  return {
    rate,
    step: ARP_RATES[rate],
    direction,
    octaves: Math.round(num(fx.octaves, 1, 1, 4)),
    gate: num(fx.gate, 0.8, 0.05, 1),
  };
}

/** the keys one round of the arpeggio plays, from the keys held (in the order they were pressed) */
export function arpCycle(held: readonly number[], direction: ArpDirection, octaves: number): number[] {
  const once = [...new Set(held)];
  const base = direction === 'played' ? once : once.sort((a, b) => a - b);
  const span: number[] = [];
  for (let o = 0; o < octaves; o++) for (const k of base) if (k + 12 * o <= 127) span.push(k + 12 * o);
  if (direction === 'down') return span.reverse();
  if (direction === 'updown' && span.length > 2) return [...span, ...span.slice(1, -1).reverse()];
  return span;
}

/** a step's place in a random arpeggio: a hash of the step, so the same steps play the same keys every time */
function shuffle(n: number): number {
  let h = Math.imul(n + 1, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  return (h ^ (h >>> 13)) >>> 0;
}

/** the key the arpeggio plays at its `n`th step (from 0) through `cycle` */
export function arpKey(cycle: readonly number[], n: number, direction: ArpDirection): number {
  const i = direction === 'random' ? shuffle(n) % cycle.length : n % cycle.length;
  return cycle[i]!;
}

const EPS = 1e-6;

/** notes through the arpeggiator: each stretch of notes held together (a phrase) plays in steps from its first note,
 * each step the next key of the notes held at that moment */
function arpeggiate(notes: Note[], fx: TrackFx): Note[] {
  const s = arpSettings(fx);
  const sorted = notes.toSorted((a, b) => a.beat - b.beat);
  const out: Note[] = [];
  for (let i = 0; i < sorted.length;) {
    let end = sorted[i]!.beat + sorted[i]!.beats;
    let j = i + 1;
    while (j < sorted.length && sorted[j]!.beat < end - EPS)
      end = Math.max(end, sorted[j]!.beat + sorted[j++]!.beats);
    const phrase = sorted.slice(i, j);
    const start = phrase[0]!.beat;
    for (let n = 0; start + n * s.step < end - EPS; n++) {
      const t = start + n * s.step;
      const held = phrase.filter((p) => p.beat <= t + EPS && p.beat + p.beats > t + EPS);
      if (!held.length) continue;
      const key = arpKey(
        arpCycle(
          held.map((h) => h.key),
          s.direction,
          s.octaves,
        ),
        n,
        s.direction,
      );
      const vel = Math.max(...held.map((h) => h.vel));
      out.push({ beat: t, beats: Math.min(s.step * s.gate, end - t), key, vel });
    }
    i = j;
  }
  return out;
}

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
  [ARP_FX]: { name: 'Arpeggiator', apply: (notes, fx) => arpeggiate(notes, fx) },
};

/** whether a track FX is a built-in note effect */
export const isNoteFx = (type: string): boolean => Object.hasOwn(NOTE_FX, type);

/** a note effect's name in the app */
export const noteFxName = (type: string): string => NOTE_FX[type]?.name ?? type;

/** a track's FX split at its first arpeggiator that's on: the FX before it, it, and the FX after it; null with none */
export function splitAtArp(
  fx: readonly TrackFx[],
): { before: TrackFx[]; arp: TrackFx; after: TrackFx[] } | null {
  const i = fx.findIndex((f) => f.type === ARP_FX && f.bypass !== true);
  return i < 0 ? null : { before: fx.slice(0, i), arp: fx[i]!, after: fx.slice(i + 1) };
}

/** a track's notes through its note FX, in order; the notes as written when it has none */
export function applyNoteFx(notes: Note[], track: Track, project: Project): Note[] {
  let out = notes;
  for (const fx of track.fx) {
    const type = NOTE_FX[fx.type];
    if (type && fx.bypass !== true) out = type.apply(out, fx, project);
  }
  return out === notes ? notes : out.sort((a, b) => a.beat - b.beat || a.key - b.key);
}
