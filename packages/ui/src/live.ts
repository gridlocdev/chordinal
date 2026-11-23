// Playing the selected track's instrument live: musical typing on the computer keyboard (while the piano roll has the
// focus, focus.ts) and any MIDI keyboard. A key sounds while any input holds it. Each key goes through the track's note
// effects (Scale, Chord), so you hear what Play will play; recording (onPlayed) still gets the keys you pressed. With
// an Arpeggiator on, the keys held go into it and a clock on the audio context plays its steps at the project's tempo.
import { signal, effect } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { midi } from './platform/midi.ts';
import { NOTE_KEYS, OCTAVE_KEYS, typing } from './platform/keys.ts';
import { bpmAt, octaveC } from '@chordinal/lib';
import { loadSoundFont, findPreset, createInstrument } from '@chordinal/playback';
import { presetFor } from '@chordinal/playback';
import { audioEngine } from '@chordinal/playback';
import type { Instrument } from '@chordinal/playback';
import type { LibraryPreset } from '@chordinal/audio';
import { applyNoteFx, arpCycle, arpKey, arpSettings, splitAtArp } from '@chordinal/daw';
import type { ArpSettings, Track, TrackFx } from '@chordinal/daw';
import { settings, setSettings, selectedTrack, project, beat, notify } from './store.ts';
import { musicalTyping } from './focus.ts';
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

/** the preset the selected track plays, or a piano with none selected */
const presetOf = (track: Track | null) =>
  track ? presetFor(track.instrument.bank, track.instrument.program) : presetFor(0, 0);

async function load(entry: LibraryPreset): Promise<void> {
  const id = ++loading;
  try {
    const font = await loadSoundFont(entry.url);
    // an instrument made while exporting would belong to the offline render
    while (audioEngine.rendering) await audioEngine.rendering.catch(() => {});
    if (id !== loading) return;
    const preset = findPreset(font, entry.bank, entry.program);
    if (!preset) throw new Error(`no preset ${entry.bank}:${entry.program}`);
    releaseAll();
    instrument?.dispose();
    instrument = createInstrument(font, preset);
    instrument.setSustain(pedal);
    liveName.value = preset.name;
  } catch (e) {
    if (id === loading) notify(`Couldn't load ${entry.name}: ${errorText(e)}`, 'error');
  }
}

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

/** wires the keyboard and MIDI, and reloads the instrument whenever the selected track's preset changes */
export function startLive(): void {
  let last = '';
  effect(() => {
    void settings.value.library; // a library switch changes what presetFor finds
    const entry = presetOf(selectedTrack.value);
    if (!entry) return;
    const id = `${entry.url}#${entry.bank}:${entry.program}`;
    if (id !== last) {
      last = id;
      void load(entry);
    }
  });
  addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || typing() || !musicalTyping()) return;
    const shift = OCTAVE_KEYS[e.code];
    if (shift !== undefined) {
      const octave = Math.max(OCTAVES[0], Math.min(OCTAVES[1], settings.value.octave + shift));
      setSettings({ octave });
      return;
    }
    const semitones = NOTE_KEYS[e.code];
    if (semitones === undefined) return;
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
