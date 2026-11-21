// The desktop app's project store: folders on disk, through the bridge its preload gives the page
// (apps/desktop/src/preload.ts, window.projectFolders). The main process checks the version tokens, so two windows or
// another app can't slip a change in between the check and the write; its CONFLICT errors become ConflictErrors here.
import { ConflictError } from './project-store.ts';
import type { ProjectStore, Stored, Version } from './project-store.ts';

/** the part of window.projectFolders the store uses */
export interface FoldersBridge {
  read(dir: string): Promise<Stored>;
  write(dir: string, text: string, expected: Version | null): Promise<Version>;
  takes(dir: string): Promise<string[]>;
  readTake(dir: string, file: string): Promise<Uint8Array>;
  writeTake(dir: string, file: string, bytes: Uint8Array): Promise<void>;
}

/** an error from the main process arrives as "Error invoking remote method '…': Error: CONFLICT: …" */
const isConflict = (e: unknown) => e instanceof Error && /\bCONFLICT\b/.test(e.message);

export function nativeStore(bridge: FoldersBridge): ProjectStore {
  return {
    read: (dir) => bridge.read(dir),
    async write(dir, text, expected) {
      try {
        return await bridge.write(dir, text, expected);
      } catch (e) {
        if (isConflict(e))
          throw new ConflictError(`${dir} changed on disk since it was opened`, { cause: e });
        throw e;
      }
    },
    takes: (dir) => bridge.takes(dir),
    async readTake(dir, file) {
      const u = await bridge.readTake(dir, file);
      return u.slice().buffer;
    },
    writeTake: (dir, file, bytes) => bridge.writeTake(dir, file, new Uint8Array(bytes)),
  };
}
