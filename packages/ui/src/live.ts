// Playing the selected track's instrument live: musical typing on the computer keyboard (while the piano roll has the
// focus, focus.ts) and any MIDI keyboard. A key sounds while any input holds it. Each key goes through the track's note
// effects (Scale, Chord), so you hear what Play will play; recording (onPlayed) still gets the keys you pressed. With
// an Arpeggiator on, the keys held go into it and a clock on the audio context plays its steps at the project's tempo.
import { signal, effect } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { midi } from './platform/midi.ts';
import { NOTE_KEYS, OCTAVE_KEYS, typing } from './platform/keys.ts';
import { bpmAt, octaveC } from '@chordinal/lib';
import {
  loadSoundFont,
  findPreset,
  createInstrument,
  createSampler,
  createSynth,
  effectChain,
  prepareEffects,
} from '@chordinal/playback';
import { presetFor } from '@chordinal/playback';
import { audioEngine } from '@chordinal/playback';
import type { EffectChain, Instrument } from '@chordinal/playback';
import {
  samplerSettings,
  synthSettings,
  type LibraryPreset,
  type SamplerSettings,
  type SynthSettings,
} from '@chordinal/audio';
import {
  applyNoteFx,
  arpCycle,
  arpKey,
  arpSettings,
  insertValues,
  insertsOf,
  splitAtArp,
} from '@chordinal/daw';
import type { ArpSettings, Insert, Track, TrackFx } from '@chordinal/daw';
import { settings, setSettings, selectedTrack, project, projectName, beat, notify } from './store.ts';
import { readSample } from './sample-files.ts';
import { musicalTyping } from './focus.ts';
import type { KeyPress } from './commands/shortcut.ts';
import { errorText } from './errors.ts';

const KEY_VELOCITY = 100; // computer keys have no velocity
const SUSTAIN_CC = 64;
const OCTAVES = [1, 7] as const;

/** a key pressed or released live, with its context time; vel only on a press */
export interface PlayedKey {
  key: number;
  vel?: number;
  on: boolean;
  time: number;
}

/** the keys sounding now, for the editor's keyboard to light up */
export const held: Signal<Set<number>> = signal(new Set());
/** the instrument musical typing plays, by name */
export const liveName: Signal<string> = signal('');

/** told of every key pressed and released on the computer keyboard or a MIDI keyboard, with its context time */
const players = new Set<(e: PlayedKey) => void>();
/** returns a function that stops telling `fn` */
export function onPlayed(fn: (e: PlayedKey) => void): () => boolean {
  players.add(fn);
  return () => players.delete(fn);
}
const played = (key: number, on: boolean, vel?: number) => {
  const time = audioEngine.context.currentTime;
  for (const fn of players) fn({ key, on, vel, time });
};

let instrument: Instrument | null = null;
let loading = 0;
let pedal = false;
const down = new Map<number, number>(); // MIDI key → number of inputs holding it
const sounds = new Map<number, number[]>(); // a held key → the keys its note effects play
const sounding = new Map<number, number>(); // a key the instrument plays → number of held keys playing it
const typed = new Map<string, number>(); // KeyboardEvent.code → the MIDI key it started (the octave may change meanwhile)

// ── the selected track's effects, which the keys played live go through ─────────────────────────────────────────────

let chain: EffectChain | null = null;
let chainIn: GainNode | null = null;
let chainOf: { track: string; inserts: Insert[] } | null = null; // the track and inserts the chain was last set to
let chainBpm = 0;

const bpmNow = () => bpmAt(project.value.tempoMap, beat.value);

/** where the live instrument plays into: the selected track's effects, then the master. Made on the live context,
 * so not while an export renders. */
let made: Promise<AudioNode> | null = null;
function liveInput(): Promise<AudioNode> {
  made ??= (async () => {
    while (audioEngine.rendering) await audioEngine.rendering.catch(() => {});
    const ctx = audioEngine.context;
    await prepareEffects(ctx); // the Bitcrusher's worklet
    chainIn = new GainNode(ctx);
    chainBpm = bpmNow();
    chain = effectChain(ctx, chainIn, audioEngine.output, chainBpm);
    syncEffects();
    return chainIn;
  })();
  return made;
}

/** sets the live chain to the selected track's effects: rebuilt for another track, and for the same track only the
 * effects added, removed, moved or bypassed are rewired, while a changed setting glides to its new value */
function syncEffects(): void {
  if (!chain) return;
  const track = selectedTrack.value;
  const list = track ? insertsOf(track) : [];
  const was = chainOf && track && chainOf.track === track.id ? chainOf.inserts : null;
  if (!was) chain.setInserts([]); // another track's fx1 isn't this one's
  chain.setInserts(list);
  for (const x of list) {
    const e = chain.effects.get(`${x.id}:${x.type}`),
      before = was?.find((w) => w.id === x.id && w.type === x.type);
    if (!e || !before) continue;
    const then = insertValues(before);
    for (const [k, v] of Object.entries(insertValues(x))) if (then[k] !== v) e.set(k, v);
  }
  chainOf = track ? { track: track.id, inserts: list } : null;
}

/** the preset the selected track plays, or a piano with none selected */
const presetOf = (track: Track | null) =>
  track ? presetFor(track.instrument.bank, track.instrument.program) : presetFor(0, 0);

/** what musical typing plays for the selected track: its sampler, its synth, or its preset (by key, to load only when
 * it changes) */
function liveSound(
  track: Track | null,
):
  | { key: string; sample: SamplerSettings }
  | { key: string; synth: SynthSettings }
  | { key: string; entry: LibraryPreset }
  | null {
  if (track?.instrument.sample) {
    const sample = samplerSettings(track.instrument.sample);
    return { key: `sample:${projectName.value}:${JSON.stringify(sample)}`, sample };
  }
  if (track?.instrument.synth) {
    const synth = synthSettings(track.instrument.synth);
    return { key: `synth:${JSON.stringify(synth)}`, synth };
  }
  const entry = presetOf(track);
  return entry ? { key: `${entry.url}#${entry.bank}:${entry.program}`, entry } : null;
}

/** puts `make`'s instrument in place of the last one, once the live chain is ready. `make` waits out an export: an
 * instrument made while exporting would belong to the offline render. */
async function load(name: string, make: (into: AudioNode) => Promise<Instrument>): Promise<void> {
  const id = ++loading;
  try {
    const into = await liveInput();
    const made = await make(into);
    if (id !== loading) {
      made.dispose();
      return;
    }
    releaseAll();
    instrument?.dispose();
    instrument = made;
    instrument.setSustain(pedal);
    liveName.value = name;
  } catch (e) {
    if (id === loading) notify(`Couldn't load ${name}: ${errorText(e)}`, 'error');
  }
}

const loadPreset = (entry: LibraryPreset): Promise<void> =>
  load(entry.name, async (into) => {
    const font = await loadSoundFont(entry.url);
    while (audioEngine.rendering) await audioEngine.rendering.catch(() => {});
    const preset = findPreset(font, entry.bank, entry.program);
    if (!preset) throw new Error(`no preset ${entry.bank}:${entry.program}`);
    return createInstrument(font, preset, into);
  });

const loadSampler = (sample: SamplerSettings): Promise<void> =>
  load(sample.name, async (into) => {
    const buffer = await readSample(sample.file);
    while (audioEngine.rendering) await audioEngine.rendering.catch(() => {});
    return createSampler(sample, buffer, into);
  });

const loadSynth = (synth: SynthSettings): Promise<void> =>
  load(synth.name, async (into) => {
    while (audioEngine.rendering) await audioEngine.rendering.catch(() => {});
    return createSynth(synth, into);
  });

/** the keys one pressed key plays through the selected track's note effects (or just `fx`, some of them) */
export function liveKeys(key: number, velocity = KEY_VELOCITY, fx?: TrackFx[]): number[] {
  const track = selectedTrack.value;
  const note = { beat: 0, beats: 1, key, vel: velocity };
  return track ? applyNoteFx([note], fx ? { ...track, fx } : track, project.value).map((n) => n.key) : [key];
}

// ── the live arpeggio ──────────────────────────────────────────────────────────────────────────────────────────────

const AHEAD = 0.1; // seconds of steps scheduled ahead on the audio clock
const TICK_MS = 25;

/** the arpeggio while keys are held: the keys in it in the order pressed, its loudest key's velocity, the next step
 * and when it plays */
let arp: {
  keys: number[];
  vel: number;
  n: number;
  next: number;
  timer: ReturnType<typeof setInterval>;
} | null = null;
const arpIn = new Map<number, number[]>(); // a held key → the keys it put into the arpeggio

function stopArp(): void {
  if (arp) clearInterval(arp.timer);
  arp = null;
}

/** a step of the live arpeggio: the key, when it starts and stops on the audio clock, and its number */
export interface ArpStep {
  key: number;
  on: number;
  off: number;
  n: number;
}

/** the live arpeggio's steps from step `n` at `next` seconds up to `until`, each `stepSec` long. Pure. */
export function dueSteps(
  keys: readonly number[],
  a: ArpSettings,
  n: number,
  next: number,
  until: number,
  stepSec: number,
): ArpStep[] {
  const cycle = arpCycle(keys, a.direction, a.octaves);
  const steps: ArpStep[] = [];
  if (!cycle.length || !(stepSec > 0)) return steps;
  for (let t = next; t < until; t += stepSec, n++)
    steps.push({ key: arpKey(cycle, n, a.direction), on: t, off: t + stepSec * a.gate, n });
  return steps;
}

/** schedules the arpeggio's steps up to AHEAD seconds from now, through the effects after the arpeggiator */
function arpTick(): void {
  const split = splitAtArp(selectedTrack.value?.fx ?? []);
  if (!arp || !split || !arp.keys.length || audioEngine.rendering) return stopArp();
  const a = arpSettings(split.arp);
  const now = audioEngine.context.currentTime;
  if (arp.next < now) arp.next = now; // the tab slept: start again from now, not with a burst of late steps
  const stepSec = (a.step * 60) / bpmAt(project.value.tempoMap, beat.value);
  for (const step of dueSteps(arp.keys, a, arp.n, arp.next, now + AHEAD, stepSec)) {
    for (const k of liveKeys(step.key, arp.vel, split.after)) {
      instrument?.noteOn(k, arp.vel, step.on);
      instrument?.noteOff(k, false, step.off);
    }
    arp.n = step.n + 1;
    arp.next = step.on + stepSec;
  }
}

export function press(key: number, velocity = KEY_VELOCITY): void {
  if (audioEngine.rendering) return;
  const n = down.get(key) ?? 0;
  down.set(key, n + 1);
  if (n) return;
  held.value = new Set(down.keys());
  const split = splitAtArp(selectedTrack.value?.fx ?? []);
  if (split) {
    const keys = liveKeys(key, velocity, split.before);
    arpIn.set(key, keys);
    if (arp) {
      arp.keys.push(...keys);
      arp.vel = Math.max(arp.vel, velocity);
    } else {
      const next = audioEngine.context.currentTime + 0.005;
      arp = { keys: [...keys], vel: velocity, n: 0, next, timer: setInterval(arpTick, TICK_MS) };
      arpTick();
    }
    return;
  }
  const keys = liveKeys(key, velocity);
  sounds.set(key, keys);
  for (const k of keys) {
    const m = sounding.get(k) ?? 0;
    if (!m) instrument?.noteOn(k, velocity);
    sounding.set(k, m + 1);
  }
}

export function release(key: number): void {
  const n = (down.get(key) ?? 0) - 1;
  if (n > 0) {
    down.set(key, n);
    return;
  }
  down.delete(key);
  const into = arpIn.get(key);
  if (into && arp) {
    for (const k of into) {
      const i = arp.keys.indexOf(k);
      if (i >= 0) arp.keys.splice(i, 1);
    }
    if (!arp.keys.length) stopArp();
  }
  arpIn.delete(key);
  for (const k of sounds.get(key) ?? []) {
    const m = (sounding.get(k) ?? 0) - 1;
    if (m > 0) sounding.set(k, m);
    else {
      sounding.delete(k);
      instrument?.noteOff(k);
    }
  }
  sounds.delete(key);
  held.value = new Set(down.keys());
}

function releaseAll(): void {
  for (const key of [...down.keys()]) {
    down.set(key, 1);
    release(key);
  }
  for (const key of typed.values()) played(key, false);
  typed.clear();
}

/** the connected MIDI keyboards' names, for the status bar */
export const midiInputs: Signal<string[]> = signal([]);
export const connectMidi = (): Promise<boolean> =>
  midi.init((names) => {
    midiInputs.value = names;
  });

const TYPED = Object.values(NOTE_KEYS);
/** the lowest and highest key the letter keys play in an octave */
export const typedRange = (octave: number): { lo: number; hi: number } => ({
  lo: octaveC(octave) + Math.min(...TYPED),
  hi: octaveC(octave) + Math.max(...TYPED),
});

/**
 * what a key press is to musical typing: a note, an octave change, another letter (kept from the shortcuts, which wait
 * until the roll loses the focus; R still reaches Record during a take, through the page's own handler), or nothing
 */
export function musicalKey(e: KeyPress): 'note' | 'octave' | 'letter' | null {
  if (e.metaKey || e.ctrlKey || e.altKey || typing() || !musicalTyping()) return null;
  if (OCTAVE_KEYS[e.code] !== undefined) return 'octave';
  if (NOTE_KEYS[e.code] !== undefined) return 'note';
  return /^Key[A-Z]$/.test(e.code) ? 'letter' : null;
}

/** wires the keyboard and MIDI, and reloads the instrument whenever the selected track's preset, synth or sampler
 * changes */
export function startLive(): void {
  let last = '';
  effect(() => {
    void settings.value.library; // a library switch changes what presetFor finds
    const sound = liveSound(selectedTrack.value);
    if (!sound || sound.key === last) return;
    last = sound.key;
    void ('sample' in sound
      ? loadSampler(sound.sample)
      : 'synth' in sound
        ? loadSynth(sound.synth)
        : loadPreset(sound.entry));
  });
  void liveInput();
  effect(() => {
    void selectedTrack.value?.inserts;
    syncEffects();
  });
  effect(() => {
    const bpm = bpmNow();
    if (!chain || bpm === chainBpm) return;
    chainBpm = bpm;
    chain.tempo(bpm, audioEngine.context.currentTime);
  });
  addEventListener('keydown', (e) => {
    const kind = musicalKey(e);
    if (!kind) return;
    // the key is a note now, so nothing else may answer it: unhandled keys go on to the menu bar, which on macOS answers
    // its plain-letter shortcuts (A, M, R…) itself, and to a focused select, which jumps to the option with that letter
    e.preventDefault();
    if (e.repeat || kind === 'letter') return;
    if (kind === 'octave') {
      const shift = OCTAVE_KEYS[e.code]!;
      const octave = Math.max(OCTAVES[0], Math.min(OCTAVES[1], settings.value.octave + shift));
      setSettings({ octave });
      return;
    }
    const semitones = NOTE_KEYS[e.code]!;
    const key = octaveC(settings.value.octave) + semitones;
    typed.set(e.code, key);
    press(key);
    played(key, true, KEY_VELOCITY);
  });
  addEventListener('keyup', (e) => {
    const key = typed.get(e.code);
    if (key === undefined) return;
    typed.delete(e.code);
    release(key);
    played(key, false);
  });
  // keys held when the window loses focus never come up
  addEventListener('blur', releaseAll);
  midi.on((m) => {
    if (m.type === 'noteon') {
      press(m.key, m.velocity);
      played(m.key, true, m.velocity);
    } else if (m.type === 'noteoff') {
      release(m.key);
      played(m.key, false);
    } else if (m.type === 'cc' && m.controller === SUSTAIN_CC) {
      pedal = m.value >= 64;
      instrument?.setSustain(pedal);
    }
  });
}
