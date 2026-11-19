// Chordinal's projects (Chordinal PRD §4): folders anywhere on disk, each named by its path, reached through the
// desktop app (electron/chordinal.js), which lets the page reach only folders the user picked or has in Open Recent.
// Reading, writing and the takes have the same shape as projectFiles, so the document code works on either.
const backend = /** @type {any} */ (globalThis).projectFolders;
const none = ()=> Promise.reject(new Error('project folders need the Chordinal desktop app'));

/** a folder's last part, the project's name in menus and messages: '/Users/me/Documents/Chordinal/Night Drive' → 'Night Drive' */
export const folderTitle = (dir)=> String(dir).split(/[\\/]/).filter(Boolean).at(-1) ?? '';

export const projectFolders = {
    read: (dir)=> backend?.read(dir) ?? none(),
    write: (dir, text)=> backend?.write(dir, text) ?? none(),
    /** @returns {Promise<string[]>} the take files, take-1.wav … */
    takes: (dir)=> backend?.takes(dir) ?? Promise.resolve([]),
    readTake: async (dir, file)=>
    {
        const u = /** @type {Uint8Array} */ (await (backend?.readTake(dir, file) ?? none()));
        return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);
    },
    writeTake: (dir, file, bytes)=> backend?.writeTake(dir, file, new Uint8Array(bytes)) ?? none(),
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
