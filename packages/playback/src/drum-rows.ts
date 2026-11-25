// A drum kit with samples on some of its rows (Chordinal PRD §14): each sampled key plays its sample, one-shot at the
// pitch it was recorded, and every other key plays the kit. One Instrument, so the player and live playing treat it
// as they treat the kit alone.
import { drumSampler, type DrumSample } from '@chordinal/audio';
import { createSampler } from './sampler.ts';
import type { Instrument } from './soundfont.ts';

/** a drum row's sample, loaded: its key, its sample, and its audio (null when its file can't be read) */
export interface LoadedRow {
  key: number;
  sample: DrumSample;
  buffer: AudioBuffer | null;
}

/** `kit` with `rows` played by samplers into `destination` in its place; the kit itself when there are none */
export function withDrumRows(
  kit: Instrument,
  rows: readonly LoadedRow[],
  destination: AudioNode,
): Instrument {
  if (!rows.length) return kit;
  const sampled = new Map(
    rows.map((r) => [r.key, createSampler(drumSampler(r.key, r.sample), r.buffer, destination)] as const),
  );
  const each = (fn: (i: Instrument) => void) => {
    fn(kit);
    sampled.forEach(fn);
  };
  return {
    noteOn: (key, velocity, when, opts) => (sampled.get(key) ?? kit).noteOn(key, velocity, when, opts),
    noteOff: (key, fast, when) => (sampled.get(key) ?? kit).noteOff(key, fast, when),
    // a drum hit never slides to another drum
    glide: () => false,
    tapeStop: (when, seconds, rate) => each((i) => i.tapeStop(when, seconds, rate)),
    output: kit.output,
    setSustain: (on) => each((i) => i.setSustain(on)),
    dispose: () => each((i) => i.dispose()),
  };
}
