// The app's saved settings: one JSON object, kept by the desktop app in a file in its data folder (apps/desktop/src/shell.ts,
// through the desktop bridge, native-bridge.ts). Load once at start; save hands over the whole object.
import { nativeBridge } from './native-bridge.ts';
const backend = nativeBridge()?.storage;

/** the settings' store; without the desktop app it has none, and says so in the console */
const store = () => {
  if (!backend) throw new TypeError('no desktop app to keep the settings');
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
