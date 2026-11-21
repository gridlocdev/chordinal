// Which SoundFont library the game plays: one of the catalog's LIBRARIES, switchable at runtime to compare them.
import { LIBRARIES } from './soundfont-catalog-data.ts';
import { CHIP_URL, CHIP_BANK, CHIP_KIT_BANK, CHIP_INSTRUMENTS, CHIP_KITS } from './chip-instruments-data.ts';
import type { Library, PresetInfo } from './soundfont-libraries-data.ts';

/** a preset with the url of its file and that file's index in the library */
export interface LibraryPreset extends PresetInfo {
  url: string;
  file: number;
}

// the chip instruments, made in code, come with every library
const CHIP_PRESETS: PresetInfo[] = [
  ...CHIP_INSTRUMENTS.map((i) => ({ bank: CHIP_BANK, program: i.program, name: i.name })),
  ...CHIP_KITS.map((k) => ({ bank: CHIP_KIT_BANK, program: k.program, name: k.name })),
].sort((a, b) => a.bank - b.bank || a.program - b.program);

const FIRST = LIBRARIES[0];
if (!FIRST) throw new Error('the catalog lists no library');
let current: Library = FIRST;

export const soundfontLibrary = {
  all: LIBRARIES,
  get current(): Library {
    return current;
  },
  /** switches to the library with this id; an unknown id keeps the current one */
  select(id: string): Library {
    current = LIBRARIES.find((l) => l.id === id) ?? current;
    return current;
  },
  /** every preset in a library, flat, in catalog order, with its file's url and index, then the chip instruments */
  presets(library: Library = current): LibraryPreset[] {
    return [
      ...library.files.flatMap((f, file) => f.presets.map((p) => ({ ...p, url: f.url, file }))),
      ...CHIP_PRESETS.map((p) => ({ ...p, url: CHIP_URL, file: library.files.length })),
    ];
  },
};
