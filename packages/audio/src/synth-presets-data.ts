// The synth's presets (Chordinal PRD §13), listed in the browser's Synths tab. Each keeps a General MIDI program: what a
// MIDI export names the track as, and what a build without synths plays instead.
import { synthSettings, type SynthSettings } from './synth-settings.ts';

export type SynthGroup = 'Bass' | 'Lead' | 'Pad' | 'Pluck' | 'Keys';

export interface SynthPreset {
  group: SynthGroup;
  /** the General MIDI program closest to it */
  program: number;
  settings: SynthSettings;
}

/** the groups, in the order the browser lists them */
export const SYNTH_GROUPS: readonly SynthGroup[] = ['Bass', 'Lead', 'Pad', 'Pluck', 'Keys'];

const preset = (group: SynthGroup, program: number, settings: object): SynthPreset => ({
  group,
  program,
  settings: synthSettings(settings),
});

export const SYNTH_PRESETS: readonly SynthPreset[] = [
  preset('Bass', 38, {
    name: 'Saw Bass',
    osc1: { wave: 'saw', level: 0.7 },
    osc2: { wave: 'square', octave: -1, level: 0.5 },
    filter: {
      type: 'lowpass',
      cutoff: 300,
      resonance: 4,
      amount: 2400,
      env: { attack: 0, decay: 0.25, sustain: 0.1, release: 0.1 },
    },
    amp: { attack: 0.003, decay: 0.3, sustain: 0.7, release: 0.08 },
    velocity: 0.7,
  }),
  preset('Bass', 39, {
    name: 'Sub Bass',
    osc1: { wave: 'sine', level: 0.9 },
    osc2: { wave: 'triangle', octave: 1, level: 0.15 },
    filter: { type: 'lowpass', cutoff: 800, resonance: 0.7, amount: 0 },
    amp: { attack: 0.005, decay: 0.1, sustain: 1, release: 0.12 },
    mono: true,
    glide: 0.04,
  }),
  preset('Lead', 81, {
    name: 'Saw Lead',
    osc1: { wave: 'saw', level: 0.6 },
    osc2: { wave: 'saw', detune: 12, level: 0.6 },
    filter: {
      type: 'lowpass',
      cutoff: 1800,
      resonance: 2,
      amount: 1800,
      env: { attack: 0.01, decay: 0.4, sustain: 0.5, release: 0.2 },
    },
    amp: { attack: 0.01, decay: 0.2, sustain: 0.85, release: 0.2 },
    lfo: { wave: 'sine', rate: 5.5, depth: 12, target: 'pitch' },
    mono: true,
    glide: 0.08,
  }),
  preset('Lead', 80, {
    name: 'Square Lead',
    osc1: { wave: 'square', level: 0.6 },
    osc2: { wave: 'square', octave: 1, detune: 5, level: 0.25 },
    filter: { type: 'lowpass', cutoff: 3500, resonance: 1, amount: 600 },
    amp: { attack: 0.005, decay: 0.1, sustain: 0.9, release: 0.15 },
  }),
  preset('Pad', 89, {
    name: 'Warm Pad',
    osc1: { wave: 'saw', level: 0.5 },
    osc2: { wave: 'saw', detune: -9, level: 0.5 },
    filter: {
      type: 'lowpass',
      cutoff: 900,
      resonance: 1,
      amount: 1200,
      env: { attack: 1.2, decay: 1.5, sustain: 0.6, release: 1.5 },
    },
    amp: { attack: 0.8, decay: 1, sustain: 0.9, release: 1.8 },
    velocity: 0.3,
    lfo: { wave: 'triangle', rate: 0.3, depth: 300, target: 'filter' },
  }),
  preset('Pad', 88, {
    name: 'Glass Pad',
    osc1: { wave: 'triangle', level: 0.6 },
    osc2: { wave: 'sine', octave: 1, detune: 4, level: 0.35 },
    noise: 0.03,
    filter: { type: 'lowpass', cutoff: 5000, resonance: 0.8, amount: 0 },
    amp: { attack: 0.5, decay: 1, sustain: 0.85, release: 2 },
    lfo: { wave: 'sine', rate: 3, depth: 0.25, target: 'volume' },
  }),
  preset('Pluck', 46, {
    name: 'Bright Pluck',
    osc1: { wave: 'saw', level: 0.7 },
    osc2: { wave: 'square', octave: 1, level: 0.2 },
    filter: {
      type: 'lowpass',
      cutoff: 400,
      resonance: 3,
      amount: 3600,
      env: { attack: 0, decay: 0.18, sustain: 0, release: 0.15 },
    },
    amp: { attack: 0.002, decay: 0.35, sustain: 0, release: 0.25 },
    velocity: 0.8,
  }),
  preset('Pluck', 45, {
    name: 'Soft Pluck',
    osc1: { wave: 'triangle', level: 0.8 },
    osc2: { wave: 'sine', octave: 1, level: 0.3 },
    filter: { type: 'lowpass', cutoff: 2500, resonance: 1, amount: 0 },
    amp: { attack: 0.002, decay: 0.5, sustain: 0, release: 0.4 },
  }),
  preset('Keys', 4, {
    name: 'Electric Keys',
    osc1: { wave: 'sine', level: 0.8 },
    osc2: { wave: 'triangle', octave: 1, level: 0.25 },
    filter: {
      type: 'lowpass',
      cutoff: 1500,
      resonance: 1,
      amount: 1200,
      env: { attack: 0, decay: 0.6, sustain: 0.3, release: 0.4 },
    },
    amp: { attack: 0.003, decay: 1.2, sustain: 0.4, release: 0.4 },
    velocity: 0.6,
    lfo: { wave: 'sine', rate: 4.5, depth: 0.15, target: 'volume' },
  }),
  preset('Keys', 16, {
    name: 'Organ',
    osc1: { wave: 'sine', level: 0.6 },
    osc2: { wave: 'sine', octave: 1, level: 0.4 },
    noise: 0.01,
    filter: { type: 'lowpass', cutoff: 6000, resonance: 0.7, amount: 0 },
    amp: { attack: 0.01, decay: 0, sustain: 1, release: 0.06 },
    lfo: { wave: 'sine', rate: 6, depth: 0.1, target: 'volume' },
  }),
];
