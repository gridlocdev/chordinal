// Finds and loads the instruments a project's tracks play: each track's SoundFont preset from the current library, and
// the .sf2 files they live in, downloaded once and shared (soundfont.js lets the least recently used go past a memory budget),
// or its synth, which needs nothing downloaded, or its sampler's audio, which the caller reads from the project.
import {
  drumSamples,
  samplerSettings,
  soundfontLibrary,
  synthSettings,
  type LibraryPreset,
  type SamplerSettings,
  type SynthSettings,
} from '@chordinal/audio';
import type { Sf2Preset } from '@chordinal/lib';
import { loadSoundFont, findPreset, type LoadedFont } from './soundfont.ts';
import { audioEngine } from './audio-engine.ts';
import { prepareEffects } from './effects.ts';
import type { LoadedRow } from './drum-rows.ts';

/** the library's preset for a bank and program: that one, or the same program on any bank of its kind, or the first */
export function presetFor(bank: number, program: number): LibraryPreset | undefined {
  const presets = soundfontLibrary.presets();
  return (
    presets.find((p) => p.bank === bank && p.program === program) ??
    presets.find((p) => p.bank >= 127 === bank >= 127 && p.program === program) ??
    presets.find((p) => p.bank >= 127 === bank >= 127) ??
    presets[0]
  );
}

/** a track's SoundFont preset, loaded: its font, its preset in it, the library's entry for it, and for a kit, the
 * samples on its rows (PRD §14) */
export interface LoadedPreset {
  font: LoadedFont;
  preset: Sf2Preset;
  entry: LibraryPreset;
  rows?: LoadedRow[];
}

/** a track's synth (PRD §13): its settings, filled in */
export interface LoadedSynth {
  synth: SynthSettings;
}

/** a track's sampler (PRD §13): its settings, filled in, and its audio, or null when its file can't be read */
export interface LoadedSample {
  sample: SamplerSettings;
  buffer: AudioBuffer | null;
}

/** a track's instrument, loaded */
export type LoadedInstrument = LoadedPreset | LoadedSynth | LoadedSample;

/** what playProject plays a track with: a font and its preset, a synth's settings, or a sampler's and its audio */
export type PlayableInstrument =
  | { font: LoadedFont; preset: Sf2Preset; rows?: readonly LoadedRow[] }
  | { synth: unknown }
  | { sample: unknown; buffer: AudioBuffer | null };

/** a sample file's audio, from the project it's in: null when it can't be read */
export type SampleReader = (file: string) => Promise<AudioBuffer | null>;

/** an audio file's bytes (WAV, AIFF, MP3) as audio the sampler plays */
export const decodeSample = (bytes: ArrayBuffer): Promise<AudioBuffer> =>
  audioEngine.context.decodeAudioData(bytes);

/**
 * Downloads every .sf2 file the tracks need, and reads every sample with `readSample` (without one, a sampler plays
 * nothing). Resolves to one loaded instrument per track.
 */
export async function loadInstruments(
  tracks: {
    instrument: { bank: number; program: number; synth?: object; sample?: object; drumSamples?: object };
  }[],
  onStatus: (text: string) => void = () => {},
  readSample: SampleReader = () => Promise.resolve(null),
): Promise<LoadedInstrument[]> {
  const entries = tracks.map((t) => {
    if (t.instrument.synth || t.instrument.sample) return null;
    const entry = presetFor(t.instrument.bank, t.instrument.program);
    if (!entry) throw new Error('the SoundFont library has no presets');
    return entry;
  });
  const urls = [...new Set(entries.flatMap((e) => (e ? [e.url] : [])))];
  const progress = new Map(urls.map((u) => [u, 0]));
  const report = () =>
    onStatus(
      `Loading ${urls.length} SoundFont file${urls.length > 1 ? 's' : ''}… ${Math.floor(([...progress.values()].reduce((a, b) => a + b, 0) / urls.length) * 100)}%`,
    );
  if (urls.length) report();
  const fonts = new Map(
    await Promise.all(
      urls.map(
        async (u) =>
          [
            u,
            await loadSoundFont(u, (loaded, total) => {
              progress.set(u, loaded / total);
              report();
            }),
          ] as const,
      ),
    ),
  );
  const samples = await Promise.all(
    tracks.map(async ({ instrument: { sample } }) => {
      if (!sample) return null;
      const s = samplerSettings(sample);
      return { sample: s, buffer: s.file ? await readSample(s.file).catch(() => null) : null };
    }),
  );
  const read = (file: string) => readSample(file).catch(() => null);
  const rows = await Promise.all(
    tracks.map(({ instrument }) =>
      instrument.synth || instrument.sample
        ? []
        : Promise.all(
            [...drumSamples(instrument.drumSamples)].map(async ([key, sample]): Promise<LoadedRow> => ({
              key,
              sample,
              buffer: await read(sample.file),
            })),
          ),
    ),
  );
  await prepareEffects(audioEngine.context); // the effects' worklets, so the track effects can play
  return entries.map((entry, i): LoadedInstrument => {
    const sampler = samples[i];
    if (sampler) return sampler;
    if (!entry) return { synth: synthSettings(tracks[i]!.instrument.synth) };
    const font = fonts.get(entry.url);
    const preset = font && findPreset(font, entry.bank, entry.program);
    if (!font || !preset) throw new Error(`no preset ${entry.bank}:${entry.program} in ${entry.url}`);
    const sampled = rows[i]!;
    return sampled.length ? { font, preset, entry, rows: sampled } : { font, preset, entry };
  });
}
