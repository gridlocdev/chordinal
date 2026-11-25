// The Keyboard Shortcuts window's "press a shortcut" mode: while it's on, every key press is held back from the app and
// shown with the command it runs. Escape always ends it and is never held back, and the listener comes off however
// the mode ends (Escape, the button, the window closing, or an error in the handler), so no key can stay swallowed.
import { eventKey, formatShortcut } from './shortcut.ts';
import type { KeyPress } from './shortcut.ts';
import type { CommandCatalog, Command } from './catalog.ts';

/** a key pressed in the mode: the keys as the app writes them, and the command they run, if any */
export interface FoundKey {
  readonly keys: string;
  readonly command: Command | undefined;
}

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn', 'OS']);

/** what a key press runs, wherever the focus is; null for a modifier pressed on its own */
export function findKey(catalog: CommandCatalog, e: KeyPress): FoundKey | null {
  if (MODIFIERS.has(e.key ?? '')) return null;
  const mac = catalog.mac;
  const keys = formatShortcut(
    {
      key: eventKey(e),
      mod: mac ? e.metaKey : e.ctrlKey,
      ctrl: mac && e.ctrlKey,
      shift: e.shiftKey,
      alt: e.altKey,
    },
    mac,
  );
  return { keys, command: catalog.forEvent(e, { typing: false, native: false }) };
}

/** Escape presses that ended the mode: the window doesn't also close on them */
const endedOn = new WeakSet<Event>();

/** whether this Escape ended the mode, so nothing else should act on it */
export const endedMode = (e: Event): boolean => endedOn.has(e);

/**
 * Starts the mode: key presses on `target` (the window) go to `onKey` and no further, before the app's own listeners
 * see them. Escape calls `onEnd` and goes on as usual. An error in `onKey` ends the mode before it's thrown on. Gives
 * back the function that ends it, which is safe to call more than once.
 */
export function holdKeys(
  target: EventTarget,
  onKey: (e: KeyboardEvent) => void,
  onEnd: () => void,
): () => void {
  let on = true;
  const end = () => {
    if (!on) return;
    on = false;
    target.removeEventListener('keydown', listener, true);
    onEnd();
  };
  function listener(ev: Event): void {
    const e = ev as KeyboardEvent;
    if (e.key === 'Escape') {
      endedOn.add(e);
      end();
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    let handled = false;
    try {
      onKey(e);
      handled = true;
    } finally {
      if (!handled) end();
    }
  }
  target.addEventListener('keydown', listener, true);
  return end;
}
