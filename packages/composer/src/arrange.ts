// Arrangement passes over a section once its parts are written: parts entering one at a time across an intro,
// leaving in reverse across an outro, and the breath before a payoff, where everything but a few parts stops.
import { ENTRY_ORDER } from './composer-data.ts';
import type { ScoreTrack } from './compose.ts';
import type { SectionPlan } from './plan.ts';

/** marks: each track's note count before this section was written: its notes start there */
export function arrangeSection(sec: SectionPlan, tracks: ScoreTrack[], marks: number[]): void {
  const end = sec.beat + sec.beats,
    bar = sec.beatsPerBar;
  const own = (i: number): boolean => tracks[i]!.notes.length > marks[i]!;
  // keeps a track's section notes outside [from, to); notes running into the gap are cut short, drums are just dropped
  const silence = (i: number, from: number, to: number): void => {
    const t = tracks[i]!,
      mark = marks[i]!;
    const kept = t.notes.slice(mark).flatMap((n) => {
      if (n.beat >= from - 1e-9 && n.beat < to - 1e-9)
        return t.role === 'drums'
          ? []
          : n.beat + n.beats > to + 0.5
            ? [{ ...n, beat: to, beats: n.beat + n.beats - to }]
            : [];
      if (n.beat < from && n.beat + n.beats > from + 1e-9) return [{ ...n, beats: from - n.beat }];
      return [n];
    });
    t.notes.splice(mark, Infinity, ...kept);
  };
  const order = ENTRY_ORDER.map((r) => tracks.findIndex((t) => t.role === r)).filter((i) => i >= 0 && own(i));

  if (sec.entries && order.length > 1)
    order.forEach((i, k) => {
      const at = sec.beat + Math.floor((k * sec.bars) / order.length) * bar;
      if (at > sec.beat) silence(i, sec.beat, at);
    });

  // the final bar, the last chord with its bass note and crash, stays whole
  if (sec.exits && sec.bars > 2) {
    const leaving = [...order].reverse().filter((i) => tracks[i]!.role !== 'pad');
    const last = end - bar;
    leaving.forEach((i, k) =>
      silence(i, sec.beat + (1 + Math.floor((k * (sec.bars - 2)) / leaving.length)) * bar, last),
    );
  }

  const breath = sec.breath;
  if (breath)
    tracks.forEach((t, i) => {
      if (own(i) && !breath.keep.includes(t.role)) silence(i, end - breath.beats, end);
    });
}
