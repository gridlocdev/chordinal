// Chordinal's projects (Chordinal PRD §4): folders anywhere on disk, each named by its path, reached through the
// desktop app (apps/desktop/src/chordinal.ts), which lets the page reach only folders the user picked or has in Open Recent.
import { nativeStore } from '../store/native-store.ts';
import { browserStore } from '../store/browser-store.ts';
import { idbKeyValue } from '../store/idb-keyval.ts';
import type { ProjectStore } from '../store/project-store.ts';
import { nativeBridge } from './native-bridge.ts';
import type { NativeFolder, NativeRecent } from './native-bridge.ts';

const backend = nativeBridge()?.projects;

/** a folder's last part, the project's name in menus and messages: '/Users/me/Documents/Chordinal/Night Drive' → 'Night Drive' */
export const folderTitle = (dir: string): string => String(dir).split(/[\\/]/).filter(Boolean).at(-1) ?? '';

/** the projects' store: the desktop's folders, or the browser's own storage in the web build */
export const projectStore = (): ProjectStore =>
  backend ? nativeStore(backend) : browserStore(idbKeyValue(), () => crypto.randomUUID());

/** whether projects are folders on disk (the desktop app); in the web build they're kept in the browser by name */
export const onDisk: boolean = backend !== undefined;

/** Open Recent, the dialogs and the Finder; reading and writing projects goes through projectStore */
export const projectFolders = {
  /** whether the folder still holds a project the page may open (in the web build: one saved in the browser) */
  exists: (dir: string): Promise<boolean> =>
    backend?.exists(dir) ??
    projectStore()
      .read(dir)
      .then(
        () => true,
        () => false,
      ),
  /** a project opened goes to the top of Open Recent */
  used: (dir: string): Promise<void> => backend?.used(dir) ?? Promise.resolve(),
  /** Open Recent, newest first */
  recent: (): Promise<NativeRecent[]> => backend?.recent() ?? Promise.resolve([]),
  forget: (dir: string): Promise<void> => backend?.forget(dir) ?? Promise.resolve(),
  clear: (): Promise<void> => backend?.clear() ?? Promise.resolve(),
  /** the projects in Documents/Chordinal/ */
  library: (): Promise<NativeFolder[]> => backend?.library() ?? Promise.resolve([]),
  reveal: (dir: string): Promise<void> | undefined => backend?.reveal(dir),
  /** the folder handed over when Chordinal started (a command-line argument or the Finder), or '' */
  handed: (): Promise<string> => backend?.handed() ?? Promise.resolve(''),
  /** a folder handed over while Chordinal runs */
  onHandedOver: (fn: (dir: string) => void): void => backend?.onHandedOver(fn),
  /** asks for a project folder or its project.json; resolves to the folder, or '' when cancelled */
  pickOpen: (): Promise<string> => backend?.pickOpen() ?? Promise.resolve(''),
  /** asks where to save a new folder for the project; resolves to it, or '' when cancelled */
  pickSave: (name: string): Promise<string> => backend?.pickSave(name) ?? Promise.resolve(''),
};

/** the window's side of closing: telling it about unsaved changes, hearing it wants to close, and closing */
const win = nativeBridge()?.window;
export const docWindow = {
  dirty: (on: boolean): void => win?.dirty(on),
  onClosing: (fn: () => void): void => win?.onClosing(fn),
  close: (): void => win?.close(),
};
