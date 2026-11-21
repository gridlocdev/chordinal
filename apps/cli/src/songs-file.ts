// A game's songs file, which `chordinal render` reads: a module whose TRACKS lists the soundtrack, each
// `{ id, spec, loop?: [first, end] | null, trim?: boolean, shape?: (score) => void, ...extra }`. Pure.
import type { Score, SongSpec } from '@chordinal/composer';
import type { LoopSections } from './soundtrack.ts';

export interface SoundtrackTrack {
  id: string;
  /** the song spec the composer writes */
  spec: SongSpec;
  /** the sections a looping track repeats, as [first, end) indexes into its form; null plays once */
  loop: LoopSections | null;
  /** the file starts at the loop's start: the sections before it only ring into it */
  trim: boolean;
  /** changes the composed notes before they are played */
  shape: ((score: Score) => void) | null;
  /** every other field: the game's own, copied into the tracks-data file */
  extra: Record<string, unknown>;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
/** a spec is an object whose fields the composer reads (and defaults) itself */
const isSpec = (v: unknown): v is SongSpec => isRecord(v);
const isShape = (v: unknown): v is (score: Score) => void => typeof v === 'function';

/** the tracks of a songs module (what `import()` gave), checked; `file` names it in errors */
export function soundtrackOf(mod: unknown, file: string): SoundtrackTrack[] {
  const tracks = isRecord(mod) ? mod.TRACKS : undefined;
  if (!Array.isArray(tracks)) throw new Error(`${file} exports no TRACKS list`);
  const seen = new Set<string>();
  return tracks.map((t: unknown, i) => {
    if (!isRecord(t)) throw new Error(`${file}: TRACKS[${i}] isn't an object`);
    const { id, spec, loop = null, trim = false, shape = null, ...extra } = t;
    const where = typeof id === 'string' ? `${file}: ${id}` : `${file}: TRACKS[${i}]`;
    if (typeof id !== 'string' || !id) throw new Error(`${where} has no id`);
    if (seen.has(id)) throw new Error(`${where} is listed twice`);
    seen.add(id);
    if (!isSpec(spec)) throw new Error(`${where} has no spec`);
    let sections: LoopSections | null = null;
    if (loop !== null) {
      const pair: unknown[] = Array.isArray(loop) ? loop : [];
      const [first, end] = pair;
      if (
        pair.length !== 2 ||
        typeof first !== 'number' ||
        typeof end !== 'number' ||
        !Number.isInteger(first) ||
        !Number.isInteger(end)
      )
        throw new Error(`${where}: loop is [first, end] section indexes, or null`);
      sections = [first, end];
    }
    if (typeof trim !== 'boolean') throw new Error(`${where}: trim is true or false`);
    if (shape !== null && !isShape(shape)) throw new Error(`${where}: shape is a function of the score`);
    return { id, spec, loop: sections, trim, shape, extra };
  });
}
