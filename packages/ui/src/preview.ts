// Hearing an instrument before choosing it: a short note on middle C, or a kick, a snare and a closed hat for a kit
// (Chordinal PRD §7.2), or a synth's preset (§13). One preview sounds at a time; a new one cuts the last.
import { loadSoundFont, findPreset, createInstrument, createSynth } from '@chordinal/playback';
import type { Instrument } from '@chordinal/playback';
import { audioEngine } from '@chordinal/playback';
import type { LibraryPreset, SynthSettings } from '@chordinal/audio';
import { notify } from './store.ts';
import { errorText } from './errors.ts';

const MIDDLE_C = 60,
  VELOCITY = 100;
const NOTE_S = 0.6; // how long the note is held
const KIT = [36, 38, 42]; // kick, snare, closed hat (General MIDI)
const KIT_STEP_S = 0.25;
const TAIL_S = 1.5; // after the last note-off, before the instrument is let go

/** a preset to hear: its file's url, where it is in the file, and its name */
export type PreviewPreset = Pick<LibraryPreset, 'url' | 'bank' | 'program' | 'name'>;

/** a note a preview plays: [key, start s, length s] */
export type PreviewNote = [key: number, at: number, length: number];

/** the notes a preview plays */
export const previewNotes = (preset: { bank: number }): PreviewNote[] =>
  preset.bank >= 128
    ? KIT.map((key, i): PreviewNote => [key, i * KIT_STEP_S, KIT_STEP_S])
    : [[MIDDLE_C, 0, NOTE_S]];

let current: { inst: Instrument; timers: ReturnType<typeof setTimeout>[] } | null = null,
  asked = 0;

/** plays a preset briefly */
export async function preview(preset: PreviewPreset): Promise<void> {
  const id = ++asked;
  try {
    const font = await loadSoundFont(preset.url);
    if (id !== asked || audioEngine.rendering) return;
    const found = findPreset(font, preset.bank, preset.program);
    if (!found) throw new Error(`no preset ${preset.bank}:${preset.program}`);
    sound(createInstrument(font, found), previewNotes(preset));
  } catch (e) {
    if (id === asked) notify(`Couldn't play ${preset.name}: ${errorText(e)}`, 'error');
  }
}

/** plays a synth's preset briefly */
export function previewSynth(synth: SynthSettings): void {
  ++asked;
  if (!audioEngine.rendering) sound(createSynth(synth), previewNotes({ bank: 0 }));
}

/** plays `notes` on `inst`, cutting the last preview, and lets it go after its tail */
function sound(inst: Instrument, notes: PreviewNote[]): void {
  stop();
  const timers: ReturnType<typeof setTimeout>[] = [];
  for (const [key, at, len] of notes) {
    timers.push(setTimeout(() => inst.noteOn(key, VELOCITY), at * 1000));
    timers.push(setTimeout(() => inst.noteOff(key), (at + len) * 1000));
  }
  const end = Math.max(...notes.map(([, at, len]) => at + len)) + TAIL_S;
  timers.push(
    setTimeout(() => {
      if (current?.inst === inst) stop();
    }, end * 1000),
  );
  current = { inst, timers };
}

function stop(): void {
  if (!current) return;
  for (const t of current.timers) clearTimeout(t);
  current.inst.dispose();
  current = null;
}
