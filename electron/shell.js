// The desktop app's window and what it serves (Chordinal PRD §3.1): one window running a page built into dist/, served over
// app://game/ instead of file://, so modules and the mic's worklet load. It may use the microphone without asking each
// time (macOS asks once, for the app), and the settings are kept in a file in the app's data folder, which is the
// app's own. The SoundFonts are those in soundfonts/ when run from this checkout; installed from a release build, the
// ones that came with the app and those downloaded into its data folder. With --dev the window reloads whenever dist/
// is rebuilt. The entry (chordinal.js) says what is its own: its name, its page, where its projects are.
import { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell, systemPreferences } from 'electron';
import fs from 'node:fs/promises';
import { watch } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { downloadLibrary } from '../tools/soundfont-download.mjs';
import { settingsFile } from '../tools/settings-file.mjs';
import { LIBRARIES } from '../src/audio/soundfont-catalog-data.js';
import { installMenus } from './menus.js';
import { screenCalls } from './headless-screen.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'app://game';

/** the file at `rel` inside `base`, or null when `rel` would leave it */
export const within = (base, rel)=>
{
    const file = path.resolve(base, String(rel));
    return file.startsWith(base + path.sep) ? file : null;
};
export const exists = (file)=> fs.access(file).then(()=> true, ()=> false);

/**
 * @typedef {object} Shell  what an app's entry hands its hooks
 * @property {boolean} headless
 * @property {boolean} packaged
 * @property {ReturnType<typeof screenCalls>} screen  dialogs and the Finder, kept off the screen headless
 * @property {Electron.IpcMain} ipcMain
 *
 * @typedef {object} AppConfig
 * @property {string} name  the app's name, which names its data folder
 * @property {string} id  a short name for the headless run's folders
 * @property {string} page  the page it loads, at the checkout's root
 * @property {string} icon  the folder in assets/ holding its icon.png, for the window on Windows and Linux
 * @property {boolean} [askMicrophone]  asks for the microphone at start-up (macOS)
 * @property {(shell: Shell)=> Promise<void>|void} [setup]  its own IPC, before the window opens
 * @property {(shell: Shell, win: BrowserWindow)=> void} [window]  its own handling of the window
 */

/** @param {AppConfig} config */
export function startShell(config)
{
    // --headless: for automated tests: no window on screen, no Dock icon, no sound, no microphone prompt, and settings
    // kept apart from the real ones
    const HEADLESS = process.argv.includes('--headless');
    app.setName(config.name);
    if (HEADLESS)
    {
        app.setPath('userData', path.join(os.tmpdir(), `${config.id}-headless`));
        app.setPath('documents', path.join(os.tmpdir(), `${config.id}-headless-documents`));
    }
    const SAVE_FILE = ()=> path.join(app.getPath('userData'), 'save.json');
    const PACKAGED = app.isPackaged;
    /** the SoundFont folders, searched in order: the ones that came with the app, then the ones downloaded (the last) */
    const FONT_DIRS = ()=> PACKAGED ? [path.join(process.resourcesPath, 'soundfonts'), path.join(app.getPath('userData'), 'soundfonts')] : [path.join(ROOT, 'soundfonts')];

    /** where a url of the page (the checkout's root) is on disk: a SoundFont, or a file of the app */
    async function fileOf(url)
    {
        const rel = decodeURIComponent(url).replace(/^\/+/, '');
        if (rel.startsWith('soundfonts/'))
        {
            for (const dir of FONT_DIRS())
            {
                const file = within(dir, rel.slice('soundfonts/'.length));
                if (file && await exists(file)) return file;
            }
            return null;
        }
        return within(ROOT, rel);
    }

    // ------------------------------------------------------------ SoundFont libraries
    // the ids of the libraries whose files are all there
    ipcMain.handle('soundfonts:installed', async ()=>
        (await Promise.all(LIBRARIES.map(async l => (await Promise.all(l.files.map(f => fileOf(f.url)))).every(Boolean) ? l.id : null))).filter(Boolean));
    // a library downloaded into the last SoundFont folder, its progress sent to the page every percent or so
    ipcMain.handle('soundfonts:download', async (e, id)=>
    {
        let sent = -1;
        await downloadLibrary(String(id), FONT_DIRS().at(-1), { fetch: (url)=> net.fetch(url), progress: (loaded, total)=>
        {
            const now = Math.floor(100 * loaded / total);
            if (now !== sent && !e.sender.isDestroyed()) { sent = now; e.sender.send('soundfonts:progress', String(id), loaded, total); }
        } });
    });

    protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

    // ------------------------------------------------------------ settings
    // the page hands over all its settings on every change (tools/settings-file.mjs)
    const settings = settingsFile(SAVE_FILE());
    ipcMain.handle('save:load', ()=> settings.load().catch((e)=> { console.error('could not read the settings', e); return {}; }));
    ipcMain.handle('save:write', (event, all)=> settings.write(all));

    // ------------------------------------------------------------ menus, files and the Finder
    installMenus(ipcMain, { headless: HEADLESS });
    const screen = screenCalls({ headless: HEADLESS, dialog, shell });
    /** @type {Shell} */
    const ctx = { headless: HEADLESS, packaged: PACKAGED, screen, ipcMain };
    // a doc of the app opens in its own app
    ipcMain.handle('shell:open', async (e, rel)=> { const file = within(ROOT, rel); if (file?.endsWith('.md')) await screen.openPath(file); });
    // an exported file goes where the user picks
    ipcMain.handle('file:save', async (e, name, bytes)=>
    {
        const win = BrowserWindow.fromWebContents(e.sender);
        const { canceled, filePath } = await screen.saveDialog(win, { defaultPath: path.join(app.getPath('documents'), path.basename(String(name))) });
        if (canceled || !filePath) return '';
        await fs.writeFile(filePath, Buffer.from(bytes));
        return filePath;
    });
    // a file to import: picked by the user, read here, handed to the page as its name and bytes
    ipcMain.handle('file:open', async (e, title, extensions)=>
    {
        const win = BrowserWindow.fromWebContents(e.sender);
        const { canceled, filePaths } = await screen.openDialog(win, { title: String(title), properties: ['openFile'],
            filters: [{ name: String(title), extensions: [...extensions].map(String) }] });
        if (canceled || !filePaths[0]) return null;
        return { name: path.basename(filePaths[0]), bytes: new Uint8Array(await fs.readFile(filePaths[0])) };
    });
    // stems go in a new folder the user names; the page then writes its files into that folder and nowhere else
    let chosenFolder = '';
    ipcMain.handle('file:chooseFolder', async (e, name)=>
    {
        const win = BrowserWindow.fromWebContents(e.sender);
        const { canceled, filePath } = await screen.saveDialog(win, { title: 'Export each track into a new folder', buttonLabel: 'Export',
            defaultPath: path.join(app.getPath('documents'), path.basename(String(name))) });
        if (canceled || !filePath) return '';
        await fs.mkdir(filePath, { recursive: true });
        chosenFolder = filePath;
        return filePath;
    });
    ipcMain.handle('file:writeInFolder', async (e, name, bytes)=>
    {
        if (!chosenFolder) throw new Error('no folder chosen');
        const file = path.join(chosenFolder, path.basename(String(name)));
        await fs.writeFile(file, Buffer.from(bytes));
        return file;
    });

    // ------------------------------------------------------------ the microphone
    // The app's own page may record audio, and nothing else: no camera, no screen, no other origin.
    function allowMicrophone()
    {
        const ours = (url)=> typeof url === 'string' && url.startsWith(ORIGIN + '/');
        session.defaultSession.setPermissionRequestHandler((contents, permission, grant, details)=>
        {
            const audioOnly = permission === 'media' && (details.mediaTypes ?? []).every(t => t === 'audio');
            grant(audioOnly && ours(details.requestingUrl));
        });
        session.defaultSession.setPermissionCheckHandler((contents, permission, origin, details)=>
            permission === 'media' && details.mediaType !== 'video' && ours(`${origin}/`));
    }

    // ------------------------------------------------------------ window
    function createWindow()
    {
        const win = new BrowserWindow({
            width: 1280, height: 800, minWidth: 800, minHeight: 500,
            title: app.name,
            icon: path.join(ROOT, 'assets', config.icon, 'icon.png'),   // Windows and Linux; the macOS app's comes from its bundle
            backgroundColor: '#18181c',     // the page's background, so the window never flashes white
            autoHideMenuBar: true,
            show: false,
            webPreferences: { preload: path.join(ROOT, 'electron', 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false,
                backgroundThrottling: !HEADLESS },
        });
        if (HEADLESS) win.webContents.setAudioMuted(true);
        else win.once('ready-to-show', ()=> win.show());
        // web links open in the browser, never in the app's window; nothing else (file:, custom schemes) is opened
        win.webContents.setWindowOpenHandler(({ url })=>
        {
            if (/^https?:\/\//i.test(url)) screen.openExternal(url);
            return { action: 'deny' };
        });
        // the page holds the close (or a reload) while the project has unsaved changes: ask
        win.webContents.on('will-prevent-unload', (e)=>
        {
            if (screen.askToClose(win, { type: 'warning', buttons: ['Close Without Saving', 'Cancel'], defaultId: 1, cancelId: 1,
                message: 'Close without saving?', detail: 'The project has changes that are not saved.' })) e.preventDefault();
        });
        win.webContents.on('will-navigate', (e, url)=> { if (!url.startsWith(ORIGIN + '/')) e.preventDefault(); });
        // F11 (and Ctrl+Cmd+F on macOS) toggles fullscreen
        win.webContents.on('before-input-event', (e, input)=>
        {
            if (input.type === 'keyDown' && (input.key === 'F11' || (input.key === 'f' && input.control && input.meta)))
            {
                win.setFullScreen(!win.isFullScreen());
                e.preventDefault();
            }
        });
        config.window?.(ctx, win);
        win.loadURL(`${ORIGIN}/${config.page}`);
        if (process.argv.includes('--dev')) reloadOnBuild(win);
    }

    // --dev: esbuild rewrites dist/ on every change; reload once it settles
    function reloadOnBuild(win)
    {
        let timer = 0;
        const watcher = watch(path.join(ROOT, 'dist'), ()=>
        {
            clearTimeout(timer);
            timer = setTimeout(()=> win.webContents.reloadIgnoringCache(), 150);
        });
        win.on('closed', ()=> watcher.close());
    }

    app.whenReady().then(async ()=>
    {
        await config.setup?.(ctx);
        // files of the app and SoundFonts only
        protocol.handle('app', async (request)=>
        {
            const { pathname } = new URL(request.url);
            const file = await fileOf(pathname);
            if (!file) return new Response('not found', { status: 404 });
            return net.fetch(pathToFileURL(file).toString());
        });
        allowMicrophone();
        // macOS asks once whether the app may use the microphone; the answer is remembered in System Settings
        if (config.askMicrophone && process.platform === 'darwin' && !HEADLESS) await systemPreferences.askForMediaAccess('microphone');
        if (HEADLESS) app.dock?.hide();
        createWindow();
        app.on('activate', ()=> { if (!BrowserWindow.getAllWindows().length) createWindow(); });
    });
    // finish any save in progress before quitting
    app.on('window-all-closed', ()=> { settings.written().finally(()=> app.quit()); });
}
