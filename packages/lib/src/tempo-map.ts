// A song's tempo over time, and conversion between beats and seconds through it. Pure.
// A map is a list of segments sorted by beat. Each holds `bpm` from its beat to the next segment's, or ramps
// evenly (in beats) to `to` by then, which is how a ritardando or a push into a chorus is written.
// The last segment holds its tempo forever.

export interface TempoSegment {
  beat: number;
  bpm: number;
  to?: number;
}

// seconds to cover `beats` from a segment's start, with the tempo ramping from a to c over `span` beats
function segmentSeconds(a: number, c: number, span: number, beats: number): number {
  const k = span > 0 ? (c - a) / span : 0;
  return Math.abs(k) < 1e-9 ? (beats * 60) / a : (60 / k) * Math.log((a + k * beats) / a);
}

function segmentBeats(a: number, c: number, span: number, seconds: number): number {
  const k = span > 0 ? (c - a) / span : 0;
  return Math.abs(k) < 1e-9 ? (seconds * a) / 60 : (a * (Math.exp((k * seconds) / 60) - 1)) / k;
}

const spanOf = (map: TempoSegment[], i: number, seg: TempoSegment): number =>
  (map[i + 1]?.beat ?? Infinity) - seg.beat;
const endBpm = (seg: TempoSegment, span: number): number =>
  span === Infinity ? seg.bpm : (seg.to ?? seg.bpm);
const first = (map: TempoSegment[]): TempoSegment => {
  const seg = map[0];
  if (!seg) throw new Error('a tempo map needs a segment');
  return seg;
};

/** seconds from beat 0 to `beat`; before beat 0 it runs at the first segment's tempo */
export function beatToSeconds(map: TempoSegment[], beat: number): number {
  if (beat <= 0) return (beat * 60) / first(map).bpm;
  let s = 0;
  for (const [i, seg] of map.entries()) {
    const span = spanOf(map, i, seg);
    const into = Math.min(beat, seg.beat + span) - seg.beat;
    s += segmentSeconds(seg.bpm, endBpm(seg, span), span, into);
    if (beat <= seg.beat + span) break;
  }
  return s;
}

/** the beat reached `seconds` after beat 0 */
export function secondsToBeat(map: TempoSegment[], seconds: number): number {
  if (seconds <= 0) return (seconds * first(map).bpm) / 60;
  let left = seconds;
  for (const [i, seg] of map.entries()) {
    const span = spanOf(map, i, seg),
      c = endBpm(seg, span);
    const whole = span === Infinity ? Infinity : segmentSeconds(seg.bpm, c, span, span);
    if (left <= whole) return seg.beat + segmentBeats(seg.bpm, c, span, left);
    left -= whole;
  }
  return (map.at(-1) ?? first(map)).beat;
}

/** the tempo at a beat */
export function bpmAt(map: TempoSegment[], beat: number): number {
  const i = Math.max(
    0,
    map.findLastIndex((s) => s.beat <= beat),
  );
  const seg = map[i] ?? first(map),
    span = spanOf(map, i, seg);
  return span === Infinity ? seg.bpm : seg.bpm + ((endBpm(seg, span) - seg.bpm) * (beat - seg.beat)) / span;
}

/**
 * The map as tempo changes on whole beats, for formats that only hold steps (a MIDI file): one change per
 * beat through a ramp, and one at each constant segment.
 */
export function tempoSteps(map: TempoSegment[]): { beat: number; bpm: number }[] {
  const out: { beat: number; bpm: number }[] = [];
  map.forEach((seg, i) => {
    const span = spanOf(map, i, seg);
    if (span === Infinity || seg.to === undefined || seg.to === seg.bpm) {
      out.push({ beat: seg.beat, bpm: seg.bpm });
      return;
    }
    for (let b = 0; b < span; b++) out.push({ beat: seg.beat + b, bpm: bpmAt(map, seg.beat + b + 0.5) });
  });
  return out.filter((s, i) => {
    const prev = out[i - 1];
    return prev === undefined || Math.abs(s.bpm - prev.bpm) > 1e-6;
  });
}
