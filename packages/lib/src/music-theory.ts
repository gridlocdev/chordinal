// Keys, modes, scale degrees and Roman-numeral chords, as MIDI numbers. Pure.

const PITCH_CLASSES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** semitones above the tonic of each of a mode's seven steps */
export type Scale = readonly [number, number, number, number, number, number, number];

const major: Scale = [0, 2, 4, 5, 7, 9, 11];
const minor: Scale = [0, 2, 3, 5, 7, 8, 10];

// semitones above the tonic of each scale step
export const MODES = {
  major,
  minor,
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  ionian: major,
  aeolian: minor,
} satisfies Record<string, Scale>;

/** a mode's name: major, minor, dorian … */
export type Mode = keyof typeof MODES;

const mod = (n: number, m: number): number => ((n % m) + m) % m;
/** the semitones above the tonic of a scale step, counting from 0 and wrapping round the octave */
const stepOf = (scale: Scale, i: number): number => scale[mod(i, 7)] ?? 0;

/** 'C' → 0, 'F#' → 6, 'Bb' → 10 */
export function pitchClass(name: string): number {
  const m = /^([A-G])(#|b)?$/.exec(name);
  if (!m) throw new Error(`not a key: ${name}`);
  return mod((PITCH_CLASSES[m[1] ?? ''] ?? 0) + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0), 12);
}

/** a pitch class's name, spelled with flats in flat keys */
export const pitchName = (pc: number, flats = false): string =>
  (flats ? FLAT_NAMES : SHARP_NAMES)[mod(pc, 12)] ?? '';

/**
 * MIDI key of a scale degree. Degrees count from 1 and keep going past 7 (8 = the tonic an octave up, 0 = the 7th below).
 * octave 4 puts degree 1 between C4 (60) and B4.
 */
export function degreeToKey(tonic: number, mode: Mode, degree: number, octave = 4, accidental = 0): number {
  const d = degree - 1;
  return (octave + 1) * 12 + tonic + stepOf(MODES[mode], d) + 12 * Math.floor(d / 7) + accidental;
}

/** the scale degree (1-based, unbounded) whose key is nearest to a MIDI key; ties go down */
export function keyToDegree(tonic: number, mode: Mode, key: number, octave = 4): number {
  let best = 1,
    bestDist = Infinity;
  const guess = Math.round(((key - degreeToKey(tonic, mode, 1, octave)) / 12) * 7) + 1;
  for (let d = guess - 3; d <= guess + 3; d++) {
    const dist = Math.abs(degreeToKey(tonic, mode, d, octave) - key);
    if (dist < bestDist || (dist === bestDist && d < best)) {
      best = d;
      bestDist = dist;
    }
  }
  return best;
}

export const inScale = (tonic: number, mode: Mode, key: number): boolean =>
  MODES[mode].includes(mod(key - tonic, 12));

/**
 * A chord read from a Roman numeral: root is a pitch class, tones are semitones above it (root first), degree is the
 * numeral's step 1–7 (0 for X/Y), step is the scale step the root stands on (the G of G# in A minor), 0 when unknown;
 * bass is the pitch class under the chord when it isn't the root
 */
export interface Chord {
  symbol: string;
  root: number;
  tones: number[];
  degree: number;
  step: number;
  bass?: number;
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const CHORD =
  /^(b|#)?(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(°|o|ø|\+)?(maj7|maj9|maj13|add9|7sus4|9sus4|sus2|sus4|13|11|7|9|6)?((?:b9|#9|#11|b13)*)$/;
// the tensions above the octave, in semitones over the root: what an altered or extended chord adds
const ALTERED: Record<string, number> = { b9: 13, '#9': 15, '#11': 18, b13: 20 };
const NINTH = 14,
  ELEVENTH = 17,
  THIRTEENTH = 21;
const TENSIONS = new Set([...Object.values(ALTERED), ELEVENTH, THIRTEENTH]);

/**
 * A Roman-numeral chord in a key. Case gives the quality (V major, v minor), then ° dim, ø half-dim, + aug,
 * and a suffix 7, maj7, 9, maj9, add9, 6, sus2, sus4, 7sus4, 9sus4, 11, 13, maj13, then any of the altered
 * tensions b9, #9, #11, b13 (V7b9, V7#9, Imaj7#11, V13b9). An 11 chord with a major 3rd leaves the 3rd out (V11 is
 * the 9sus4 with its 11 named), as the 11th a half step above it would clash; ii11 keeps it. A plain numeral counts in the song's mode (VII
 * in minor is the flat seven), except a diminished vii, which is built on the leading tone in every mode; with b or #
 * it counts from the major scale, as usual: bVII is a whole step below the tonic in any mode, bVI and bIII are
 * borrowed from the parallel minor, bII is the Neapolitan. `X/Y` is chord X in the major key of chord Y's root, the
 * secondary dominants and leading-tone chords: V7/vi, vii°7/V. A scale degree after the slash puts that degree in the
 * bass: I/3 is the first inversion, I/5 the cadential six-four, V/7 the G/B of a falling bass line, IV/1 F over a C
 * pedal, I/b7 the C/Bb of a mixolydian bass line (accidentals count from the mode, as in a melody).
 */
export function parseChord(symbol: string, tonic: number, mode: Mode): Chord {
  const over = /\/([b#]?[1-7])$/.exec(symbol);
  if (over)
    return {
      ...parseChord(symbol.slice(0, over.index), tonic, mode),
      symbol,
      bass: degreePitchClass(over[1] ?? '', tonic, mode),
    };
  const slash = symbol.indexOf('/');
  if (slash >= 0) {
    const target = parseChord(symbol.slice(slash + 1), tonic, mode);
    const inner = parseChord(symbol.slice(0, slash), target.root, 'major');
    return { ...inner, symbol, degree: 0, step: target.step && mod(target.step + inner.step - 2, 7) + 1 };
  }
  const m = CHORD.exec(symbol);
  if (!m) throw new Error(`not a chord: ${symbol}`);
  const [, acc, numeral = '', quality, ext, alts] = m;
  const degree = NUMERALS.indexOf(numeral.toUpperCase()) + 1;
  const upper = numeral === numeral.toUpperCase();
  const leadingTone = !acc && degree === 7 && (quality === '°' || quality === 'o' || quality === 'ø');
  const root = mod(
    tonic +
      (acc
        ? stepOf(MODES.major, degree - 1) + (acc === 'b' ? -1 : 1)
        : leadingTone
          ? 11
          : stepOf(MODES[mode], degree - 1)),
    12,
  );

  let tones =
    quality === '°' || quality === 'o'
      ? [0, 3, 6]
      : quality === 'ø'
        ? [0, 3, 6, 10]
        : quality === '+'
          ? [0, 4, 8]
          : upper
            ? [0, 4, 7]
            : [0, 3, 7];
  const dim = quality === '°' || quality === 'o';
  if (ext === '7') tones = [...tones, dim ? 9 : 10];
  else if (ext === '9') tones = [...tones, 10, 14];
  else if (ext === 'maj7') tones = [...tones, 11];
  else if (ext === 'maj9') tones = [...tones, 11, 14];
  else if (ext === 'add9') tones = [...tones, 14];
  else if (ext === '6') tones = [...tones, 9];
  else if (ext === 'sus2') tones = [0, 2, ...tones.slice(2)];
  else if (ext === 'sus4') tones = [0, 5, ...tones.slice(2)];
  else if (ext === '7sus4') tones = [0, 5, ...tones.slice(2), 10];
  else if (ext === '9sus4') tones = [0, 5, ...tones.slice(2), 10, 14];
  else if (ext === '11') tones = [...(upper ? [0, 7] : tones), 10, NINTH, ELEVENTH];
  else if (ext === '13') tones = [...tones, 10, NINTH, THIRTEENTH];
  else if (ext === 'maj13') tones = [...tones, 11, NINTH, THIRTEENTH];
  for (const alt of alts?.match(/b9|#9|#11|b13/g) ?? []) tones = [...tones, ALTERED[alt]!];
  return { symbol, root, tones: [...new Set(tones)], degree, step: degree };
}

/** a scale degree written like a melody's ('5', 'b7', '#4') as a pitch class */
export function degreePitchClass(text: string | number, tonic: number, mode: Mode): number {
  const m = /^([b#]?)([1-7])$/.exec(String(text));
  if (!m) throw new Error(`not a degree: ${text}`);
  return mod(degreeToKey(tonic, mode, Number(m[2]), 4, m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0), 12);
}

/** the chord's pitch classes */
export const chordPitchClasses = (chord: { root: number; tones: number[] }): number[] =>
  chord.tones.map((t) => mod(chord.root + t, 12));

/** a chord's name in letters, e.g. 'Am7' for vi7 in C */
export function chordName(chord: { root: number; tones: number[]; bass?: number }, flats = false): string {
  // the 11th, 13th and altered tensions are named after the chord; the 9th counts as a 2nd for a sus2, as it always has
  const t = new Set(chord.tones.filter((x) => !TENSIONS.has(x)).map((x) => x % 12));
  const eleventh = chord.tones.includes(ELEVENTH),
    thirteenth = chord.tones.includes(THIRTEENTH);
  const alt = Object.entries(ALTERED)
    .filter(([, x]) => chord.tones.includes(x))
    .map(([text]) => text)
    .join('');
  const name = pitchName(chord.root, flats);
  const over =
    chord.bass !== undefined && chord.bass !== chord.root ? `/${pitchName(chord.bass, flats)}` : '';
  const third = t.has(4) ? '' : t.has(3) ? 'm' : '';
  const sus = !t.has(3) && !t.has(4) ? (t.has(5) ? 'sus4' : eleventh ? '' : t.has(2) ? 'sus2' : '5') : '';
  if (t.has(3) && t.has(6)) return name + (t.has(10) ? 'm7b5' : t.has(9) ? 'dim7' : 'dim') + alt + over;
  if (t.has(4) && t.has(8)) return name + 'aug' + alt + over;
  const ninth = chord.tones.includes(14);
  const top = thirteenth ? '13' : eleventh ? '11' : ninth ? '9' : '7';
  const seventh = t.has(11) ? 'maj' + top : t.has(10) ? top : t.has(9) ? '6' : '';
  const add = ninth && !seventh ? 'add9' : eleventh && !seventh ? 'add11' : '';
  return name + third + seventh + sus + add + alt + over;
}

/** a stable 32-bit hash of any strings/numbers (FNV-1a), for choices that must be the same every time */
export function hash(...parts: (string | number | boolean | null | undefined)[]): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join('\u0001')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
