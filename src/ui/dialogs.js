// Which of the app's own dialogs is open, kept apart from the views that draw them so commands can open one without
// importing a view.
import { signal } from '@preact/signals';

/** a dialog of the app's own is open (Generate Part…): the shortcuts wait, as for the others */
export const appDialog = signal(false);
