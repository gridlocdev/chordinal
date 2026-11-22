// Where things fall in time, as a performance reads it: a meter's beat groups, swing as a time warp, and the
// section a beat is in. The composer writes with the same helpers.

/** the part of a meter the timing helpers read: its beat groups, in beats */
export interface Grouped {
  groups: number[];
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** a meter whose groups split beats (6/8, 12/8, 7/8): its eighths are the pulse, so it isn't swung */
export const compound = (meter: Grouped): boolean => meter.groups.some((g) => !Number.isInteger(g));

/**
 * Swing as a time warp, applied to every start and end at playback so the whole song shares one feel.
 * The second `sub` of each pair lands at `amount` of the pair: 0.5 is straight, 2/3 a full triplet.
 * sub: 0.5 swings eighths, 0.25 sixteenths
 */
export function swingTime(beat: number, amount: number, sub = 0.5): number {
  const pair = sub * 2;
  const base = Math.floor(beat / pair + 1e-9) * pair;
  const frac = (beat - base) / pair;
  const warped = frac < 0.5 ? frac * (amount / 0.5) : amount + (frac - 0.5) * ((1 - amount) / 0.5);
  return base + warped * pair;
}

/** a spec's swing (0 straight … 1 triplet) as a swingTime amount */
export const swingAmount = (swing: number): number => 0.5 + swing / 6;

/** the section a beat falls in (the first, before it starts) */
export const sectionAt = <S extends { beat: number }>(sections: S[], beat: number): S =>
  (sections.findLast((s) => s.beat <= beat + 1e-9) ?? sections[0])!;
