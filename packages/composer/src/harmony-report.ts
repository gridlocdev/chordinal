// How a composed song's harmony reads, for the harmony report (tools/harmony-report.mjs) and the test that keeps
// genres apart: each chord as a numeral against its section's key, the share of plain triads, the chord colours it
// uses, the four-chord windows it plays and the chords each section ends on; and the lead's melodic fingerprint
// (pace, steps against leaps, syncopation, range, notes outside the key), which keeps genres' tunes apart. Pure: reads
// a score.
import { inScale } from '@chordinal/lib';
import type { Score, ScoreNote, ScoreSection } from './compose.ts';

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NUMERAL = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII'];

/** a chord name's root pitch class and its quality ('' for a major triad): 'Bbm7/F' → { root: 10, quality: 'm7' } */
export function readChordName(name: string): { root: number; quality: string } {
  const m = name.match(/^([A-G])([#b]?)([^/]*)/);
  if (!m) throw new Error(`not a chord name: ${name}`);
  const [, letter = '', accidental, quality = ''] = m;
  return {
    root: (LETTER[letter]! + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0) + 12) % 12,
    quality,
  };
}

/** a chord as a numeral in its section's key */
export interface ChordNumeral {
  beat: number;
  numeral: string;
  quality: string;
  section: ScoreSection;
}

/** a lead's melodic fingerprint (see melodyStats) */
export interface MelodyStats {
  pace: number;
  steps: number;
  leaps: number;
  repeats: number;
  offbeat: number;
  length: number;
  range: number;
  outside: number;
}

// a numeral with its quality, minor and diminished in lower case: ii7, viiø, bVImaj7
const named = (c: { numeral: string; quality: string }): string =>
  /^(m(?!aj)|dim)/.test(c.quality)
    ? c.numeral.toLowerCase() + c.quality.replace(/^m(?!aj)/, '')
    : c.numeral + c.quality;

/** the score's chords as numerals in their section's key, with what kind of chord each is */
export function numerals(score: Score): ChordNumeral[] {
  return score.chords.map((c) => {
    // the first section starts at beat 0, so every chord has one
    const sec = score.sections.findLast((s) => s.beat <= c.beat + 1e-9)!;
    const { root, quality } = readChordName(c.name);
    return { beat: c.beat, numeral: NUMERAL[(root - sec.tonic + 120) % 12]!, quality, section: sec };
  });
}

/**
 * A song's harmonic fingerprint:
 *   chords     how many
 *   triads     the share that are plain major or minor triads
 *   qualities  { quality: count }, '' for major
 *   windows    the set of four-numeral windows it plays (roots only), what makes progressions sound alike
 *   endings    the last two chords of each section, as numerals
 */
export function harmonyStats(score: Score) {
  const all = numerals(score);
  const qualities: Record<string, number> = {};
  for (const c of all) qualities[c.quality] = (qualities[c.quality] ?? 0) + 1;
  const triads = all.filter((c) => c.quality === '' || c.quality === 'm').length / Math.max(1, all.length);
  const windows = new Set<string>();
  for (let i = 0; i + 4 <= all.length; i++)
    windows.add(
      all
        .slice(i, i + 4)
        .map((c) => c.numeral)
        .join(' '),
    );
  const endings = score.sections.map((s) => {
    const inSec = all.filter((c) => c.beat >= s.beat - 1e-9 && c.beat < s.beat + s.beats - 1e-9);
    return inSec.slice(-2).map(named).join(' ');
  });
  return { chords: all.length, triads, qualities, windows, endings };
}

/** how alike two sets are, 0 to 1 (Jaccard: shared over all) */
export function overlap<T>(a: Set<T>, b: Set<T>): number {
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  const all = a.size + b.size - shared;
  return all ? shared / all : 0;
}

/**
 * The lead's fingerprint, each a share or a size, so two songs' tunes can be compared:
 *   pace      notes per beat while it plays (from its first note to its last)
 *   steps     intervals of a tone or less      leaps   of a fourth or more      repeats  the same pitch again
 *   offbeat   notes that start off the beat    length  the mean note, in beats  range    semitones, low 5% to high 5%
 *   outside   notes outside the section's scale: blue notes, chromatic passing notes, a secondary chord's leading tone
 */
export function melodyStats(score: Score): MelodyStats {
  const lead = score.tracks.find((t) => t.role === 'lead');
  // one note per onset, the top one: a harmonised lead is still one line
  const byBeat = new Map<number, ScoreNote>();
  for (const n of lead?.notes ?? []) {
    const top = byBeat.get(n.beat);
    if (!top || top.key < n.key) byBeat.set(n.beat, n);
  }
  const notes = [...byBeat.values()].sort((a, b) => a.beat - b.beat);
  if (notes.length < 2)
    return { pace: 0, steps: 0, leaps: 0, repeats: 0, offbeat: 0, length: 0, range: 0, outside: 0 };
  const moves = notes.slice(1).map((n, i) => Math.abs(n.key - notes[i]!.key));
  const share = (f: (move: number) => boolean): number => moves.filter(f).length / moves.length;
  const keys = notes.map((n) => n.key).sort((a, b) => a - b);
  const at = (q: number): number => keys[Math.min(keys.length - 1, Math.floor(q * keys.length))]!;
  const first = notes[0]!,
    last = notes.at(-1)!;
  return {
    pace: notes.length / Math.max(1, last.beat + last.beats - first.beat),
    steps: share((m) => m > 0 && m <= 2),
    leaps: share((m) => m >= 5),
    repeats: share((m) => m === 0),
    offbeat: notes.filter((n) => Math.abs(n.beat - Math.round(n.beat)) > 1e-3).length / notes.length,
    length: notes.reduce((t, n) => t + n.beats, 0) / notes.length,
    range: at(0.95) - at(0.05),
    outside:
      notes.filter((n) => {
        const sec = score.sections.findLast((s) => s.beat <= n.beat + 1e-9) ?? score.sections[0]!;
        return !inScale(sec.tonic, sec.mode, n.key);
      }).length / notes.length,
  };
}

// how much each feature counts in the distance: shares as they are, pace and length per beat, range per octave
const WEIGHT: MelodyStats = {
  pace: 1,
  steps: 1,
  leaps: 1,
  repeats: 1,
  offbeat: 1,
  length: 1,
  range: 1 / 12,
  outside: 1,
};

// the features in WEIGHT's order, so the sum adds up in the same order
const FEATURES = [
  'pace',
  'steps',
  'leaps',
  'repeats',
  'offbeat',
  'length',
  'range',
  'outside',
] as const satisfies (keyof MelodyStats)[];

/** how far apart two melodic fingerprints are: 0 the same, about 0.3 clearly different tunes */
export function melodyDistance(a: MelodyStats, b: MelodyStats): number {
  return Math.sqrt(FEATURES.reduce((t, k) => t + ((a[k] - b[k]) * WEIGHT[k]) ** 2, 0));
}
