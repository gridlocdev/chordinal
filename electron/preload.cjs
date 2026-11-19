// Gives the page a file-backed settings store (src/platform/storage.js), the native menus, a save dialog and the
// Finder (src/platform/app-menu.js), and Chordinal's project folders (src/platform/project-folders.js), whose calls
// only Chordinal answers. Nothing else is exposed.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('projectFolder', {
    onChange: (fn)=> { ipcRenderer.on('projects:changed', ()=> fn()); },
});
contextBridge.exposeInMainWorld('appStorage', {
    load: ()=> ipcRenderer.invoke('save:load'),
    write: (all)=> ipcRenderer.invoke('save:write', all),
});

// the SoundFont libraries: which are installed, and downloading one
const progress = new Set();
ipcRenderer.on('soundfonts:progress', (e, id, loaded, total)=> progress.forEach(fn => fn(id, loaded, total)));
contextBridge.exposeInMainWorld('soundfonts', {
    installed: ()=> ipcRenderer.invoke('soundfonts:installed'),
    download: (id)=> ipcRenderer.invoke('soundfonts:download', id),
    onProgress: (fn)=> { progress.add(fn); },
});
contextBridge.exposeInMainWorld('appMenu', {
    setBar: (menus)=> ipcRenderer.send('menu:bar', menus),
    popup: (items)=> ipcRenderer.send('menu:popup', items),
    typing: (on)=> ipcRenderer.send('menu:typing', on),
    onPick: (fn)=> { ipcRenderer.on('menu:pick', (e, id)=> fn(id)); },
    open: (rel)=> ipcRenderer.invoke('shell:open', rel),
    reveal: (rel)=> ipcRenderer.invoke('shell:reveal', rel),
    openFile: (title, extensions)=> ipcRenderer.invoke('file:open', title, extensions),
    saveFile: (name, bytes)=> ipcRenderer.invoke('file:save', name, bytes),
    chooseFolder: (name)=> ipcRenderer.invoke('file:chooseFolder', name),
    writeInFolder: (name, bytes)=> ipcRenderer.invoke('file:writeInFolder', name, bytes),
});

// Chordinal: projects in folders anywhere on disk, and the window's close question
contextBridge.exposeInMainWorld('projectFolders', {
    recent: ()=> ipcRenderer.invoke('folders:recent'),
    forget: (dir)=> ipcRenderer.invoke('folders:forget', dir),
    clear: ()=> ipcRenderer.invoke('folders:clear'),
    exists: (dir)=> ipcRenderer.invoke('folders:exists', dir),
    read: (dir)=> ipcRenderer.invoke('folders:read', dir),
    write: (dir, text)=> ipcRenderer.invoke('folders:write', dir, text),
    used: (dir)=> ipcRenderer.invoke('folders:used', dir),
    takes: (dir)=> ipcRenderer.invoke('folders:takes', dir),
    readTake: (dir, file)=> ipcRenderer.invoke('folders:readTake', dir, file),
    writeTake: (dir, file, bytes)=> ipcRenderer.invoke('folders:writeTake', dir, file, bytes),
    reveal: (dir)=> ipcRenderer.invoke('folders:reveal', dir),
    pickOpen: ()=> ipcRenderer.invoke('folders:pickOpen'),
    pickSave: (name)=> ipcRenderer.invoke('folders:pickSave', name),
});
contextBridge.exposeInMainWorld('docWindow', {
    dirty: (on)=> ipcRenderer.send('doc:dirty', on),
    onClosing: (fn)=> { ipcRenderer.on('doc:closing', ()=> fn()); },
    close: ()=> ipcRenderer.send('doc:close'),
});
