// A synth's settings (Chordinal PRD §13): two oscillators and noise, a filter with its own envelope, an amp envelope,
// an LFO, velocity, mono and glide. Pure data: playback's synth plays it, and a project will keep it on a track.

export type SynthWave = 'saw' | 'square' | 'triangle' | 'sine';
export type SynthFilterType = 'lowpass' | 'highpass' | 'bandpass';
export type SynthLfoTarget = 'pitch' | 'filter' | 'volume';

/** an envelope: attack, decay and release in seconds, sustain a level from 0 to 1 */
export interface SynthEnvelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface SynthOscillator {
  wave: SynthWave;
  /** octaves up or down, -2 to 2 */
  octave: number;
  /** cents, -100 to 100 */
  detune: number;
  /** 0 to 1 */
  level: number;
}

export interface SynthSettings {
  /** what the track header and the mixer call it: its preset's name, until it's renamed */
  name: string;
  osc1: SynthOscillator;
  osc2: SynthOscillator;
  /** white noise, 0 to 1 */
  noise: number;
  filter: {
    type: SynthFilterType;
    /** Hz, 20 to 20000 */
    cutoff: number;
    /** the filter's Q, 0.1 to 20 */
    resonance: number;
    /** how far the filter envelope moves the cutoff at full velocity, in cents, -4800 to 4800 */
    amount: number;
    env: SynthEnvelope;
  };
  amp: SynthEnvelope;
  /** 0 to 1: how much a softer note lessens the filter envelope's amount (0: velocity doesn't change it) */
  velocity: number;
  lfo: {
    wave: SynthWave;
    /** Hz, 0.1 to 20 */
    rate: number;
    /** cents for pitch and filter, 0 to 1 of the level for volume */
    depth: number;
    target: SynthLfoTarget;
  };
  /** one note at a time, sliding between held notes */
  mono: boolean;
  /** seconds a mono note takes to slide to the next, 0 to 5 */
  glide: number;
}

/** a plain saw through an open low-pass: the settings a new synth starts with */
export const DEFAULT_SYNTH: SynthSettings = {
  name: 'Synth',
  osc1: { wave: 'saw', octave: 0, detune: 0, level: 0.8 },
  osc2: { wave: 'saw', octave: 0, detune: 7, level: 0 },
  noise: 0,
  filter: {
    type: 'lowpass',
    cutoff: 2400,
    resonance: 1,
    amount: 1200,
    env: { attack: 0.005, decay: 0.3, sustain: 0.4, release: 0.3 },
  },
  amp: { attack: 0.005, decay: 0.2, sustain: 0.8, release: 0.25 },
  velocity: 0.5,
  lfo: { wave: 'sine', rate: 5, depth: 0, target: 'pitch' },
  mono: false,
  glide: 0,
};

const WAVES: readonly SynthWave[] = ['saw', 'square', 'triangle', 'sine'];
const FILTERS: readonly SynthFilterType[] = ['lowpass', 'highpass', 'bandpass'];
const TARGETS: readonly SynthLfoTarget[] = ['pitch', 'filter', 'volume'];

type Loose = Record<string, unknown>;
const obj = (v: unknown): Loose => (v && typeof v === 'object' ? (v as Loose) : {});
const num = (v: unknown, fallback: number, lo: number, hi: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
const pick = <T extends string>(v: unknown, from: readonly T[], fallback: T): T =>
  from.includes(v as T) ? (v as T) : fallback;

function envelope(v: unknown, d: SynthEnvelope): SynthEnvelope {
  const e = obj(v);
  return {
    attack: num(e.attack, d.attack, 0, 20),
    decay: num(e.decay, d.decay, 0, 20),
    sustain: num(e.sustain, d.sustain, 0, 1),
    release: num(e.release, d.release, 0, 20),
  };
}

function oscillator(v: unknown, d: SynthOscillator): SynthOscillator {
  const o = obj(v);
  return {
    wave: pick(o.wave, WAVES, d.wave),
    octave: Math.round(num(o.octave, d.octave, -2, 2)),
    detune: num(o.detune, d.detune, -100, 100),
    level: num(o.level, d.level, 0, 1),
  };
}

/**
 * Whole, in-range settings from anything: a saved one, one from an older build, or a few settings over the default.
 * Missing or unreadable settings take the default's, and numbers are held to their ranges.
 */
export function synthSettings(v: unknown = {}): SynthSettings {
  const p = obj(v),
    f = obj(p.filter),
    l = obj(p.lfo),
    d = DEFAULT_SYNTH;
  return {
    name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : d.name,
    osc1: oscillator(p.osc1, d.osc1),
    osc2: oscillator(p.osc2, d.osc2),
    noise: num(p.noise, d.noise, 0, 1),
    filter: {
      type: pick(f.type, FILTERS, d.filter.type),
      cutoff: num(f.cutoff, d.filter.cutoff, 20, 20000),
      resonance: num(f.resonance, d.filter.resonance, 0.1, 20),
      amount: num(f.amount, d.filter.amount, -4800, 4800),
      env: envelope(f.env, d.filter.env),
    },
    amp: envelope(p.amp, d.amp),
    velocity: num(p.velocity, d.velocity, 0, 1),
    lfo: {
      wave: pick(l.wave, WAVES, d.lfo.wave),
      rate: num(l.rate, d.lfo.rate, 0.1, 20),
      depth: num(l.depth, d.lfo.depth, 0, l.target === 'volume' ? 1 : 4800),
      target: pick(l.target, TARGETS, d.lfo.target),
    },
    mono: typeof p.mono === 'boolean' ? p.mono : d.mono,
    glide: num(p.glide, d.glide, 0, 5),
  };
}
