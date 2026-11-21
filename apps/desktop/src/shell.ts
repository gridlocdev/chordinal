// The desktop app's window and what it serves (Chordinal PRD §3.1): one window running the page built into apps/web/dist/, served over
// app://game/ instead of file://, so modules and the mic's worklet load. It may use the microphone without asking each
// time (macOS asks once, for the app), and the settings are kept in a file in the app's data folder, which is the
// app's own. The SoundFonts are those in soundfonts/ when run from this checkout; installed from a release build, the
// ones that came with the app and those downloaded into its data folder. With --dev the window reloads whenever the page
// is rebuilt. The entry (chordinal.ts) says what is its own: its name, its page, where its projects are.
//
// This runs bundled, as dist/chordinal.js (tools/build.mjs): ROOT is the folder above it either way.
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  session,
  shell,
  systemPreferences,
} from 'electron';
import fs from 'node:fs/promises';
import { watch } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LIBRARIES } from '@chordinal/audio';
import { downloadLibrary } from './soundfont-download.ts';
import { settingsFile } from './settings-file.ts';
import { installMenus } from './menus.ts';
import { screenCalls } from './headless-screen.ts';
import type { ScreenCalls } from './headless-screen.ts';
import { ORIGIN, pageIpc } from './ipc.ts';
import type { Ipc } from './ipc.ts';

/** apps/desktop, or the packaged app's folder */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** the checkout, when run from it */
const REPO = path.resolve(ROOT, '../..');

/** the file at `rel` inside `base`, or null when `rel` would leave it */
export const within = (base: string, rel: unknown): string | null => {
  const file = path.resolve(base, String(rel));
  return file.startsWith(base + path.sep) ? file : null;
};
export const exists = (file: string): Promise<boolean> =>
  fs.access(file).then(
    () => true,
    () => false,
  );

/** what an app's entry hands its hooks */
export interface Shell {
  headless: boolean;
  packaged: boolean;
  /** dialogs and the Finder, kept off the screen headless */
  screen: ScreenCalls;
  /** IPC open only to the app's own page */
  ipc: Ipc;
}

export interface AppConfig {
  /** the app's name, which names its data folder */
  name: string;
  /** a short name for the headless run's folders */
  id: string;
  /** the page it loads, at the root of the built page's folder */
  page: string;
  /** asks for the microphone at start-up (macOS) */
  askMicrophone?: boolean;
  /** its own IPC, before the window opens */
  setup?: (shell: Shell) => Promise<void> | void;
  /** its own handling of the window */
  window?: (shell: Shell, win: BrowserWindow) => void;
}

export function startShell(config: AppConfig): void {
  // --headless: for automated tests: no window on screen, no Dock icon, no sound, no microphone prompt, and settings
  // kept apart from the real ones
  const HEADLESS = process.argv.includes('--headless');
  app.setName(config.name);
  if (HEADLESS) {
    app.setPath('userData', path.join(os.tmpdir(), `${config.id}-headless`));
    app.setPath('documents', path.join(os.tmpdir(), `${config.id}-headless-documents`));
  }
  const SAVE_FILE = () => path.join(app.getPath('userData'), 'save.json');
  const PACKAGED = app.isPackaged;
  /** the SoundFont folders, searched in order: the ones that came with the app, then the ones downloaded (the last) */
  const FONT_DIRS = (): [string, ...string[]] =>
    PACKAGED
      ? [path.join(process.resourcesPath, 'soundfonts'), path.join(app.getPath('userData'), 'soundfonts')]
      : [path.join(REPO, 'soundfonts')];
  /** the built page (apps/web/dist/), and the folder holding README.md and docs/ */
  const WEB = PACKAGED ? path.join(process.resourcesPath, 'web') : path.join(REPO, 'apps/web/dist');
  const DOCS = PACKAGED ? process.resourcesPath : REPO;
  const ipc = pageIpc(ipcMain);

  /** where a url of the page is on disk: a SoundFont, or a file of the built page */
  async function fileOf(url: string): Promise<string | null> {
    const rel = decodeURIComponent(url).replace(/^\/+/, '');
    if (rel.startsWith('soundfonts/')) {
      for (const dir of FONT_DIRS()) {
        const file = within(dir, rel.slice('soundfonts/'.length));
        if (file && (await exists(file))) return file;
      }
      return null;
    }
    return within(WEB, rel);
  }

  // ------------------------------------------------------------ SoundFont libraries
  // the ids of the libraries whose files are all there
  ipc.handle('soundfonts:installed', async () =>
    (
      await Promise.all(
        LIBRARIES.map(async (l) =>
          (await Promise.all(l.files.map((f) => fileOf(f.url)))).every(Boolean) ? l.id : null,
        ),
      )
    ).filter(Boolean),
  );
  // a library downloaded into the last SoundFont folder, its progress sent to the page every percent or so
  ipc.handle('soundfonts:download', async (e, id: unknown) => {
    let sent = -1;
    const folders = FONT_DIRS();
    await downloadLibrary(String(id), folders[folders.length - 1] ?? folders[0], {
      fetch: (url) => net.fetch(url),
      progress: (loaded, total) => {
        const now = Math.floor((100 * loaded) / total);
        if (now !== sent && !e.sender.isDestroyed()) {
          sent = now;
          e.sender.send('soundfonts:progress', String(id), loaded, total);
        }
      },
    });
  });

  protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);

  // ------------------------------------------------------------ settings
  // the page hands over all its settings on every change (settings-file.ts)
  const settings = settingsFile(SAVE_FILE());
  ipc.handle('save:load', () =>
    settings.load().catch((e: unknown) => {
      console.error('could not read the settings', e);
      return {};
    }),
  );
  ipc.handle('save:write', (_e, all: unknown) => settings.write(all));

  // ------------------------------------------------------------ menus, files and the Finder
  installMenus(ipc, { headless: HEADLESS });
  const screen = screenCalls({ headless: HEADLESS, dialog, shell });
  const ctx: Shell = { headless: HEADLESS, packaged: PACKAGED, screen, ipc };
  const windowOf = (e: Electron.IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) throw new Error('no window');
    return win;
  };
  // a doc of the app opens in its own app
  ipc.handle('shell:open', async (_e, rel: unknown) => {
    const file = within(DOCS, rel);
    if (file?.endsWith('.md')) await screen.openPath(file);
  });
  // an exported file goes where the user picks
  ipc.handle('file:save', async (e, name: unknown, bytes: Uint8Array) => {
    const { canceled, filePath } = await screen.saveDialog(windowOf(e), {
      defaultPath: path.join(app.getPath('documents'), path.basename(String(name))),
    });
    if (canceled || !filePath) return '';
    await fs.writeFile(filePath, Buffer.from(bytes));
    return filePath;
  });
  // a file to import: picked by the user, read here, handed to the page as its name and bytes
  ipc.handle('file:open', async (e, title: unknown, extensions: Iterable<unknown>) => {
    const { canceled, filePaths } = await screen.openDialog(windowOf(e), {
      title: String(title),
      properties: ['openFile'],
      filters: [{ name: String(title), extensions: [...extensions].map(String) }],
    });
    const picked = filePaths[0];
    if (canceled || !picked) return null;
    return { name: path.basename(picked), bytes: new Uint8Array(await fs.readFile(picked)) };
  });
  // stems go in a new folder the user names; the page then writes its files into that folder and nowhere else
  let chosenFolder = '';
  ipc.handle('file:chooseFolder', async (e, name: unknown) => {
    const { canceled, filePath } = await screen.saveDialog(windowOf(e), {
      title: 'Export each track into a new folder',
      buttonLabel: 'Export',
      defaultPath: path.join(app.getPath('documents'), path.basename(String(name))),
    });
    if (canceled || !filePath) return '';
    await fs.mkdir(filePath, { recursive: true });
    chosenFolder = filePath;
    return filePath;
  });
  ipc.handle('file:writeInFolder', async (_e, name: unknown, bytes: Uint8Array) => {
    if (!chosenFolder) throw new Error('no folder chosen');
    const file = path.join(chosenFolder, path.basename(String(name)));
    await fs.writeFile(file, Buffer.from(bytes));
    return file;
  });

  // ------------------------------------------------------------ the microphone
  // The app's own page may record audio, and nothing else: no camera, no screen, no other origin.
  function allowMicrophone() {
    const ours = (url: unknown) => typeof url === 'string' && url.startsWith(ORIGIN + '/');
    session.defaultSession.setPermissionRequestHandler((_contents, permission, grant, details) => {
      const media = 'mediaTypes' in details ? (details.mediaTypes ?? []) : [];
      const audioOnly = permission === 'media' && media.every((t) => t === 'audio');
      grant(audioOnly && ours(details.requestingUrl));
    });
    session.defaultSession.setPermissionCheckHandler(
      (_contents, permission, origin, details) =>
        permission === 'media' && details.mediaType !== 'video' && ours(`${origin}/`),
    );
  }

  // ------------------------------------------------------------ window
  function createWindow() {
    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 800,
      minHeight: 500,
      title: app.name,
      icon: path.join(ROOT, 'assets', 'icon', 'icon.png'), // Windows and Linux; the macOS app's comes from its bundle
      backgroundColor: '#18181c', // the page's background, so the window never flashes white
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        preload: path.join(ROOT, 'dist', 'preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: !HEADLESS,
      },
    });
    if (HEADLESS) win.webContents.setAudioMuted(true);
    else win.once('ready-to-show', () => win.show());
    // web links open in the browser, never in the app's window; nothing else (file:, custom schemes) is opened
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) void screen.openExternal(url);
      return { action: 'deny' };
    });
    // the page holds the close (or a reload) while the project has unsaved changes: ask
    win.webContents.on('will-prevent-unload', (e) => {
      if (
        screen.askToClose(win, {
          type: 'warning',
          buttons: ['Close Without Saving', 'Cancel'],
          defaultId: 1,
          cancelId: 1,
          message: 'Close without saving?',
          detail: 'The project has changes that are not saved.',
        })
      )
        e.preventDefault();
    });
    win.webContents.on('will-navigate', (e, url) => {
      if (!url.startsWith(ORIGIN + '/')) e.preventDefault();
    });
    // F11 (and Ctrl+Cmd+F on macOS) toggles fullscreen
    win.webContents.on('before-input-event', (e, input) => {
      if (
        input.type === 'keyDown' &&
        (input.key === 'F11' || (input.key === 'f' && input.control && input.meta))
      ) {
        win.setFullScreen(!win.isFullScreen());
        e.preventDefault();
      }
    });
    config.window?.(ctx, win);
    void win.loadURL(`${ORIGIN}/${config.page}`);
    if (process.argv.includes('--dev')) reloadOnBuild(win);
  }

  // --dev: esbuild rewrites the page on every change; reload once it settles
  function reloadOnBuild(win: BrowserWindow) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const watcher = watch(WEB, () => {
      clearTimeout(timer);
      timer = setTimeout(() => win.webContents.reloadIgnoringCache(), 150);
    });
    win.on('closed', () => watcher.close());
  }

  void app.whenReady().then(async () => {
    await config.setup?.(ctx);
    // files of the app and SoundFonts only
    protocol.handle('app', async (request) => {
      const { pathname } = new URL(request.url);
      const file = await fileOf(pathname);
      if (!file) return new Response('not found', { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
    allowMicrophone();
    // macOS asks once whether the app may use the microphone; the answer is remembered in System Settings
    if (config.askMicrophone && process.platform === 'darwin' && !HEADLESS)
      await systemPreferences.askForMediaAccess('microphone');
    if (HEADLESS) app.dock?.hide();
    createWindow();
    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  });
  // finish any save in progress before quitting
  app.on('window-all-closed', () => {
    void settings.written().finally(() => app.quit());
  });
}
