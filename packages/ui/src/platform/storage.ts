// The app's saved settings: one JSON object, kept by the desktop app in a file in its data folder (apps/desktop/src/shell.ts,
// through the desktop bridge, native-bridge.ts), or in the browser's localStorage when the page runs without the desktop
// app. Load once at start; save hands over the whole object.
import { nativeBridge } from './native-bridge.ts';
import type { ChordinalNative } from './native-bridge.ts';

/** the localStorage key the browser build keeps the settings under */
export const SETTINGS_KEY = 'chordinal.settings';

/** the settings kept in the browser's localStorage, for the page without the desktop app */
export function browserStorage(local: Pick<Storage, 'getItem' | 'setItem'>): ChordinalNative['storage'] {
  return {
    async load() {
      const text = local.getItem(SETTINGS_KEY);
      return text === null ? {} : JSON.parse(text);
    },
    async write(all) {
      local.setItem(SETTINGS_KEY, JSON.stringify(all));
    },
  };
}

const backend =
  nativeBridge()?.storage ?? (typeof localStorage === 'undefined' ? undefined : browserStorage(localStorage));

/** the settings' store; with neither the desktop app nor localStorage (Node) it has none, and says so in the console */
const store = () => {
  if (!backend) throw new TypeError('nowhere to keep the settings');
  return backend;
};

export const storage = {
  async load(): Promise<Record<string, unknown>> {
    try {
      const all = await store().load();
      return all !== null && typeof all === 'object' ? { ...all } : {};
    } catch (e) {
      console.warn('could not load settings', e);
      return {};
    }
  },
  save(all: object): Promise<void> | undefined {
    try {
      return store().write(all);
    } catch (e) {
      console.warn('could not save settings', e);
      return undefined;
    }
  },
};
