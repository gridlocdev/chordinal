// Which of the app's own dialogs is open, kept apart from the views that draw them so commands can open one without
// importing a view.
import { signal } from '@preact/signals';
import type { Signal } from '@preact/signals';

/** the windows drawn over the app: ⌘K's command menu and the Keyboard Shortcuts window */
export type Overlay = 'commands' | 'shortcuts';

/** a dialog of the app's own is open: the shortcuts wait, as for the others */
export const appDialog: Signal<boolean> = signal(false);

/** ⌘K's command menu or the Keyboard Shortcuts window, drawn over the window; null when neither is */
export const overlay: Signal<Overlay | null> = signal(null);

/** opens one, or closes it if it's open already */
export const toggleOverlay = (which: Overlay): void => {
  overlay.value = overlay.value === which ? null : which;
};
