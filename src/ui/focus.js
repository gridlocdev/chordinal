// Which part of the window the editing keys (Delete, arrows, Cmd+A) act on: the last one clicked. In the step grid
// ('grid') they act on its clip, as in the arrangement.
import { signal } from '@preact/signals';

export const focus = signal(/** @type {'arrange'|'chords'|'roll'|'grid'} */ ('arrange'));
