// Track effects: the audio effects a track's strip runs its sound through (its inserts), after the low cut and tone and
// before the fader. This is the list of effect types and their settings, and the edits that add, move, bypass, change
// and remove a track's inserts. Pure: packages/playback builds the sound of each.
import { updateTrack } from './project.ts';
import type { Insert, Project, Track } from './project.ts';

/** the effect types, in the order the app lists them */
export const EFFECT_TYPES = [
  'eq',
  'compressor',
  'filter',
  'distortion',
  'chorus',
  'delay',
  'reverb',
  'phaser',
  'flanger',
  'tremolo',
  'bitcrusher',
  'limiter',
  'width',
  'gain',
] as const;
export type EffectType = (typeof EFFECT_TYPES)[number];

/** one setting of an effect: its range and starting value, how a knob or lane draws it, and its unit */
export interface EffectParam {
  id: string;
  label: string;
  min: number;
  max: number;
  value: number;
  /** 'db': decibels, as they are; 'log': on octaves (a frequency, a time); 'linear': as it is */
  scale: 'db' | 'log' | 'linear';
  unit?: 'dB' | 'Hz' | 's' | 'ms' | '%' | ':1' | 'bits' | '×';
  /** a setting with named values: the value is an index into these */
  choices?: string[];
  /** whether an automation lane can move it; settings that rebuild the effect, and choices, can't */
  automatable: boolean;
}

export interface EffectSpec {
  type: EffectType;
  name: string;
  /** what it does, in a line */
  about: string;
  params: EffectParam[];
}

const db = (id: string, label: string, min: number, max: number, value: number): EffectParam => ({
  id,
  label,
  min,
  max,
  value,
  scale: 'db',
  unit: 'dB',
  automatable: true,
});
const hz = (id: string, label: string, min: number, max: number, value: number): EffectParam => ({
  id,
  label,
  min,
  max,
  value,
  scale: 'log',
  unit: 'Hz',
  automatable: true,
});
const amount = (id: string, label: string, value: number, max = 1): EffectParam => ({
  id,
  label,
  min: 0,
  max,
  value,
  scale: 'linear',
  unit: '%',
  automatable: true,
});
const choice = (id: string, label: string, choices: string[], value = 0): EffectParam => ({
  id,
  label,
  min: 0,
  max: choices.length - 1,
  value,
  scale: 'linear',
  choices,
  automatable: false,
});
const rate = (value: number): EffectParam => ({
  id: 'rate',
  label: 'Rate',
  min: 0.05,
  max: 8,
  value,
  scale: 'log',
  unit: 'Hz',
  automatable: true,
});
const mix = (value: number): EffectParam => amount('mix', 'Mix', value);

/** the note lengths a tempo-synced effect can follow, in beats, and their names */
export const SYNC_BEATS = [0.25, 1 / 3, 0.5, 0.75, 2 / 3, 1, 1.5, 2];
export const SYNC_NAMES = ['1/16', '1/8 T', '1/8', '1/8 D', '1/4 T', '1/4', '1/4 D', '1/2'];

export const EFFECTS: EffectSpec[] = [
  {
    type: 'eq',
    name: 'EQ',
    about: 'Boosts or cuts the lows, a band in the middle, and the highs.',
    params: [
      db('low', 'Low', -18, 18, 0),
      hz('lowFreq', 'Low Freq', 40, 800, 150),
      db('mid', 'Mid', -18, 18, 0),
      hz('midFreq', 'Mid Freq', 150, 8000, 1000),
      { ...amount('q', 'Mid Width', 1, 10), min: 0.2, scale: 'log', unit: undefined },
      db('high', 'High', -18, 18, 0),
      hz('highFreq', 'High Freq', 1500, 16000, 6000),
    ],
  },
  {
    type: 'compressor',
    name: 'Compressor',
    about: 'Evens out how loud the track is: turns down what goes over the threshold.',
    params: [
      db('threshold', 'Threshold', -60, 0, -20),
      { ...db('ratio', 'Ratio', 1, 20, 4), scale: 'log', unit: ':1' },
      {
        id: 'attack',
        label: 'Attack',
        min: 0.001,
        max: 0.5,
        value: 0.01,
        scale: 'log',
        unit: 's',
        automatable: true,
      },
      {
        id: 'release',
        label: 'Release',
        min: 0.02,
        max: 1,
        value: 0.2,
        scale: 'log',
        unit: 's',
        automatable: true,
      },
      db('makeup', 'Makeup', 0, 24, 0),
    ],
  },
  {
    type: 'filter',
    name: 'Filter',
    about: 'Lets through only the lows, the highs or a band, with a resonant peak at the cutoff.',
    params: [
      choice('mode', 'Mode', ['Low Pass', 'High Pass', 'Band Pass']),
      hz('cutoff', 'Cutoff', 20, 20000, 2000),
      {
        id: 'resonance',
        label: 'Resonance',
        min: 0,
        max: 20,
        value: 1,
        scale: 'linear',
        unit: 'dB',
        automatable: true,
      },
    ],
  },
  {
    type: 'distortion',
    name: 'Distortion',
    about: 'Drives the sound into clipping, from warm to fuzzy.',
    params: [
      db('drive', 'Drive', 0, 40, 12),
      hz('tone', 'Tone', 500, 20000, 8000),
      db('output', 'Output', -24, 6, -6),
      mix(1),
    ],
  },
  {
    type: 'chorus',
    name: 'Chorus',
    about: 'Doubles the sound with slightly detuned copies, so it sounds wider and fuller.',
    params: [rate(0.8), amount('depth', 'Depth', 0.5), mix(0.5)],
  },
  {
    type: 'delay',
    name: 'Delay',
    about: 'Echoes, timed to the tempo.',
    params: [
      choice('time', 'Time', SYNC_NAMES, 3),
      amount('feedback', 'Feedback', 0.35, 0.9),
      hz('tone', 'Tone', 500, 20000, 4000),
      mix(0.3),
    ],
  },
  {
    type: 'reverb',
    name: 'Reverb',
    about: 'A room of its own for this track, from a small booth to a huge cave.',
    params: [
      { id: 'size', label: 'Size', min: 0.3, max: 30, value: 2, scale: 'log', unit: 's', automatable: false },
      // higher is a longer tail: how slowly the room dies away over its size
      { id: 'decay', label: 'Decay', min: 1, max: 30, value: 10, scale: 'linear', automatable: false },
      hz('tone', 'Tone', 500, 20000, 8000),
      mix(0.3),
    ],
  },
  {
    type: 'phaser',
    name: 'Phaser',
    about: 'A sweeping, swirling sound from notches that move through the spectrum.',
    params: [rate(0.5), amount('depth', 'Depth', 0.7), amount('feedback', 'Feedback', 0.5, 0.9), mix(0.5)],
  },
  {
    type: 'flanger',
    name: 'Flanger',
    about: 'A jet-plane whoosh from a short, sweeping delay fed back on itself.',
    params: [rate(0.25), amount('depth', 'Depth', 0.6), amount('feedback', 'Feedback', 0.6, 0.9), mix(0.5)],
  },
  {
    type: 'tremolo',
    name: 'Tremolo',
    about: 'Pulses the volume up and down, timed to the tempo.',
    params: [
      choice('rate', 'Rate', SYNC_NAMES, 2),
      amount('depth', 'Depth', 0.5),
      choice('shape', 'Shape', ['Sine', 'Square']),
    ],
  },
  {
    type: 'bitcrusher',
    name: 'Bitcrusher',
    about: 'Lo-fi grit: fewer bits and a lower sample rate, like an old sampler or game console.',
    params: [
      {
        id: 'bits',
        label: 'Bits',
        min: 1,
        max: 16,
        value: 8,
        scale: 'linear',
        unit: 'bits',
        automatable: true,
      },
      {
        id: 'downsample',
        label: 'Downsample',
        min: 1,
        max: 32,
        value: 4,
        scale: 'log',
        unit: '×',
        automatable: true,
      },
      mix(1),
    ],
  },
  {
    type: 'limiter',
    name: 'Limiter',
    about: 'Keeps the peaks under a ceiling, so the track can be pushed louder.',
    params: [db('gain', 'Gain', 0, 24, 0), db('ceiling', 'Ceiling', -24, 0, -1)],
  },
  {
    type: 'width',
    name: 'Stereo Width',
    about: 'Narrows the sound towards mono or spreads it wider.',
    params: [{ ...amount('width', 'Width', 1, 2), unit: '%' }],
  },
  {
    type: 'gain',
    name: 'Gain',
    about: 'Turns the sound up or down at this point in the chain.',
    params: [db('gain', 'Gain', -24, 24, 0)],
  },
];

const specs = new Map(EFFECTS.map((e) => [e.type, e]));

/** an effect type's settings and name; undefined for a type this build doesn't know (a newer project's) */
export const effectSpec = (type: string): EffectSpec | undefined => specs.get(type as EffectType);

/** an effect's name in the app */
export const effectName = (type: string): string => effectSpec(type)?.name ?? type;

/** a setting's value on an insert: its own, else the effect's starting value, kept in range */
export function insertValue(insert: Insert, param: string): number {
  const p = effectSpec(insert.type)?.params.find((x) => x.id === param);
  const v = insert.params[param];
  if (!p) return typeof v === 'number' ? v : 0;
  if (typeof v !== 'number' || !Number.isFinite(v)) return p.value;
  const clamped = Math.max(p.min, Math.min(p.max, v));
  return p.choices ? Math.round(clamped) : clamped;
}

/** every setting of an insert, starting values filled in */
export const insertValues = (insert: Insert): Record<string, number> =>
  Object.fromEntries((effectSpec(insert.type)?.params ?? []).map((p) => [p.id, insertValue(insert, p.id)]));

/** how a setting reads: "−6.0 dB", "1.2 kHz", "1/8 D", "35%" */
export function paramText(param: EffectParam, value: number): string {
  if (param.choices) return param.choices[Math.round(value)] ?? '';
  const fixed = (x: number, d: number) => x.toFixed(d).replace('-', '−');
  switch (param.unit) {
    case 'dB':
      return `${fixed(value, 1)} dB`;
    case 'Hz':
      return value >= 1000
        ? `${fixed(value / 1000, value >= 10000 ? 1 : 2)} kHz`
        : `${fixed(value, value < 10 ? 2 : 0)} Hz`;
    case 's':
      return value < 1 ? `${fixed(value * 1000, 0)} ms` : `${fixed(value, 2)} s`;
    case '%':
      return `${Math.round(value * 100)}%`;
    case ':1':
      return `${fixed(value, 1)}:1`;
    case 'bits':
      return `${fixed(value, 1)} bits`;
    case '×':
      return `${fixed(value, 1)}×`;
    default:
      return fixed(value, 2);
  }
}

/** where a track's id goes, the master: its inserts are the project's `masterInserts` */
export const MASTER = 'master';

/** the inserts of the track with this id, or the master's */
export const insertsAt = (p: Pick<Project, 'tracks' | 'masterInserts'>, id: string): Insert[] =>
  id === MASTER ? (p.masterInserts ?? []) : insertsOf(p.tracks.find((t) => t.id === id) ?? {});

/** the inserts of a track; none for one saved before track effects */
export const insertsOf = (track: Pick<Track, 'inserts'>): Insert[] => track.inserts ?? [];

/** an id for a new insert, unused on the track */
function insertId(track: Pick<Track, 'inserts'>): string {
  const used = new Set(insertsOf(track).map((x) => x.id));
  let n = 1;
  while (used.has(`fx${n}`)) n++;
  return `fx${n}`;
}

/** the track (or the master) with its inserts changed by `f`; an empty list is removed, so one with none saves as it did */
function changeInserts(
  p: Project,
  trackId: string,
  f: (inserts: Insert[], track: Pick<Track, 'inserts'>) => Insert[],
): Project {
  if (trackId === MASTER) {
    const was = p.masterInserts ?? [];
    const now = f(was, { inserts: was });
    if (now === was) return p;
    const { masterInserts: _gone, ...rest } = p;
    return now.length ? { ...rest, masterInserts: now } : rest;
  }
  return updateTrack(p, trackId, (t) => {
    const was = insertsOf(t);
    const now = f(was, t);
    if (now === was) return t;
    const { inserts: _gone, ...rest } = t;
    return now.length ? { ...rest, inserts: now } : rest;
  });
}

/** adds an effect with its starting settings, at the end of the track's chain or at `at` */
export const addInsert = (p: Project, trackId: string, type: EffectType, at?: number): Project =>
  changeInserts(p, trackId, (list, t) => {
    const fresh: Insert = { id: insertId(t), type, params: {} };
    const i = at === undefined ? list.length : Math.max(0, Math.min(list.length, at));
    return [...list.slice(0, i), fresh, ...list.slice(i)];
  });

/** removes the insert, and any automation lanes of its settings */
export function removeInsert(p: Project, trackId: string, id: string): Project {
  const q = changeInserts(p, trackId, (list) =>
    list.some((x) => x.id === id) ? list.filter((x) => x.id !== id) : list,
  );
  return updateTrack(q, trackId, (t) => {
    const keys = Object.keys(t.automation).filter((k) => k.startsWith(`${id}.`));
    if (!keys.length) return t;
    return {
      ...t,
      automation: Object.fromEntries(Object.entries(t.automation).filter(([k]) => !keys.includes(k))),
    };
  });
}

/** moves the insert to place `to` in the chain (0: first, so it hears the sound first) */
export const moveInsert = (p: Project, trackId: string, id: string, to: number): Project =>
  changeInserts(p, trackId, (list) => {
    const from = list.findIndex((x) => x.id === id);
    const at = Math.max(0, Math.min(list.length - 1, to));
    if (from < 0 || from === at) return list;
    const rest = list.filter((x) => x.id !== id);
    return [...rest.slice(0, at), list[from]!, ...rest.slice(at)];
  });

/** turns the insert's bypass on or off: a bypassed effect is kept but passes the sound through untouched */
export const setInsertBypass = (p: Project, trackId: string, id: string, bypass: boolean): Project =>
  changeInserts(p, trackId, (list) => {
    const x = list.find((i) => i.id === id);
    if (!x || (x.bypass === true) === bypass) return list;
    return list.map((i) => {
      if (i.id !== id) return i;
      const { bypass: _b, ...rest } = i;
      return bypass ? { ...rest, bypass: true } : rest;
    });
  });

/** changes some of the insert's settings, each kept in its range */
export const setInsertParams = (
  p: Project,
  trackId: string,
  id: string,
  patch: Record<string, number>,
): Project =>
  changeInserts(p, trackId, (list) => {
    const x = list.find((i) => i.id === id);
    if (!x) return list;
    const params = { ...x.params };
    for (const [k, v] of Object.entries(patch)) params[k] = insertValue({ ...x, params: { [k]: v } }, k);
    if (
      Object.entries(params).every(([k, v]) => x.params[k] === v) &&
      Object.keys(params).length === Object.keys(x.params).length
    )
      return list;
    return list.map((i) => (i.id === id ? { ...i, params } : i));
  });

/** the parts of a track's inserts that change how they're built (their order, types and bypass), not their settings */
export const insertShape = (track: Pick<Track, 'inserts'>): string =>
  insertsOf(track)
    .map((x) => `${x.id}:${x.type}${x.bypass ? '-' : ''}`)
    .join(',');
