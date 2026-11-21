// Playing the selected track's instrument live: musical typing on the computer keyboard (while the piano roll has the
// focus, focus.ts) and any MIDI keyboard. A key sounds while any input holds it.
import { signal, effect } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { midi } from './platform/midi.ts';
import { NOTE_KEYS, OCTAVE_KEYS, typing } from './platform/keys.ts';
import { octaveC } from '@chordinal/lib';
import { loadSoundFont, findPreset, createInstrument } from '@chordinal/playback';
import { presetFor } from '@chordinal/playback';
import { audioEngine } from '@chordinal/playback';
import type { Instrument } from '@chordinal/playback';
import type { LibraryPreset } from '@chordinal/audio';
import type { Track } from '@chordinal/daw';
import { settings, setSettings, selectedTrack, status } from './store.ts';
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
    if (id === loading) status.value = `Couldn't load ${entry.name}: ${errorText(e)}`;
  }
}

export function press(key: number, velocity = KEY_VELOCITY): void {
  if (audioEngine.rendering) return;
  const n = down.get(key) ?? 0;
  if (!n) instrument?.noteOn(key, velocity);
  down.set(key, n + 1);
  if (!n) held.value = new Set(down.keys());
}

export function release(key: number): void {
  const n = (down.get(key) ?? 0) - 1;
  if (n > 0) {
    down.set(key, n);
    return;
  }
  down.delete(key);
  instrument?.noteOff(key);
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

export const connectMidi = (): Promise<boolean> => midi.init(() => {});

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
