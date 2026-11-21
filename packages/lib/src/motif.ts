// A motif and the classic ways to develop it. Pure.
// A motif is a few notes over a fixed length: each note's start and length in beats and its height in scale steps
// above (or below) the motif's first note. Transformations return new motifs and never change the one given.

export interface MotifNote {
  beat: number;
  beats: number;
  step: number;
}
export interface Motif {
  notes: MotifNote[];
  beats: number;
}

const map = (m: Motif, fn: (n: MotifNote) => MotifNote): Motif => ({
  beats: m.beats,
  notes: m.notes.map(fn),
});

/** the same notes again, `by` scale steps higher (negative: lower) */
export const sequence = (m: Motif, by = 1): Motif => map(m, (n) => ({ ...n, step: n.step + by }));

/** every interval flipped: up becomes down, around the first note */
export const invert = (m: Motif): Motif => map(m, (n) => ({ ...n, step: 0 - n.step }));

/** the notes backwards, rests and all */
export function retrograde(m: Motif): Motif {
  return {
    beats: m.beats,
    notes: m.notes.map((n) => ({ ...n, beat: m.beats - n.beat - n.beats })).reverse(),
  };
}

/** every length times f: augmentation for f > 1, diminution for f < 1 */
export function augment(m: Motif, f = 2): Motif {
  return { beats: m.beats * f, notes: m.notes.map((n) => ({ ...n, beat: n.beat * f, beats: n.beats * f })) };
}

/** the notes in the first `beats` of the motif, then those again a step lower, filling its length */
export function fragment(m: Motif, beats = m.beats / 2): Motif {
  const part = m.notes
    .filter((n) => n.beat < beats - 1e-9)
    .map((n) => ({ ...n, beats: Math.min(n.beats, beats - n.beat) }));
  if (!part.length) return m;
  const notes: MotifNote[] = [];
  for (let t = 0, k = 0; t < m.beats - 1e-9; t += beats, k++)
    for (const n of part)
      if (t + n.beat < m.beats - 1e-9)
        notes.push({
          ...n,
          beat: t + n.beat,
          beats: Math.min(n.beats, m.beats - t - n.beat),
          step: n.step - k,
        });
  return { beats: m.beats, notes };
}

/** two motifs one after the other */
export function join(a: Motif, b: Motif): Motif {
  return {
    beats: a.beats + b.beats,
    notes: [...a.notes, ...b.notes.map((n) => ({ ...n, beat: n.beat + a.beats }))],
  };
}

/**
 * A development by name. Every one keeps the motif's length except augment, which doubles it:
 *   repeat · sequence (a step up) · invert · retrograde · augment · diminish (twice as fast, played twice, rising) · fragment
 */
export function develop(m: Motif, how: string): Motif {
  switch (how) {
    case 'repeat':
      return m;
    case 'sequence':
      return sequence(m, 1);
    case 'invert':
      return invert(m);
    case 'retrograde':
      return retrograde(m);
    case 'augment':
      return augment(m, 2);
    case 'diminish': {
      const half = augment(m, 0.5);
      return join(half, sequence(half, 1));
    }
    case 'fragment':
      return fragment(m);
    default:
      throw new Error(`unknown motif development: ${how}`);
  }
}
