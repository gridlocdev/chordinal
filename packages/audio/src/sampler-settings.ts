// A sampler's settings (Chordinal PRD §14): one audio file in the project's samples/ folder, played across the keys
// from its root key, with an amp envelope, a start offset, and a mode: one-shot plays the sample through whatever the
// key does, sustain-loop loops it while the key is held. Pure data: playback's sampler plays it, a track keeps it.
import { trackPitch } from '@chordinal/lib';
import { envelope, num, obj, pick, type SynthEnvelope } from './synth-settings.ts';

export type SampleMode = 'oneshot' | 'loop';

export interface SamplerSettings {
  /** what the track header and the mixer call it: the file's name, until it's renamed */
  name: string;
  /** the file in the project's samples/ folder, like 'kick.wav' */
  file: string;
  /** the MIDI key the sample sounds at as recorded, 0 to 127 */
  root: number;
  mode: SampleMode;
  /** where in the sample a note starts, as a share of its length, 0 to 0.99 */
  start: number;
  amp: SynthEnvelope;
}

/** a sample at middle C, played through with a short release: what a dropped file starts with */
export const DEFAULT_SAMPLER: SamplerSettings = {
  name: 'Sample',
  file: '',
  root: 60,
  mode: 'oneshot',
  start: 0,
  amp: { attack: 0.002, decay: 0, sustain: 1, release: 0.1 },
};

const MODES: readonly SampleMode[] = ['oneshot', 'loop'];

/** the audio files a sampler plays: WAV, AIFF and MP3 */
export const SAMPLE_FILE = /\.(wav|aiff?|mp3)$/i;

/**
 * Whole, in-range settings from anything: a saved one, one from an older build, or a few settings over the default.
 * Missing or unreadable settings take the default's, and numbers are held to their ranges.
 */
export function samplerSettings(v: unknown = {}): SamplerSettings {
  const p = obj(v),
    d = DEFAULT_SAMPLER;
  return {
    name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : d.name,
    file: typeof p.file === 'string' ? p.file : d.file,
    root: Math.round(num(p.root, d.root, 0, 127)),
    mode: pick(p.mode, MODES, d.mode),
    start: num(p.start, d.start, 0, 0.99),
    amp: envelope(p.amp, d.amp),
  };
}

const CLEAR = 0.8; // frames at least this clear (a held tone, not a hit or a breath) say what the pitch is
const ROOT_SECONDS = 4; // only the start of a long sample is listened to

/**
 * The key a sample sounds at: the middle pitch of its clear frames, from the first few seconds, rounded to a key. Null
 * when it has no steady pitch, like a drum hit or noise.
 * @param samples mono, -1..1
 */
export function guessRoot(samples: Float32Array, rate: number): number | null {
  const frames = trackPitch(samples.subarray(0, Math.round(rate * ROOT_SECONDS)), rate);
  const keys = frames
    .filter((f) => f.midi !== null && f.clarity >= CLEAR)
    .map((f) => f.midi!)
    .sort((a, b) => a - b);
  // a few clear frames could be a blip; a tone holds for at least a tenth of a second
  if (keys.length < 10) return null;
  return Math.min(127, Math.max(0, Math.round(keys[keys.length >> 1]!)));
}

/** a drum row's sample (Chordinal PRD §14): played in place of the kit's sound on that key */
export interface DrumSample {
  /** what the step grid's row calls it: the file's name, until it's renamed */
  name: string;
  /** the file in the project's samples/ folder */
  file: string;
}

/**
 * A drum track's samples by key, from anything saved: only keys 0 to 127 with a file. Others are left out.
 */
export function drumSamples(v: unknown): Map<number, DrumSample> {
  const out = new Map<number, DrumSample>();
  for (const [k, s] of Object.entries(obj(v))) {
    const key = Number(k),
      p = obj(s);
    if (!Number.isInteger(key) || key < 0 || key > 127 || typeof p.file !== 'string' || !p.file) continue;
    const name =
      typeof p.name === 'string' && p.name.trim() ? p.name.trim() : p.file.replace(SAMPLE_FILE, '');
    out.set(key, { name, file: p.file });
  }
  return out;
}

/** the sampler a drum row plays its sample with: one-shot, at the pitch it was recorded, on the row's key */
export const drumSampler = (key: number, s: DrumSample): SamplerSettings =>
  samplerSettings({ name: s.name, file: s.file, root: key, mode: 'oneshot' });
