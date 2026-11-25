// The Sound tab's controls for a synth (Chordinal PRD §13), as data: what each one sets, its range and how its slider
// moves over it, and how its value reads. Pure, so the panel only draws them and the tests check them in Node.
import { synthSettings, type SynthSettings } from './synth-settings.ts';

/** how a slider spreads its range: evenly, on octaves (a frequency, a rate), or bunched at the low end (a time) */
export type SynthScale = 'linear' | 'log' | 'curve';
export type SynthUnit = 'Hz' | 's' | '%' | 'cents' | 'oct' | 'Q';

export interface SynthNumberControl {
  kind: 'number';
  /** where it is in the settings, like 'filter.env.attack' */
  path: string;
  label: string;
  min: number;
  max: number;
  scale: SynthScale;
  unit: SynthUnit;
  /** whole steps only (octaves) */
  whole?: boolean;
  /** shown only for settings where this is true */
  shown?: (s: SynthSettings) => boolean;
  /** greyed out for settings where this is false */
  enabled?: (s: SynthSettings) => boolean;
}

export interface SynthChoiceControl {
  kind: 'choice';
  path: string;
  label: string;
  choices: readonly (readonly [value: string, label: string])[];
}

export interface SynthSwitchControl {
  kind: 'switch';
  path: string;
  label: string;
}

export type SynthControl = SynthNumberControl | SynthChoiceControl | SynthSwitchControl;

export interface SynthSection {
  title: string;
  controls: readonly SynthControl[];
}

const WAVES = [
  ['saw', 'Saw'],
  ['square', 'Square'],
  ['triangle', 'Triangle'],
  ['sine', 'Sine'],
] as const;

const num = (
  path: string,
  label: string,
  min: number,
  max: number,
  scale: SynthScale,
  unit: SynthUnit,
  more: Partial<SynthNumberControl> = {},
): SynthNumberControl => ({ kind: 'number', path, label, min, max, scale, unit, ...more });

const oscillator = (n: 1 | 2): SynthSection => ({
  title: `Oscillator ${n}`,
  controls: [
    { kind: 'choice', path: `osc${n}.wave`, label: 'Wave', choices: WAVES },
    num(`osc${n}.octave`, 'Octave', -2, 2, 'linear', 'oct', { whole: true }),
    num(`osc${n}.detune`, 'Detune', -100, 100, 'linear', 'cents'),
    num(`osc${n}.level`, 'Level', 0, 1, 'linear', '%'),
  ],
});

const envelope = (at: string): SynthControl[] => [
  num(`${at}.attack`, 'Attack', 0, 10, 'curve', 's'),
  num(`${at}.decay`, 'Decay', 0, 10, 'curve', 's'),
  num(`${at}.sustain`, 'Sustain', 0, 1, 'linear', '%'),
  num(`${at}.release`, 'Release', 0, 10, 'curve', 's'),
];

const toVolume = (s: SynthSettings) => s.lfo.target === 'volume';

/** the Sound tab's sections, in the order a sound flows through the synth */
export const SYNTH_SECTIONS: readonly SynthSection[] = [
  oscillator(1),
  oscillator(2),
  { title: 'Noise', controls: [num('noise', 'Level', 0, 1, 'linear', '%')] },
  {
    title: 'Filter',
    controls: [
      {
        kind: 'choice',
        path: 'filter.type',
        label: 'Type',
        choices: [
          ['lowpass', 'Low-pass'],
          ['highpass', 'High-pass'],
          ['bandpass', 'Band-pass'],
        ],
      },
      num('filter.cutoff', 'Cutoff', 20, 20000, 'log', 'Hz'),
      num('filter.resonance', 'Resonance', 0.1, 20, 'log', 'Q'),
      num('filter.amount', 'Envelope amount', -4800, 4800, 'linear', 'cents'),
      num('velocity', 'Velocity amount', 0, 1, 'linear', '%'),
    ],
  },
  { title: 'Filter envelope', controls: envelope('filter.env') },
  { title: 'Amp envelope', controls: envelope('amp') },
  {
    title: 'LFO',
    controls: [
      { kind: 'choice', path: 'lfo.wave', label: 'Wave', choices: WAVES },
      {
        kind: 'choice',
        path: 'lfo.target',
        label: 'Moves',
        choices: [
          ['pitch', 'Pitch'],
          ['filter', 'Filter'],
          ['volume', 'Volume'],
        ],
      },
      num('lfo.rate', 'Rate', 0.1, 20, 'log', 'Hz'),
      num('lfo.depth', 'Depth', 0, 1200, 'curve', 'cents', { shown: (s) => !toVolume(s) }),
      num('lfo.depth', 'Depth', 0, 1, 'linear', '%', { shown: toVolume }),
    ],
  },
  {
    title: 'Voice',
    controls: [
      { kind: 'switch', path: 'mono', label: 'Mono' },
      num('glide', 'Glide', 0, 5, 'curve', 's', { enabled: (s) => s.mono }),
    ],
  },
];

/** the value at `path` in the settings */
export function synthValue(s: SynthSettings, path: string): unknown {
  let at: unknown = s;
  for (const k of path.split('.'))
    at = at && typeof at === 'object' ? (at as Record<string, unknown>)[k] : undefined;
  return at;
}

/** the depth that moves as much on another target: cents of pitch or cutoff, or a share of the volume over 1200 */
const depthFor = (depth: number, from: string, to: string): number =>
  (from === 'volume') === (to === 'volume')
    ? depth
    : to === 'volume'
      ? Math.min(1, depth / 1200)
      : depth * 1200;

/**
 * New settings with `path` set to `value`, held in range. An LFO moved to or from the volume keeps its depth's share
 * of its range, since the volume's depth isn't in cents.
 */
export function withSynthValue(s: SynthSettings, path: string, value: unknown): SynthSettings {
  const keys = path.split('.');
  const put = (at: unknown, i: number): unknown => {
    const k = keys[i];
    if (k === undefined) return value;
    const o = at && typeof at === 'object' ? (at as Record<string, unknown>) : {};
    return { ...o, [k]: put(o[k], i + 1) };
  };
  const next = put(s, 0) as SynthSettings;
  if (path === 'lfo.target' && typeof value === 'string')
    next.lfo = { ...next.lfo, depth: depthFor(s.lfo.depth, s.lfo.target, value) };
  return synthSettings(next);
}

/** where a value sits on a control's slider, 0 to 1 */
export function controlPlace(c: SynthNumberControl, value: number): number {
  const x =
    c.scale === 'log'
      ? Math.log(value / c.min) / Math.log(c.max / c.min)
      : c.scale === 'curve'
        ? Math.cbrt((value - c.min) / (c.max - c.min))
        : (value - c.min) / (c.max - c.min);
  return Math.max(0, Math.min(1, x));
}

/** the value at a place on a control's slider, 0 to 1 */
export function controlValue(c: SynthNumberControl, place: number): number {
  const x = Math.max(0, Math.min(1, place));
  const v =
    c.scale === 'log'
      ? c.min * (c.max / c.min) ** x
      : c.scale === 'curve'
        ? c.min + (c.max - c.min) * x ** 3
        : c.min + (c.max - c.min) * x;
  return c.whole ? Math.round(v) : v;
}

const fixed = (x: number, d: number) => x.toFixed(d).replace('-', '−');

/** a control's value as the panel shows it */
export function controlText(c: SynthNumberControl, value: number): string {
  switch (c.unit) {
    case 'Hz':
      return value >= 1000
        ? `${fixed(value / 1000, value >= 10000 ? 1 : 2)} kHz`
        : `${fixed(value, value < 10 ? 2 : 0)} Hz`;
    case 's':
      return value < 1 ? `${fixed(value * 1000, 0)} ms` : `${fixed(value, 2)} s`;
    case '%':
      return `${Math.round(value * 100)}%`;
    case 'cents':
      return `${value > 0 ? '+' : ''}${fixed(value, 0)} ct`;
    case 'oct':
      return value ? `${value > 0 ? '+' : ''}${fixed(value, 0)} oct` : '0';
    case 'Q':
      return fixed(value, 1);
  }
}
