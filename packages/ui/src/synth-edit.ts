// Setting the selected track's synth from the Sound tab (Chordinal PRD §13). Each change is an edit, and a slider
// dragged is one undo step.
import { DEFAULT_SYNTH, synthSettings, withSynthValue, type SynthSettings } from '@chordinal/audio';
import { updateTrack } from '@chordinal/daw';
import type { Track } from '@chordinal/daw';
import { edit } from './document.ts';
import { trackOf } from './tracks.ts';

/** the track's synth, filled in, or null when it plays a SoundFont preset */
export const synthOf = (track: Track | null): SynthSettings | null =>
  track?.instrument.synth ? synthSettings(track.instrument.synth) : null;

/** puts the synth's changed settings on the track, keeping its General MIDI program */
function put(trackId: string, synth: SynthSettings, merge: string | null = null): void {
  edit((p) => {
    const t = p.tracks.find((x) => x.id === trackId);
    return t ? updateTrack(p, trackId, { instrument: { ...t.instrument, synth } }) : p;
  }, merge);
}

/** sets one of the track's synth settings, by its path ('filter.cutoff') */
export function setSynthValue(trackId: string, path: string, value: unknown): void {
  const synth = synthOf(trackOf(trackId));
  if (synth) put(trackId, withSynthValue(synth, path, value), `synth:${trackId}:${path}`);
}

/** renames the track's synth: what its header and the mixer show */
export function renameSynth(trackId: string, name: string): void {
  const synth = synthOf(trackOf(trackId));
  if (synth && name.trim() && name.trim() !== synth.name) put(trackId, synthSettings({ ...synth, name }));
}

/** puts the starting synth on a track that plays a SoundFont preset; its program stays for a MIDI export */
export function useSynth(trackId: string): void {
  const t = trackOf(trackId);
  if (t && !t.instrument.synth && t.instrument.bank < 128)
    edit((p) =>
      updateTrack(p, trackId, {
        instrument: { bank: 0, program: t.instrument.program, synth: DEFAULT_SYNTH },
      }),
    );
}

/** puts every setting but the name back to the starting synth's */
export function resetSynth(trackId: string): void {
  const synth = synthOf(trackOf(trackId));
  if (synth) put(trackId, { ...DEFAULT_SYNTH, name: synth.name });
}
