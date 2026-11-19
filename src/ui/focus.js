// Which part of the window the editing keys (Delete, arrows, Cmd+A) act on: the last one clicked. In the step grid
// ('grid') they act on its clip, as in the arrangement. While the piano roll has it, the letter keys play the selected
// track's instrument (musical typing) instead of running commands.
import { signal } from '@preact/signals';
import { settings } from './store.js';

export const focus = signal(/** @type {'arrange'|'chords'|'roll'|'grid'} */ ('arrange'));

/** true while the letter keys play notes: the piano roll is showing and was the part last clicked */
export const musicalTyping = ()=> focus.value === 'roll' && settings.value.editorTab === 'roll';
