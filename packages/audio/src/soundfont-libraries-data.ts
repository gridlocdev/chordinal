// The SoundFont libraries the game can play, and where their .sf2 files live (relative to index.html).
// tools/sf2-catalog.mjs reads this to write soundfont-catalog-data.ts. Imports nothing.

export interface LibrarySource {
  id: string;
  name: string;
  /** the folder holding the library's .sf2 files */
  dir: string;
  license: string;
}

export const LIBRARY_SOURCES: readonly LibrarySource[] = [
  {
    id: 'generaluser',
    name: 'GeneralUser GS',
    dir: 'soundfonts/GeneralUser-GS',
    license: 'GeneralUser GS License v2.0, by S. Christian Collins',
  },
  { id: 'fluidr3', name: 'FluidR3_GM', dir: 'soundfonts/FluidR3_GM', license: 'MIT, by Frank Wen' },
  {
    id: 'musescore',
    name: 'MuseScore_General',
    dir: 'soundfonts/MuseScore_General',
    license: 'MIT, by Frank Wen, Michael Cowgill and S. Christian Collins',
  },
];

/** a preset in a SoundFont file: a melodic instrument (bank < 128) or a drum kit */
export interface PresetInfo {
  bank: number;
  program: number;
  name: string;
}

export interface LibraryFile {
  /** relative to index.html */
  url: string;
  bytes: number;
  presets: PresetInfo[];
}

export interface Library {
  id: string;
  name: string;
  license: string;
  files: LibraryFile[];
}
