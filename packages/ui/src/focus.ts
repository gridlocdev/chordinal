// Which part of the window the editing keys (Delete, arrows, Cmd+A) act on: the last one clicked. In the step grid
// ('grid') they act on its clip, as in the arrangement. While the piano roll has it, the letter keys play the selected
// track's instrument (musical typing) instead of running commands; during a melody take they do so wherever the focus is.
import { effect, signal } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { project, selected, settings } from './store.ts';
import { appDialog, overlay } from './dialogs.ts';

/** the parts of the window the editing keys can act on */
export type FocusPart = 'arrange' | 'roll' | 'grid';

export const focus: Signal<FocusPart> = signal('arrange');

/** true while a melody take is recording: its letter keys play, and are recorded, wherever the focus is */
export const takingKeys: Signal<boolean> = signal(false);

/** true while the letter keys play notes: during a take, or while the piano roll is showing and was the part last clicked */
export const musicalTyping = (): boolean =>
  takingKeys.value || (focus.value === 'roll' && settings.value.editorTab === 'roll');

// ── the keyboard focus follows the state (PRD §5.11) ─────────────────────────────────────────────────────────────────
// Each part marks its root with data-focus-part. The items in it the keys can rest on carry data-focus-item, the current
// one data-current, and only that one is a Tab stop; the piano roll and the step grid are one item each. The ring is
// drawn from these attributes in ui.css, never from the browser's outline.

/** the element the keyboard focus belongs on: the current item of the part the keys act on, if it's showing */
export function focusTarget(): HTMLElement | null {
  const part = document.querySelector<HTMLElement>(`[data-focus-part="${focus.value}"]`);
  if (!part) return null;
  if (part.hasAttribute('data-focus-item')) return part;
  return (
    part.querySelector<HTMLElement>('[data-current]') ?? part.querySelector<HTMLElement>('[data-focus-item]')
  );
}

/** whether the keyboard focus is somewhere the state decides: nowhere, or on a part's item rather than a field or a
 * dialog the person moved it to */
const followable = (el: Element | null): boolean =>
  !el || el === document.body || el.matches('[data-focus-item]') || el.matches('[data-focus-part]');

/** moves the keyboard focus to the item the state names, unless a dialog is open or a field has it */
export function followFocus(): void {
  if (document.querySelector('[role="dialog"]')) return;
  const target = focusTarget();
  if (target && target !== document.activeElement && followable(document.activeElement)) target.focus();
}

/** after a dialog closes: back to the element that had the focus before it, or to the item the state names */
export function restoreFocus(back: Element | null): void {
  if (back instanceof HTMLElement && back.isConnected && back !== document.body) back.focus();
  else followFocus();
}

/**
 * Keeps the keyboard focus on the item the state names: after the selection or the part changes (a click, a command,
 * an undo, a reload) and when the focused element is removed (a row deleted, a dialog closed). Runs after the render
 * that the change causes. Gives back the function that stops it.
 */
export function syncFocus(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(followFocus, 0);
  };
  const stopEffect = effect(() => {
    void [
      focus.value,
      selected.value,
      project.value,
      settings.value.editorTab,
      appDialog.value,
      overlay.value,
    ];
    later();
  });
  // only when the focused element went away (a row deleted, a dialog closed): Tab past the last control leaves the page
  // as usual, and isn't pulled back
  const lost = (e: FocusEvent) => {
    const gone = e.target;
    if (!e.relatedTarget && gone instanceof Node)
      setTimeout(() => {
        if (!gone.isConnected) later();
      }, 0);
  };
  document.addEventListener('focusout', lost);
  return () => {
    stopEffect();
    document.removeEventListener('focusout', lost);
    clearTimeout(timer);
  };
}
