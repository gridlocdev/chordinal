// The SoundFont libraries on this machine: which are installed, and downloading one. The desktop app checks and
// downloads them (apps/desktop/src/shell.ts, through the desktop bridge, platform/native-bridge.ts).
import { nativeBridge } from './native-bridge.ts';
const backend = nativeBridge()?.soundfonts;
const listeners = new Set<(id: string, loaded: number, total: number) => void>();
backend?.onProgress((id, loaded, total) => listeners.forEach((fn) => fn(id, loaded, total)));

export const soundfonts = {
  /** the ids of the installed libraries, or null when there's no desktop app to ask */
  async installed(): Promise<string[] | null> {
    try {
      return backend ? await backend.installed() : null;
    } catch (e) {
      console.warn('could not list the SoundFonts', e);
      return null;
    }
  },
  /** downloads a library; `progress` hears its bytes so far */
  async download(id: string, progress = (_loaded: number, _total: number): void => {}): Promise<void> {
    const hear = (got: string, loaded: number, total: number) => {
      if (got === id) progress(loaded, total);
    };
    listeners.add(hear);
    try {
      if (!backend) throw new TypeError('no desktop app to download SoundFonts');
      await backend.download(id);
    } finally {
      listeners.delete(hear);
    }
  },
};
