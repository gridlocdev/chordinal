// Finds and loads the instruments a project's tracks play: each track's SoundFont preset from the current library, and
// the .sf2 files they live in, downloaded once and shared (soundfont.js lets the least recently used go past a memory budget).
import { soundfontLibrary, type LibraryPreset } from '@chordinal/audio';
import type { Sf2Preset } from '@chordinal/lib';
import { loadSoundFont, findPreset, type LoadedFont } from './soundfont.ts';
import { audioEngine } from './audio-engine.ts';
import { prepareEffects } from './effects.ts';

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

/** a track's instrument, loaded: its font, its preset in it, and the library's entry for it */
export interface LoadedInstrument {
  font: LoadedFont;
  preset: Sf2Preset;
  entry: LibraryPreset;
}

/** Downloads every .sf2 file the tracks need. Resolves to one { font, preset, entry } per track. */
export async function loadInstruments(
  tracks: { instrument: { bank: number; program: number } }[],
  onStatus: (text: string) => void = () => {},
): Promise<LoadedInstrument[]> {
  const entries = tracks.map((t) => {
    const entry = presetFor(t.instrument.bank, t.instrument.program);
    if (!entry) throw new Error('the SoundFont library has no presets');
    return entry;
  });
  const urls = [...new Set(entries.map((e) => e.url))];
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
  await prepareEffects(audioEngine.context); // the effects' worklets, so the track effects can play
  return entries.map((entry) => {
    const font = fonts.get(entry.url);
    const preset = font && findPreset(font, entry.bank, entry.program);
    if (!font || !preset) throw new Error(`no preset ${entry.bank}:${entry.program} in ${entry.url}`);
    return { font, preset, entry };
  });
}
