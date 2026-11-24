// Follows a single line of recorded audio (a voice, an instrument): for each frame, its pitch as a
// fractional MIDI key and its level. YIN (de Cheveigné & Kawahara 2002): the cumulative mean normalised difference
// function, its first dip under a threshold, refined by a parabola. The range runs from a bass voice to a piccolo
// (about 50–4,000 Hz), so the difference function's cross term is worked out with an FFT: its cost no longer grows with
// the longest period. Vibrato is kept in the frames (100 a second by default) for transcribe to measure. Pure.

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
  /** the pitch range: about G1 to B7 by default, a bass voice to a piccolo */
  minHz?: number;
  maxHz?: number;
  /** seconds per frame; at least the longest period, 1/minHz */
  window?: number;
  /** YIN's dip */
  threshold?: number;
  /** the quietest level kept, as a share of the take's loudest frame */
  floor?: number;
  /** frames as tracked: no gate and no octave guard, for a take tracked in pieces and finished with finishFrames */
  raw?: boolean;
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
  const { fps = 100, minHz = 50, maxHz = 4000, threshold = 0.15, floor = PITCH_FLOOR, raw = false } = opts;
  const window = opts.window ?? Math.max(0.02, 1 / minHz);
  const hop = rate / fps,
    W = Math.round(rate * window);
  const tauMin = Math.max(2, Math.floor(rate / maxHz)),
    tauMax = Math.ceil(rate / minHz);
  // a frame reads W + tauMax + 1 samples; the FFT holds the window and the frame without wrapping into each other
  const L = W + tauMax + 2,
    N = 2 ** Math.ceil(Math.log2(W + L));
  const re = new Float64Array(N),
    im = new Float64Array(N),
    sq = new Float64Array(L + 1),
    d = new Float64Array(tauMax + 2);
  const fft = fftOf(N);
  const frames: PitchFrame[] = [];
  for (let f = 0; ; f++) {
    const start = Math.round(f * hop);
    if (start + L > samples.length) break;
    // the window in the real part, the whole frame in the imaginary part: one FFT for both
    for (let j = 0; j < N; j++) {
      re[j] = j < W ? samples[start + j]! : 0;
      im[j] = j < L ? samples[start + j]! : 0;
    }
    sq[0] = 0;
    for (let j = 0; j < L; j++) sq[j + 1] = sq[j]! + samples[start + j]! * samples[start + j]!;
    const energy = sq[W]!,
      level = Math.sqrt(energy / W);
    fft(re, im, false);
    // conj(A)·B, where A is the window's spectrum and B the frame's, unpacked from the one FFT
    for (let k = 0; k <= N / 2; k++) {
      const m = (N - k) % N;
      const ar = (re[k]! + re[m]!) / 2,
        ai = (im[k]! - im[m]!) / 2,
        br = (im[k]! + im[m]!) / 2,
        bi = (re[m]! - re[k]!) / 2;
      const cr = ar * br + ai * bi,
        ci = ar * bi - ai * br;
      re[k] = cr;
      im[k] = ci;
      re[m] = cr;
      im[m] = -ci;
    }
    fft(re, im, true);
    // difference function and its cumulative mean normalisation
    let sum = 0,
      tau = -1,
      best = Infinity,
      bestTau = -1;
    for (let t = 1; t <= tauMax + 1; t++) {
      const s = Math.max(0, energy + (sq[t + W]! - sq[t]!) - (2 * re[t]!) / N);
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
  return raw ? frames : finishFrames(frames, floor);
}

/** an in-place radix-2 FFT of size n (a power of two), its bit-reversal and twiddles worked out once */
function fftOf(n: number): (re: Float64Array, im: Float64Array, inverse: boolean) => void {
  const rev = new Uint32Array(n),
    bits = Math.log2(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2),
    sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = Math.sin((2 * Math.PI * i) / n);
  }
  return (re, im, inverse) => {
    for (let i = 0; i < n; i++) {
      const j = rev[i]!;
      if (j > i) {
        [re[i], re[j]] = [re[j]!, re[i]!];
        [im[i], im[j]] = [im[j]!, im[i]!];
      }
    }
    const sign = inverse ? 1 : -1;
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2,
        step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let k = 0; k < half; k++) {
          const wr = cos[k * step]!,
            wi = sign * sin[k * step]!;
          const a = i + k,
            b = a + half;
          const xr = re[b]! * wr - im[b]! * wi,
            xi = re[b]! * wi + im[b]! * wr;
          re[b] = re[a]! - xr;
          im[b] = im[a]! - xi;
          re[a] = re[a]! + xr;
          im[a] = im[a]! + xi;
        }
      }
    }
  };
}

/** the quietest level trackPitch keeps by default, as a share of the loudest frame */
export const PITCH_FLOOR = 0.06;

/** frames quieter than `floor` of the loudest made silent (midi null), in place; frames tracked in pieces raw
 * and finished together (finishFrames) come out as one trackPitch of the whole would */
export function gateFrames<F extends { level: number; midi: number | null }>(
  frames: F[],
  floor = PITCH_FLOOR,
): F[] {
  const peak = frames.reduce((m, fr) => Math.max(m, fr.level), 0);
  for (const fr of frames) if (fr.level < peak * floor) fr.midi = null;
  return frames;
}

/** frames each side an octave guard looks at, and how many of them must have a pitch */
const GUARD = { reach: 8, voiced: 3 };

/**
 * A frame read an octave away from the frames on both sides of it put back in their octave, in place: YIN sometimes
 * takes a strong harmonic, or twice the period, for the note. A real leap keeps the frames on one side, so it stays.
 */
export function guardOctaves<F extends { midi: number | null }>(frames: F[]): F[] {
  const was = frames.map((f) => f.midi);
  const middle = (from: number, to: number): number | null => {
    const near: number[] = [];
    for (let i = Math.max(0, from); i < Math.min(was.length, to); i++) if (was[i] != null) near.push(was[i]!);
    if (near.length < GUARD.voiced) return null;
    near.sort((a, b) => a - b);
    return near[near.length >> 1]!;
  };
  for (let i = 0; i < frames.length; i++) {
    const midi = was[i];
    if (midi == null) continue;
    const before = middle(i - GUARD.reach, i),
      after = middle(i + 1, i + 1 + GUARD.reach);
    if (before === null || after === null) continue;
    for (const shift of [12, -12]) {
      if (Math.abs(midi - shift - before) < 1 && Math.abs(midi - shift - after) < 1)
        frames[i]!.midi = midi - shift;
    }
  }
  return frames;
}

/** frames tracked raw made ready to read: gated, then each octave slip put back */
export function finishFrames<F extends { level: number; midi: number | null }>(
  frames: F[],
  floor = PITCH_FLOOR,
): F[] {
  return guardOctaves(gateFrames(frames, floor));
}
