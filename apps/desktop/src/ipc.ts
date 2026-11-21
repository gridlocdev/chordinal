// The main process's IPC, open only to the app's own page: a message from any other frame (an origin the window was
// never meant to load) is refused before its handler runs.
import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron';

export const ORIGIN = 'app://game';

/** whether a message came from the app's own page */
export const fromPage = (e: IpcMainEvent | IpcMainInvokeEvent): boolean =>
  e.senderFrame?.url.startsWith(ORIGIN + '/') ?? false;

export interface Ipc {
  handle<A extends unknown[]>(channel: string, fn: (e: IpcMainInvokeEvent, ...args: A) => unknown): void;
  on<A extends unknown[]>(channel: string, fn: (e: IpcMainEvent, ...args: A) => void): void;
}

export function pageIpc(ipcMain: IpcMain): Ipc {
  return {
    // the arguments are whatever the page sent: each handler takes them as `unknown` or checks them itself
    handle<A extends unknown[]>(channel: string, fn: (e: IpcMainInvokeEvent, ...args: A) => unknown) {
      ipcMain.handle(channel, (e, ...args: unknown[]) => {
        if (!fromPage(e)) throw new Error(`${channel}: not from the app's page`);
        return fn(e, ...(args as A));
      });
    },
    on<A extends unknown[]>(channel: string, fn: (e: IpcMainEvent, ...args: A) => void) {
      ipcMain.on(channel, (e, ...args: unknown[]) => {
        if (fromPage(e)) fn(e, ...(args as A));
      });
    },
  };
}
