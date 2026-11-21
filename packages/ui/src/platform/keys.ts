// Musical typing: two rows of the computer keyboard play like a piano, as in most DAWs.
// A S D F G H J K L ; ' are white keys, W E  T Y U  O P the black keys between them; Z and X shift the octave.

/** KeyboardEvent.code → semitones above the current octave's C */
export const NOTE_KEYS: Readonly<Record<string, number>> = {
  KeyA: 0,
  KeyW: 1,
  KeyS: 2,
  KeyE: 3,
  KeyD: 4,
  KeyF: 5,
  KeyT: 6,
  KeyG: 7,
  KeyY: 8,
  KeyH: 9,
  KeyU: 10,
  KeyJ: 11,
  KeyK: 12,
  KeyO: 13,
  KeyL: 14,
  KeyP: 15,
  Semicolon: 16,
  Quote: 17,
};
export const OCTAVE_KEYS: Readonly<Record<string, number>> = { KeyZ: -1, KeyX: 1 };

/** true while focus is in a text field, where keys type rather than play */
export function typing(): boolean {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  // checked by tag name, not as an HTMLInputElement: tests stand in a bare HTMLElement for the page's
  return (
    el.tagName === 'INPUT' &&
    !['checkbox', 'radio', 'range', 'button'].includes((el as HTMLInputElement).type)
  );
}
