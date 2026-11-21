// The maths of `chordinal render`, which turns a game's soundtrack into mp3s: where the beats, the loop and the bar
// lines fall in each file, cutting the render to them, the loop's seam, the loudness, the WAV handed to the encoder,
// and the check that the encoded file decodes in step with the render. Pure.
import { beatToSeconds } from '@chordinal/lib';
import type { TempoSegment } from '@chordinal/lib';

export const KEEP = 0.05; // seconds kept before the first beat, so a note nudged early isn't clipped
export const TAIL = 4; // seconds rendered after the last beat, for the reverb and delay to ring out
export const LOOP_SPARE = 0.25; // seconds a looping track's file runs past its loop's end
export const SEAM = 0.04; // seconds crossfaded at a loop's end (no more than KEEP, which is all there is before it)
export const TARGET_RMS_DB = -20; // every track is brought to the same loudness...
export const PEAK_DB = -1; // ...unless that would push a peak past this
export const WINDOW = 65536; // frames of the render the decode check matches...
export const LAG = 4096; // ...and how far either way it looks
export const MAX_SHIFT = 400; // frames the decoded sound may sit early or late (an mp3's pre-echo smears a soft first note)
export const MAX_LONGER = 64; // frames the decoded file may differ in length

/** what of a composed score the timing needs */
export interface SoundtrackScore {
  beats: number;
  beatsPerBar: number;
  tempoMap: TempoSegment[];
  sections: { type: string; label: string; beat: number; beats: number; beatsPerBar: number }[];
}

/** the sections a looping track repeats, as [first, end) indexes into its form */
export type LoopSections = readonly [number, number];

/** a span of the file, in seconds */
export interface Span {
  start: number;
  end: number;
}

/** where things fall in a track's file, in seconds into it */
export interface Timing {
  /** where the first beat falls */
  offset: number;
  /** the part a looping track repeats, on bar lines; null plays once */
  loop: Span | null;
  /** where a one-shot's last bar ends; null for a looping track */
  end: number | null;
  /** seconds cut from the start, for a trimmed track (it starts at its loop) */
  cut: number;
  /** when a section changes the meter, every bar line up to the loop's end */
  bars: number[] | null;
}

/**
 * Checks that a looping track can loop in a game that counts bars at one tempo: the section at the loop's end is the
 * same type as the one at its start, so what follows the end is what the loop jumps back to, and the tempo holds from
 * the start to the loop's end. The composer pushes the tempo a little from the climax on, and a section can set its
 * own; either before the loop's end would put the game's beats out of step with the music. A section may change the
 * meter: the track then lists its bar lines.
 */
export function checkLoop(id: string, score: SoundtrackScore, loop: LoopSections): void {
  const [first, end] = loop;
  const from = score.sections[first],
    to = score.sections[end];
  if (!from || !to || first >= end)
    throw new Error(
      `${id}: the loop [${first}, ${end}] doesn't fit the form's ${score.sections.length} sections (the section at its end is where it jumps back)`,
    );
  if (from.type !== to.type)
    throw new Error(`${id}: the loop ends on a ${to.type}, but starts on a ${from.type}`);
  const until = to.beat;
  const change = score.tempoMap.find((m, i) => m.beat < until - 1e-9 && (i > 0 || m.to !== undefined));
  if (change)
    throw new Error(
      `${id}: the tempo changes at beat ${change.beat}, before the loop's end at beat ${until}, and the game counts bars at one tempo. ` +
        `Set push: 0 in the spec (the climax's push), or take the tempo off that section`,
    );
}

/** where the beats, the loop and the bar lines fall in the file; `trim` starts a looping track's file at its loop */
export function timingOf(score: SoundtrackScore, loopSections: LoopSections | null, trim: boolean): Timing {
  // the score's tempo map, not one tempo: an ending's ritardando moves a cue's end
  const at = (beat: number): number => +(KEEP + beatToSeconds(score.tempoMap, beat)).toFixed(5);
  const sectionBeat = (i: number): number => {
    const s = score.sections[i];
    if (!s) throw new Error(`no section ${i} in the form`);
    return s.beat;
  };
  let loop: Span | null = loopSections
    ? { start: at(sectionBeat(loopSections[0])), end: at(sectionBeat(loopSections[1])) }
    : null;
  // a trimmed track starts at its loop: what came before it is only there to ring into it
  const cut = trim && loop ? loop.start - KEEP : 0;
  if (cut && loop) loop = { start: KEEP, end: +(loop.end - cut).toFixed(5) };

  // a track whose meter changes lists its bar lines (seconds into the file, to its loop's end), as a game can't count
  // them from one meter
  let bars: number[] | null = null;
  if (score.sections.some((s) => s.beatsPerBar !== score.beatsPerBar)) {
    const last = loop ? loop.end : at(score.beats);
    bars = [];
    for (const s of score.sections)
      for (let b = s.beat; b < s.beat + s.beats - 1e-9; b += s.beatsPerBar) {
        const x = +(at(b) - cut).toFixed(5);
        if (x >= 0 && x <= last + 1e-4) bars.push(x);
      }
    const end = loop?.end;
    if (end !== undefined && !bars.some((x) => Math.abs(x - end) < 1e-4)) bars.push(end);
  }
  return { offset: KEEP, loop, end: loop ? null : at(score.beats), cut, bars };
}

/**
 * The render cut to the file: most of the lead-in dropped (all but KEEP before the first beat, `leadIn` being where
 * the first beat falls in the render), a trimmed track's start, and a looping track stopped LOOP_SPARE after its
 * loop's end, since it never plays past it. Copies.
 */
export function cutRender(
  channels: readonly Float32Array[],
  rate: number,
  leadIn: number,
  timing: Timing,
): Float32Array[] {
  const skip = Math.round((leadIn - KEEP + timing.cut) * rate);
  const keep = timing.loop ? Math.round((timing.loop.end + LOOP_SPARE) * rate) : Infinity;
  return channels.map((d) => d.slice(skip, skip + keep));
}

/**
 * The bars after a loop's end are nearly, not exactly, the bars at its start (a repeat plays a little louder, and
 * notes drift by a few ms), so the wrap could click: fades the loop's last moments into what comes just before its
 * start, which is what the start follows on from. In place.
 */
export function crossfadeSeam(channels: readonly Float32Array[], rate: number, loop: Span): void {
  const n = Math.round(SEAM * rate),
    end = Math.round(loop.end * rate),
    start = Math.round(loop.start * rate);
  for (const d of channels)
    for (let i = 0; i < n; i++) {
      const w = (i + 1) / n;
      d[end - n + i] = (d[end - n + i] ?? 0) * (1 - w) + (d[start - n + i] ?? 0) * w;
    }
}

/** the gain (dB) that brings a track to TARGET_RMS_DB (over its sound, not its silence), or its peak to PEAK_DB if lower */
export function loudnessGainDb(channels: readonly Float32Array[]): number {
  let sum = 0,
    n = 0,
    peak = 0;
  for (const d of channels)
    for (const x of d) {
      const v = Math.abs(x);
      peak = Math.max(peak, v);
      if (v > 1e-4) {
        sum += v * v;
        n++;
      }
    }
  const rmsDb = 10 * Math.log10(sum / Math.max(1, n) + 1e-12),
    peakDb = 20 * Math.log10(peak + 1e-12);
  return Math.min(TARGET_RMS_DB - rmsDb, PEAK_DB - peakDb);
}

/** an interleaved 32-bit float WAV of the channels, times `gain` */
export function wav32(channels: readonly Float32Array[], rate: number, gain = 1): Uint8Array<ArrayBuffer> {
  const k = channels.length,
    frames = channels[0]?.length ?? 0,
    bytes = frames * k * 4;
  const buf = new ArrayBuffer(44 + bytes),
    v = new DataView(buf);
  const str = (o: number, s: string): void => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + bytes, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 3, true); // IEEE float
  v.setUint16(22, k, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * k * 4, true);
  v.setUint16(32, k * 4, true);
  v.setUint16(34, 32, true);
  str(36, 'data');
  v.setUint32(40, bytes, true);
  const out = new Float32Array(buf, 44);
  for (let i = 0, o = 0; i < frames; i++) for (const d of channels) out[o++] = (d[i] ?? 0) * gain;
  return new Uint8Array(buf);
}

/** where the decode check looks: the render's first sound (`onset`), and the stretch of the decoded file round it */
export function decodeWindow(left: Float32Array): { onset: number; from: number; count: number } {
  const first = left.findIndex((v) => Math.abs(v) >= 1e-3);
  const onset = Math.max(0, Math.min(first, left.length - WINDOW - LAG));
  const from = Math.max(0, onset - LAG);
  return { onset, from, count: onset - from + WINDOW + LAG };
}

/**
 * How many frames later than in the render (`ref`) the decoded audio (`part`, where `ref` starts at `at`) plays: the
 * shift within LAG frames either way where the two line up best, by cross-correlation. Matching the waveform, not a
 * level, so a soft fade-in measures as well as a downbeat; LAG covers an mp3's encoder and decoder delay (about 1,600
 * frames) with room over.
 */
export function lagOf(ref: Float32Array, part: Float32Array, at: number, lag = LAG): number {
  let best = 0,
    bestSum = -Infinity;
  for (let l = -Math.min(lag, at); l <= lag && at + l + ref.length <= part.length; l++) {
    let sum = 0;
    const o = at + l;
    for (let i = 0; i < ref.length; i++) sum += ref[i]! * part[o + i]!;
    if (sum > bestSum) {
      bestSum = sum;
      best = l;
    }
  }
  return best;
}

/** why a decoded file is out of step with its render, or null when it's in step */
export function decodeProblem(shift: number, longer: number): string | null {
  // a few frames either way is far below a millisecond; a decoder that kept the encoder's delay would be about 1105
  // frames late. A soft first note can be smeared a few ms early by the encoder (pre-echo), so up to MAX_SHIFT passes
  if (Math.abs(shift) > MAX_SHIFT) return `its sound is ${shift} frames from where it was rendered`;
  if (Math.abs(longer) > MAX_LONGER) return `it decodes ${longer} frames longer than it was rendered`;
  return null;
}
