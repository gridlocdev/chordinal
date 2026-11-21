// Everything the desktop app can put on the screen besides its window: dialogs and the Finder. A --headless
// run (automated tests) must never show any of them, even with its window hidden, so in one every call is kept in
// `globalThis.headlessPrompts` (for a test to read) and answered as if cancelled, unless the test queued an answer in
// `globalThis.headlessAnswers` ({ saveDialog: [path…], openDialog: [path…] }); the close guard closes the window.
import type {
  BrowserWindow,
  MessageBoxSyncOptions,
  OpenDialogOptions,
  OpenDialogReturnValue,
  SaveDialogOptions,
  SaveDialogReturnValue,
  Shell,
} from 'electron';

export interface ScreenCalls {
  saveDialog(win: BrowserWindow, opts: SaveDialogOptions): Promise<SaveDialogReturnValue>;
  openDialog(win: BrowserWindow, opts: OpenDialogOptions): Promise<OpenDialogReturnValue>;
  /** whether the user chose to close (the first button) */
  askToClose(win: BrowserWindow, opts: MessageBoxSyncOptions): boolean;
  openPath(file: string): Promise<string>;
  openExternal(url: string): Promise<void>;
  showInFolder(file: string): void;
}

type Kind = 'saveDialog' | 'openDialog' | 'askToClose' | 'openPath' | 'openExternal' | 'showInFolder';

/** what a test reads and queues on globalThis in a headless run */
interface HeadlessGlobals {
  headlessPrompts: { kind: Kind; what: unknown }[];
  headlessAnswers: { saveDialog: string[]; openDialog: string[] };
}

export function screenCalls({
  headless,
  dialog,
  shell,
}: {
  headless: boolean;
  dialog: {
    showSaveDialog(win: BrowserWindow, opts: SaveDialogOptions): Promise<SaveDialogReturnValue>;
    showOpenDialog(win: BrowserWindow, opts: OpenDialogOptions): Promise<OpenDialogReturnValue>;
    showMessageBoxSync(win: BrowserWindow, opts: MessageBoxSyncOptions): number;
  };
  shell: Pick<Shell, 'openPath' | 'openExternal' | 'showItemInFolder'>;
}): ScreenCalls {
  if (!headless)
    return {
      saveDialog: (win, opts) => dialog.showSaveDialog(win, opts),
      openDialog: (win, opts) => dialog.showOpenDialog(win, opts),
      askToClose: (win, opts) => dialog.showMessageBoxSync(win, opts) === 0,
      openPath: (file) => shell.openPath(file),
      openExternal: (url) => shell.openExternal(url),
      showInFolder: (file) => shell.showItemInFolder(file),
    };
  const g = globalThis as typeof globalThis & HeadlessGlobals;
  g.headlessPrompts = [];
  g.headlessAnswers = { saveDialog: [], openDialog: [] };
  const keep = (kind: Kind, what: unknown) => {
    g.headlessPrompts.push({ kind, what });
  };
  const queued = (kind: 'saveDialog' | 'openDialog') => g.headlessAnswers[kind]?.shift() ?? '';
  return {
    saveDialog: async (_win, opts) => {
      keep('saveDialog', opts);
      const file = queued('saveDialog');
      return { canceled: !file, filePath: file };
    },
    openDialog: async (_win, opts) => {
      keep('openDialog', opts);
      const file = queued('openDialog');
      return { canceled: !file, filePaths: file ? [file] : [] };
    },
    askToClose: (_win, opts) => {
      keep('askToClose', opts);
      return true;
    },
    openPath: async (file) => {
      keep('openPath', file);
      return '';
    },
    openExternal: async (url) => {
      keep('openExternal', url);
    },
    showInFolder: (file) => {
      keep('showInFolder', file);
    },
  };
}
