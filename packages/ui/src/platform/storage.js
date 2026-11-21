// The app's saved settings: one JSON object, kept by the desktop app in a file in its data folder (apps/desktop/src/shell.ts,
// through the desktop bridge, native-bridge.ts). Load once at start; save hands over the whole object.
import { nativeBridge } from './native-bridge.ts';
const backend = nativeBridge()?.storage;

export const storage = {
    /** @returns {Promise<Record<string, any>>} */
    async load()
    {
        try { return (await backend.load()) ?? {}; }
        catch (e) { console.warn('could not load settings', e); return {}; }
    },
    save(all)
    {
        try { return backend.write(all); }
        catch (e) { console.warn('could not save settings', e); }
    },
};
