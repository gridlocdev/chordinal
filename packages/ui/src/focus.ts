// Which part of the window the editing keys (Delete, arrows, Cmd+A) act on: the last one clicked. In the step grid
// ('grid') they act on its clip, as in the arrangement. While the piano roll has it, the letter keys play the selected
// track's instrument (musical typing) instead of running commands; during a melody take they do so wherever the focus is.
import { signal } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { settings } from './store.ts';

/** the parts of the window the editing keys can act on */
export type FocusPart = 'arrange' | 'roll' | 'grid';

export const focus: Signal<FocusPart> = signal('arrange');

/** true while a melody take is recording: its letter keys play, and are recorded, wherever the focus is */
export const takingKeys: Signal<boolean> = signal(false);

/** true while the letter keys play notes: during a take, or while the piano roll is showing and was the part last clicked */
export const musicalTyping = (): boolean =>
  takingKeys.value || (focus.value === 'roll' && settings.value.editorTab === 'roll');
