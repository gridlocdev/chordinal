// A note's bend: a pitch curve over a held note, as points of cents off its key (on top of the note's detune) at beats
// into the note, joined by straight lines. Before the first point the note is at its own pitch (0), unless a point
// sits at 0; after the last point it holds there. A project keeps it on the note, the voice plays it and a MIDI file
// writes it as pitch bend over the note. Pure.

/** cents off the key (over the note's detune) `beat` beats into the note */
export interface BendPoint {
  beat: number;
  cents: number;
}

const MAX_CENTS = 2400; // two octaves either way: a tracker's fall can drop a note that far

/** a note's bend mark read safely: its points in beat order, or null when it has none or it isn't a curve */
export function readBend(mark: unknown): BendPoint[] | null {
  if (!Array.isArray(mark) || !mark.length) return null;
  const points: BendPoint[] = [];
  for (const p of mark as unknown[]) {
    if (typeof p !== 'object' || p === null) return null;
    const { beat, cents } = p as Record<string, unknown>;
    if (typeof beat !== 'number' || typeof cents !== 'number') return null;
    if (!Number.isFinite(beat) || beat < 0 || !Number.isFinite(cents) || Math.abs(cents) > MAX_CENTS)
      return null;
    points.push({ beat, cents });
  }
  return points.sort((a, b) => a.beat - b.beat);
}

/** the bend's cents `beat` beats into the note (points in beat order) */
export function bendAt(points: readonly BendPoint[], beat: number): number {
  let before: BendPoint = { beat: 0, cents: 0 };
  for (const p of points) {
    if (p.beat >= beat) {
      if (p.beat === before.beat) return p.cents;
      return before.cents + ((p.cents - before.cents) * (beat - before.beat)) / (p.beat - before.beat);
    }
    before = p;
  }
  return before.cents;
}

/**
 * The bend from `from` beats into the note on, as a voice plays it: `at` seconds after the voice starts. The first
 * point is where the curve is at `from` (a voice started partway through a held note picks the curve up there);
 * `seconds` gives the seconds after the voice's start of a beat into the note.
 */
export function bendCurve(
  points: readonly BendPoint[],
  from: number,
  seconds: (beat: number) => number,
): { at: number; cents: number }[] {
  return [
    { at: 0, cents: bendAt(points, from) },
    ...points.filter((p) => p.beat > from).map((p) => ({ at: seconds(p.beat), cents: p.cents })),
  ];
}
