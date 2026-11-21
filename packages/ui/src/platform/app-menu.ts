// The native menus: the menu bar and right-click menus, built by the desktop app (apps/desktop/src/menus.ts) from plain items
// handed over through the desktop bridge (native-bridge.ts). An item's action stays here; the desktop app sends back its id when it's picked.
//
// An item is '-' (a separator) or { label, run?, accelerator?, shown?, enabled?, checked?, radio?, submenu?, text?,
// field?, role? }: `accelerator` is a shortcut the menu answers itself (Cmd+S); `shown` is one the page answers (Space), only
// written beside the label; `text` ('undo', 'copy', …) does the text field's own edit instead while one has focus;
// `field` leaves the accelerator's key to a text field while one has focus;
// `role` is one of Electron's built-in items. In the menu bar an item's id is its `id`, so tests can click it.
import { nativeBridge } from './native-bridge.ts';
import type { NativeMenuItem } from './native-bridge.ts';
const backend = nativeBridge()?.menu;

/** a menu item as the page builds it: the plain item the desktop app shows, with its action */
export interface MenuItem extends Omit<NativeMenuItem, 'type' | 'submenu'> {
  run?: () => unknown;
  submenu?: MenuEntry[];
}

/** an item, '-' for a separator, or nothing (left out, so a list can hold `cond && item`) */
export type MenuEntry = MenuItem | '-' | false | null | undefined;

/** a file read from the OS's open dialog */
export interface OpenedFile {
  name: string;
  bytes: Uint8Array;
}

let bar = new Map<string, () => unknown>(),
  popped = new Map<string, () => unknown>(),
  next = 0;

/** items as plain objects with ids, their actions kept in `actions` */
function plain(
  items: readonly MenuEntry[],
  actions: Map<string, () => unknown>,
  prefix: string,
): NativeMenuItem[] {
  return items
    .filter((x) => x)
    .map((x): NativeMenuItem => {
      if (!x || x === '-') return { type: 'separator' };
      const { run, submenu, ...rest } = x;
      const id = rest.id ?? `${prefix}${next++}`;
      if (run) actions.set(id, run);
      return { ...rest, id, ...(submenu && { submenu: plain(submenu, actions, prefix) }) };
    });
}

backend?.onPick((id) => (bar.get(id) ?? popped.get(id))?.());

export const appMenu = {
  /** whether there are native menus (the desktop app): without them the page answers the Cmd shortcuts too */
  native: !!backend,
  /** the menu bar: [{ label, submenu: items }] */
  setBar(menus: readonly MenuEntry[]): void {
    const actions = new Map<string, () => unknown>();
    const template = plain(menus, actions, 'bar');
    bar = actions;
    backend?.setBar(template);
  },
  /** a right-click menu at the pointer */
  popup(items: readonly MenuEntry[]): void {
    popped = new Map();
    backend?.popup(plain(items, popped, 'pop'));
  },
  /** whether a text field has focus, so the Edit menu's items act on it */
  typing(on: boolean): void {
    backend?.typing(on);
  },
  /** opens a file of the app (a doc) in its app */
  open: (rel: string): Promise<void> | undefined => backend?.open(rel),
  /** asks for a file with one of `extensions` and reads it; resolves to { name, bytes }, or null when cancelled */
  openFile: (title: string, extensions: string[]): Promise<OpenedFile | null> =>
    backend?.openFile(title, extensions) ?? Promise.resolve(null),
  /** asks where to save a file, and saves it; resolves to the path, or '' when cancelled */
  saveFile: (name: string, bytes: Uint8Array): Promise<string> =>
    backend?.saveFile(name, bytes) ?? Promise.resolve(''),
  /** asks for a new folder to save several files in; resolves to its path, or '' when cancelled */
  chooseFolder: (name: string): Promise<string> => backend?.chooseFolder(name) ?? Promise.resolve(''),
  /** saves a file in the folder chosen last */
  writeInFolder: (name: string, bytes: Uint8Array): Promise<string> | undefined =>
    backend?.writeInFolder(name, bytes),
};
