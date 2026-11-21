// Follows a single whistled (or sung) line: for each frame, its pitch as a fractional MIDI key and its level.
// YIN (de Cheveigné & Kawahara 2002): the cumulative mean normalised difference function, its first dip under a
// threshold, refined by a parabola. A whistle is close to a sine, the easiest case there is, so this stays simple and
// accurate to a few cents; vibrato is kept in the frames (100 a second by default) for transcribe to measure. Pure.

/** one frame of a pitch track; clarity 0..1, 1 a pure tone */
export interface PitchFrame {
  time: number;
  midi: number | null;
  level: number;
  clarity: number;
}

export interface PitchTrackOptions {
  /** frames a second */
  fps?: number;
  /** the pitch range (a whistle runs about 500–3000 Hz) */
  minHz?: number;
  maxHz?: number;
  /** seconds per frame */
  window?: number;
  /** YIN's dip */
  threshold?: number;
  /** the quietest level kept, as a share of the take's loudest frame */
  floor?: number;
}

/**
 * @param samples mono, -1..1
 * @param rate samples per second
 */
export function trackPitch(
  samples: Float32Array | number[],
  rate: number,
  opts: PitchTrackOptions = {},
): PitchFrame[] {
  const { fps = 100, minHz = 300, maxHz = 4000, window = 0.02, threshold = 0.15, floor = PITCH_FLOOR } = opts;
  const hop = rate / fps,
    W = Math.round(rate * window);
  const tauMin = Math.max(2, Math.floor(rate / maxHz)),
    tauMax = Math.ceil(rate / minHz);
  const d = new Float64Array(tauMax + 2);
  const frames: PitchFrame[] = [];
  for (let f = 0; ; f++) {
    const start = Math.round(f * hop);
    if (start + W + tauMax + 1 > samples.length) break;
    let energy = 0;
    for (let j = 0; j < W; j++) energy += samples[start + j]! * samples[start + j]!;
    const level = Math.sqrt(energy / W);
    // difference function and its cumulative mean normalisation
    let sum = 0,
      tau = -1,
      best = Infinity,
      bestTau = -1;
    for (let t = 1; t <= tauMax + 1; t++) {
      let s = 0;
      for (let j = 0; j < W; j++) {
        const x = samples[start + j]! - samples[start + j + t]!;
        s += x * x;
      }
      sum += s;
      d[t] = sum > 0 ? (s * t) / sum : 1;
    }
    for (let t = tauMin; t <= tauMax; t++) {
      if (d[t]! < best) {
        best = d[t]!;
        bestTau = t;
      }
      if (d[t]! < threshold) {
        while (t + 1 <= tauMax && d[t + 1]! < d[t]!) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0 && best < 2 * threshold) tau = bestTau;
    let midi = null;
    if (tau > 0) {
      const a = d[tau - 1]!,
        b = d[tau]!,
        c = d[tau + 1]!,
        den = a - 2 * b + c;
      const exact = tau + (den > 0 ? (0.5 * (a - c)) / den : 0);
      midi = 69 + 12 * Math.log2(rate / exact / 440);
    }
    frames.push({ time: start / rate, midi, level, clarity: tau > 0 ? Math.max(0, 1 - d[tau]!) : 0 });
  }
  return gateFrames(frames, floor);
}

/** the quietest level trackPitch keeps by default, as a share of the loudest frame */
export const PITCH_FLOOR = 0.06;

/** frames quieter than `floor` of the loudest made silent (midi null), in place; frames tracked in pieces with floor 0
 * and gated together come out as one trackPitch of the whole would */
export function gateFrames<F extends { level: number; midi: number | null }>(
  frames: F[],
  floor = PITCH_FLOOR,
): F[] {
  const peak = frames.reduce((m, fr) => Math.max(m, fr.level), 0);
  for (const fr of frames) if (fr.level < peak * floor) fr.midi = null;
  return frames;
}
