// Chordinal's projects (Chordinal PRD §4): folders anywhere on disk, each named by its path, reached through the
// desktop app (apps/desktop/src/chordinal.ts), which lets the page reach only folders the user picked or has in Open Recent.
import { nativeStore } from '../store/native-store.ts';
import { browserStore } from '../store/browser-store.ts';
import { idbKeyValue } from '../store/idb-keyval.ts';

const backend = /** @type {any} */ (globalThis).projectFolders;

/** a folder's last part, the project's name in menus and messages: '/Users/me/Documents/Chordinal/Night Drive' → 'Night Drive' */
export const folderTitle = (dir)=> String(dir).split(/[\\/]/).filter(Boolean).at(-1) ?? '';

/** the projects' store: the desktop's folders, or the browser's own storage in the web build */
export const projectStore = ()=> backend ? nativeStore(backend) : browserStore(idbKeyValue(), ()=> crypto.randomUUID());

/** Open Recent, the dialogs and the Finder; reading and writing projects goes through projectStore */
export const projectFolders = {
    /** whether the folder still holds a project the page may open */
    exists: (dir)=> backend?.exists(dir) ?? Promise.resolve(false),
    /** a project opened goes to the top of Open Recent */
    used: (dir)=> backend?.used(dir) ?? Promise.resolve(),
    /** @returns {Promise<{ path: string, name: string, exists: boolean }[]>} Open Recent, newest first */
    recent: ()=> backend?.recent() ?? Promise.resolve([]),
    forget: (dir)=> backend?.forget(dir) ?? Promise.resolve(),
    clear: ()=> backend?.clear() ?? Promise.resolve(),
    /** @returns {Promise<{ path: string, name: string }[]>} the projects in Documents/Chordinal/ */
    library: ()=> backend?.library() ?? Promise.resolve([]),
    reveal: (dir)=> backend?.reveal(dir),
    /** @returns {Promise<string>} the folder handed over when Chordinal started (a command-line argument or the Finder), or '' */
    handed: ()=> backend?.handed() ?? Promise.resolve(''),
    /** a folder handed over while Chordinal runs */
    onHandedOver: (fn)=> backend?.onHandedOver(fn),
    /** asks for a project folder or its project.json; resolves to the folder, or '' when cancelled */
    pickOpen: ()=> backend?.pickOpen() ?? Promise.resolve(''),
    /** asks where to save a new folder for the project; resolves to it, or '' when cancelled */
    pickSave: (name)=> backend?.pickSave(name) ?? Promise.resolve(''),
};

/** the window's side of closing: telling it about unsaved changes, hearing it wants to close, and closing */
const win = /** @type {any} */ (globalThis).docWindow;
export const docWindow = {
    dirty: (on)=> win?.dirty(on),
    onClosing: (fn)=> win?.onClosing(fn),
    close: ()=> win?.close(),
};
