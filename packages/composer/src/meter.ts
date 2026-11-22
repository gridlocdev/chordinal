// Where things fall in time: chords over bars, metric accents from a meter's beat groups, swing, and which bar a
// beat is in when sections have meters of their own. Shared by the melody, the parts and the performance.
import { DYNAMICS, type Role } from './composer-data.ts';
import { clamp, compound, swingTime, swingAmount, sectionAt } from '@chordinal/perform';
import type { Grouped } from '@chordinal/perform';

// the timing a performance reads too is @chordinal/perform's
export { clamp, compound, swingTime, swingAmount, sectionAt };
export type { Grouped };
/** a chord laid over the beats it lasts */
export interface Timed<C> {
  chord: C;
  beat: number;
  beats: number;
}
/** how strongly a position in the bar falls */
export type MetricWeight = 'downbeat' | 'strong' | 'weak' | 'offbeat' | 'sixteenth';
/** anything laid out in sections of their own meter: a section plan, or its beat, length and bar */
export interface Span {
  beat: number;
  beats: number;
  beatsPerBar: number;
}
/** a bar's place: bar counts from 0; start is its first beat */
export interface BarPlace {
  bar: number;
  start: number;
  beatsPerBar: number;
  section: number;
}

export const STEP = 0.25; // beats per pattern step (a sixteenth note)
export const mod = (n: number, m: number): number => ((n % m) + m) % m;
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;

// lays the progression over the section's bars, repeating it as needed and cutting it at the end
export function chordTimeline<C>(
  progression: { chord: C; bars: number }[],
  bars: number,
  beatsPerBar: number,
  start: number,
): Timed<C>[] {
  const total = bars * beatsPerBar,
    out: Timed<C>[] = [];
  for (let b = 0, i = 0; b < total - 1e-9; i++) {
    const { chord, bars: len } = progression[i % progression.length]!;
    const beats = Math.min(len * beatsPerBar, total - b);
    out.push({ chord, beat: start + b, beats });
    b += beats;
  }
  return out;
}

export const chordAt = <C>(timeline: Timed<C>[], beat: number): C =>
  (timeline.findLast((c) => c.beat <= beat + 1e-9) ?? timeline[0])!.chord;

/** where each of a meter's beat groups starts, in beats from the bar line */
export function groupStarts(meter: Grouped): number[] {
  const out: number[] = [];
  for (let i = 0, at = 0; i < meter.groups.length; at += meter.groups[i++]!) out.push(at);
  return out;
}

/** downbeat, strong (a group's start), weak (another beat), offbeat (an eighth between) or sixteenth */
export function metricWeight(meter: Grouped, inBar: number): MetricWeight {
  if (inBar < 1e-9) return 'downbeat';
  if (groupStarts(meter).some((g) => near(g, inBar))) return 'strong';
  const frac = inBar - Math.floor(inBar);
  if (frac < 1e-9 || frac > 1 - 1e-9) return 'weak';
  return near(frac, 0.5) ? 'offbeat' : 'sixteenth';
}

/** a strong beat for the melody: the downbeat or a group's start */
export function strongBeat(meter: Grouped, inBar: number): boolean {
  const w = metricWeight(meter, inBar);
  return w === 'downbeat' || w === 'strong';
}

// sec: anything with meter, beatsPerBar and dynamics (a section plan)
export function velocity(
  sec: { meter: Grouped; beatsPerBar: number; dynamics: number },
  role: Role,
  energy: number,
  beatInSection: number,
): number {
  const accent = DYNAMICS.accent[metricWeight(sec.meter, mod(beatInSection, sec.beatsPerBar))];
  const v =
    (DYNAMICS.base + energy * DYNAMICS.span + DYNAMICS.role[role] + accent) * (0.6 + 0.6 * sec.dynamics);
  return clamp(Math.round(v), 1, 127);
}

/** The bar a beat falls in, counting across sections with different meters. */
export function barAt(sections: Span[], beat: number): BarPlace {
  let bars = 0;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]!;
    if (beat < s.beat + s.beats - 1e-9 || i === sections.length - 1) {
      const k = Math.max(0, Math.floor((beat - s.beat) / s.beatsPerBar + 1e-9));
      return { bar: bars + k, start: s.beat + k * s.beatsPerBar, beatsPerBar: s.beatsPerBar, section: i };
    }
    bars += Math.round(s.beats / s.beatsPerBar);
  }
  return { bar: 0, start: 0, beatsPerBar: 4, section: 0 };
}

/** every bar line from `from` to `to`, in beats */
export function barLines(sections: Span[], from: number, to: number): number[] {
  const out: number[] = [];
  for (const s of sections)
    for (let b = s.beat; b < s.beat + s.beats - 1e-9; b += s.beatsPerBar) {
      if (b >= to) return out;
      if (b >= from) out.push(b);
    }
  return out;
}
