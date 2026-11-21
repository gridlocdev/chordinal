// The SoundFont libraries on this machine: which are installed, and downloading one. The desktop app checks and
// downloads them (apps/desktop/src/shell.ts, through window.soundfonts from apps/desktop/src/preload.ts).
const backend = /** @type {any} */ (globalThis).soundfonts;
/** @type {Set<(id: string, loaded: number, total: number)=> void>} */
const listeners = new Set();
backend?.onProgress((id, loaded, total)=> listeners.forEach(fn => fn(id, loaded, total)));

export const soundfonts = {
    /** the ids of the installed libraries, or null when there's no desktop app to ask */
    async installed()
    {
        try { return backend ? await backend.installed() : null; }
        catch (e) { console.warn('could not list the SoundFonts', e); return null; }
    },
    /** downloads a library; `progress` hears its bytes so far */
    async download(id, progress = (_loaded, _total)=> {})
    {
        const hear = (got, loaded, total)=> { if (got === id) progress(loaded, total); };
        listeners.add(hear);
        try { await backend.download(id); }
        finally { listeners.delete(hear); }
    },
};
