// What the arrangement's drags carry: an instrument from the browser, or a track's header. Pure, so it's tested in Node.
import type { InstrumentRef } from '../tracks.ts';

export const PRESET = 'application/x-preset',
  TRACK = 'application/x-track';

/** an instrument dragged from the browser: its bank and program, and its name for a new track */
export interface DroppedPreset extends InstrumentRef {
  name: string;
}

/** whether a drag carries this type */
export const carries = (e: { dataTransfer?: Pick<DataTransfer, 'types'> | null }, type: string): boolean =>
  !!e.dataTransfer?.types.includes(type);

/** an instrument as the browser wrote it (JSON of bank, program and name), or null for anything else */
export function readPreset(text: string): DroppedPreset | null {
  let x: unknown;
  try {
    x = JSON.parse(text);
  } catch {
    return null;
  }
  return typeof x === 'object' &&
    x !== null &&
    'bank' in x &&
    typeof x.bank === 'number' &&
    'program' in x &&
    typeof x.program === 'number' &&
    'name' in x &&
    typeof x.name === 'string'
    ? { bank: x.bank, program: x.program, name: x.name }
    : null;
}

/** an instrument for the browser's drag, read back by readPreset */
export const writePreset = ({ bank, program, name }: DroppedPreset): string =>
  JSON.stringify({ bank, program, name });
