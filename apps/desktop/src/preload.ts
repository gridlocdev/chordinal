// Gives the page its one bridge, `window.chordinalNative` (its interface is packages/ui/src/platform/native-bridge.ts):
// the settings file, the SoundFont libraries, the native menus and file dialogs, the project folders and the window's
// close question. Nothing else is exposed.
// Bundled into dist/preload.cjs (tools/build.mjs): a sandboxed preload is CommonJS and can't load other files.
import { contextBridge, ipcRenderer } from 'electron';
import type { ChordinalNative } from '@chordinal/ui/native-bridge';

type Progress = (id: string, loaded: number, total: number) => void;
const progress = new Set<Progress>();
ipcRenderer.on('soundfonts:progress', (_e, id: string, loaded: number, total: number) =>
  progress.forEach((fn) => fn(id, loaded, total)),
);

/** how the window is framed, from the main process (shell.ts): 'unified' on macOS, where the page's top row is the title bar */
const chrome = process.argv.includes('--chordinal-chrome=unified') ? 'unified' : 'native';

const bridge: ChordinalNative = {
  storage: {
    load: () => ipcRenderer.invoke('save:load'),
    write: (all) => ipcRenderer.invoke('save:write', all),
  },
  soundfonts: {
    installed: () => ipcRenderer.invoke('soundfonts:installed'),
    download: (id) => ipcRenderer.invoke('soundfonts:download', id),
    onProgress: (fn) => {
      progress.add(fn);
    },
  },
  menu: {
    setBar: (menus) => ipcRenderer.send('menu:bar', menus),
    popup: (items) => ipcRenderer.send('menu:popup', items),
    typing: (on) => ipcRenderer.send('menu:typing', on),
    onPick: (fn) => {
      ipcRenderer.on('menu:pick', (_e, id: string) => fn(id));
    },
    open: (rel) => ipcRenderer.invoke('shell:open', rel),
    openFile: (title, extensions) => ipcRenderer.invoke('file:open', title, extensions),
    saveFile: (name, bytes) => ipcRenderer.invoke('file:save', name, bytes),
    chooseFolder: (name) => ipcRenderer.invoke('file:chooseFolder', name),
    writeInFolder: (name, bytes) => ipcRenderer.invoke('file:writeInFolder', name, bytes),
  },
  projects: {
    recent: () => ipcRenderer.invoke('folders:recent'),
    forget: (dir) => ipcRenderer.invoke('folders:forget', dir),
    clear: () => ipcRenderer.invoke('folders:clear'),
    exists: (dir) => ipcRenderer.invoke('folders:exists', dir),
    read: (dir) => ipcRenderer.invoke('folders:read', dir),
    write: (dir, text, expected) => ipcRenderer.invoke('folders:write', dir, text, expected),
    used: (dir) => ipcRenderer.invoke('folders:used', dir),
    takes: (dir) => ipcRenderer.invoke('folders:takes', dir),
    readTake: (dir, file) => ipcRenderer.invoke('folders:readTake', dir, file),
    writeTake: (dir, file, bytes) => ipcRenderer.invoke('folders:writeTake', dir, file, bytes),
    library: () => ipcRenderer.invoke('folders:library'),
    handed: () => ipcRenderer.invoke('folders:handed'),
    onHandedOver: (fn) => {
      ipcRenderer.on('folders:handedOver', (_e, dir: string) => fn(dir));
    },
    reveal: (dir) => ipcRenderer.invoke('folders:reveal', dir),
    pickOpen: () => ipcRenderer.invoke('folders:pickOpen'),
    pickSave: (name) => ipcRenderer.invoke('folders:pickSave', name),
  },
  window: {
    dirty: (on) => ipcRenderer.send('doc:dirty', on),
    onClosing: (fn) => {
      ipcRenderer.on('doc:closing', () => fn());
    },
    close: () => ipcRenderer.send('doc:close'),
    chrome,
    onFullScreen: (fn) => {
      ipcRenderer.on('window:fullScreen', (_e, full: boolean) => fn(full));
    },
  },
};

contextBridge.exposeInMainWorld('chordinalNative', bridge);
