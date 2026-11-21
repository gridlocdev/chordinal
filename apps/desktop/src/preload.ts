// Gives the page a file-backed settings store (packages/ui/src/platform/storage.js), the native menus, a save dialog and the
// Finder (packages/ui/src/platform/app-menu.js), and the project folders (packages/ui/src/platform/project-folders.js). Nothing else is exposed.
// Bundled into dist/preload.cjs (tools/build.mjs): a sandboxed preload is CommonJS and can't load other files.
import { contextBridge, ipcRenderer } from 'electron';

type Progress = (id: string, loaded: number, total: number) => void;

contextBridge.exposeInMainWorld('appStorage', {
  load: () => ipcRenderer.invoke('save:load'),
  write: (all: unknown) => ipcRenderer.invoke('save:write', all),
});

// the SoundFont libraries: which are installed, and downloading one
const progress = new Set<Progress>();
ipcRenderer.on('soundfonts:progress', (_e, id: string, loaded: number, total: number) =>
  progress.forEach((fn) => fn(id, loaded, total)),
);
contextBridge.exposeInMainWorld('soundfonts', {
  installed: () => ipcRenderer.invoke('soundfonts:installed'),
  download: (id: string) => ipcRenderer.invoke('soundfonts:download', id),
  onProgress: (fn: Progress) => {
    progress.add(fn);
  },
});
contextBridge.exposeInMainWorld('appMenu', {
  setBar: (menus: unknown) => ipcRenderer.send('menu:bar', menus),
  popup: (items: unknown) => ipcRenderer.send('menu:popup', items),
  typing: (on: boolean) => ipcRenderer.send('menu:typing', on),
  onPick: (fn: (id: string) => void) => {
    ipcRenderer.on('menu:pick', (_e, id: string) => fn(id));
  },
  open: (rel: string) => ipcRenderer.invoke('shell:open', rel),
  openFile: (title: string, extensions: string[]) => ipcRenderer.invoke('file:open', title, extensions),
  saveFile: (name: string, bytes: Uint8Array) => ipcRenderer.invoke('file:save', name, bytes),
  chooseFolder: (name: string) => ipcRenderer.invoke('file:chooseFolder', name),
  writeInFolder: (name: string, bytes: Uint8Array) => ipcRenderer.invoke('file:writeInFolder', name, bytes),
});

// projects in folders anywhere on disk, and the window's close question
contextBridge.exposeInMainWorld('projectFolders', {
  recent: () => ipcRenderer.invoke('folders:recent'),
  forget: (dir: string) => ipcRenderer.invoke('folders:forget', dir),
  clear: () => ipcRenderer.invoke('folders:clear'),
  exists: (dir: string) => ipcRenderer.invoke('folders:exists', dir),
  read: (dir: string) => ipcRenderer.invoke('folders:read', dir),
  write: (dir: string, text: string, expected: string | null) =>
    ipcRenderer.invoke('folders:write', dir, text, expected),
  used: (dir: string) => ipcRenderer.invoke('folders:used', dir),
  takes: (dir: string) => ipcRenderer.invoke('folders:takes', dir),
  readTake: (dir: string, file: string) => ipcRenderer.invoke('folders:readTake', dir, file),
  writeTake: (dir: string, file: string, bytes: Uint8Array) =>
    ipcRenderer.invoke('folders:writeTake', dir, file, bytes),
  library: () => ipcRenderer.invoke('folders:library'),
  handed: () => ipcRenderer.invoke('folders:handed'),
  onHandedOver: (fn: (dir: string) => void) => {
    ipcRenderer.on('folders:handedOver', (_e, dir: string) => fn(dir));
  },
  reveal: (dir: string) => ipcRenderer.invoke('folders:reveal', dir),
  pickOpen: () => ipcRenderer.invoke('folders:pickOpen'),
  pickSave: (name: string) => ipcRenderer.invoke('folders:pickSave', name),
});
contextBridge.exposeInMainWorld('docWindow', {
  dirty: (on: boolean) => ipcRenderer.send('doc:dirty', on),
  onClosing: (fn: () => void) => {
    ipcRenderer.on('doc:closing', () => fn());
  },
  close: () => ipcRenderer.send('doc:close'),
});
