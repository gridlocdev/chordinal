// A track's sampler (Chordinal PRD §14): an audio file dropped on its header, or loaded from the Sound tab, is copied
// into the project's samples/ folder (sample-files.ts) and played across the keys from its root key, which is guessed
// from its pitch. Each change is an edit, and a slider dragged is one undo step, as the synth's are (synth-edit.ts).
import {
  DEFAULT_SAMPLER,
  SAMPLE_FILE,
  guessRoot,
  samplerSettings,
  withSamplerValue,
  type SamplerSettings,
} from '@chordinal/audio';
import { isDrums, updateTrack } from '@chordinal/daw';
import type { Track } from '@chordinal/daw';
import { noteName } from '@chordinal/lib';
import { mic } from '@chordinal/playback';
import { edit } from './document.ts';
import { notify, selected } from './store.ts';
import { trackOf } from './tracks.ts';
import { errorText } from './errors.ts';
import { keepSample } from './sample-files.ts';

/** the track's sampler, filled in, or null when it plays something else */
export const samplerOf = (track: Track | null): SamplerSettings | null =>
  track?.instrument.sample ? samplerSettings(track.instrument.sample) : null;

/** puts the sampler's changed settings on the track, keeping its General MIDI program */
function put(trackId: string, sample: SamplerSettings, merge: string | null = null): void {
  edit((p) => {
    const t = p.tracks.find((x) => x.id === trackId);
    return t ? updateTrack(p, trackId, { instrument: { ...t.instrument, sample } }) : p;
  }, merge);
}

/** sets one of the track's sampler settings, by its path ('amp.release') */
export function setSampleValue(trackId: string, path: string, value: unknown): void {
  const sample = samplerOf(trackOf(trackId));
  if (sample) put(trackId, withSamplerValue(sample, path, value), `sample:${trackId}:${path}`);
}

/** renames the track's sampler: what its header and the mixer show */
export function renameSample(trackId: string, name: string): void {
  const sample = samplerOf(trackOf(trackId));
  if (sample && name.trim() && name.trim() !== sample.name)
    put(trackId, samplerSettings({ ...sample, name }));
}

/** puts an audio file on a track as a sampler: copied into the project, its root key guessed from its pitch */
export async function loadSample(trackId: string, file: File): Promise<void> {
  const t = trackOf(trackId);
  if (!t) return;
  if (isDrums(t)) {
    notify(`${t.name} plays a drum kit: drop a sample on one of its rows in the step grid`, 'error');
    return;
  }
  selected.value = trackId;
  notify(`Reading ${file.name}…`, 'busy');
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { samples, rate } = await mic.decode(bytes.slice().buffer);
    const stored = await keepSample(file.name, bytes);
    const root = guessRoot(samples, rate);
    const sample = samplerSettings({
      ...DEFAULT_SAMPLER,
      name: file.name.replace(SAMPLE_FILE, ''),
      file: stored,
      root: root ?? DEFAULT_SAMPLER.root,
    });
    edit((p) => updateTrack(p, trackId, { instrument: { bank: 0, program: t.instrument.program, sample } }));
    notify(
      root === null
        ? `${t.name} plays ${file.name}: no steady pitch heard, so its root key is C4`
        : `${t.name} plays ${file.name}, root key ${noteName(root)}`,
    );
  } catch (e) {
    notify(`${file.name}: ${errorText(e)}`, 'error');
  }
}
