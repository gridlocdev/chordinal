// Which of the app's own dialogs is open, kept apart from the views that draw them so commands can open one without
// importing a view.
import { signal } from '@preact/signals';

/** File → New's dialog is open */
export const newDialog = signal(false);
