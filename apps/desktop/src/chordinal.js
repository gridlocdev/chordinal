// Chordinal's desktop app (the window, the settings, the menus and the SoundFonts are in shell.js). Projects are folders
// anywhere on disk (Chordinal PRD §4), reached through project-folders.mjs: only those the user picked or has in
// Open Recent. New projects are saved in Documents/Chordinal/ unless the user picks somewhere else.
//
// Closing the window or quitting while the project has unsaved changes (§4.7): the page asks its own question, in the
// window ("Save changes to …?"), saves if told to, then tells this side to close.
//
// A project folder handed over when Chordinal starts (on the command line, or by the Finder through macOS's
// open-file) opens instead of the last project; one handed over while it runs opens like
// Open Recent, after the unsaved-changes question.
import './headless-errors.js';   // first: a headless run exits on an uncaught error instead of showing a dialog
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { projectFolders } from './project-folders.mjs';
import { startShell } from './shell.js';

const DEFAULT_FOLDER = ()=> path.join(app.getPath('documents'), 'Chordinal');

/** whether each window's project has unsaved changes, as its page last said */
const dirty = new WeakMap();

/** folders handed over before the page asked for them, and the call that grants one once the folders are loaded */
const handed = process.argv.slice(app.isPackaged ? 1 : 2).filter(a => !a.startsWith('-') && path.isAbsolute(a));
let handOver = null;
// macOS sends it before the app is ready, as well as while it runs
app.on('open-file', (e, file)=> { e.preventDefault(); if (handOver) handOver(file); else handed.push(file); });

startShell({
    name: 'Chordinal',
    id: 'chordinal',
    page: 'index.html',
    askMicrophone: true,
    async setup({ ipcMain, screen })
    {
        const folders = projectFolders({ listFile: path.join(app.getPath('userData'), 'recent.json') });
        await folders.load();
        const win = (e)=> BrowserWindow.fromWebContents(e.sender);

        ipcMain.handle('folders:recent', ()=> folders.recent());
        ipcMain.handle('folders:forget', (e, dir)=> folders.forget(dir));
        ipcMain.handle('folders:clear', ()=> folders.clear());
        ipcMain.handle('folders:exists', (e, dir)=> folders.exists(dir).catch(()=> false));
        ipcMain.handle('folders:read', (e, dir)=> folders.read(dir));
        ipcMain.handle('folders:write', (e, dir, text)=> folders.write(dir, text));
        ipcMain.handle('folders:used', (e, dir)=> folders.used(dir));
        ipcMain.handle('folders:takes', (e, dir)=> folders.takes(dir));
        ipcMain.handle('folders:readTake', (e, dir, file)=> folders.readTake(dir, file));
        ipcMain.handle('folders:writeTake', (e, dir, file, bytes)=> folders.writeTake(dir, file, bytes));
        ipcMain.handle('folders:library', ()=> folders.listIn(DEFAULT_FOLDER()));
        // the folder handed over at launch, granted, once
        ipcMain.handle('folders:handed', ()=> { const file = handed.pop(); handed.length = 0; return file ? folders.grant(file) : ''; });
        handOver = (file)=> { BrowserWindow.getAllWindows()[0]?.webContents.send('folders:handedOver', folders.grant(file)); };
        ipcMain.handle('folders:reveal', (e, dir)=> { screen.showInFolder(folders.fileToShow(dir)); });
        // Open…: a project folder, or its project.json
        ipcMain.handle('folders:pickOpen', async (e)=>
        {
            const { canceled, filePaths } = await screen.openDialog(win(e), { title: 'Open a project', buttonLabel: 'Open',
                defaultPath: DEFAULT_FOLDER(), properties: ['openDirectory', 'openFile'], filters: [{ name: 'Chordinal project', extensions: ['json'] }] });
            return canceled || !filePaths[0] ? '' : folders.grant(filePaths[0]);
        });
        // Save As…: a new folder, named after the project, in Documents/Chordinal/ unless the user picks somewhere else
        ipcMain.handle('folders:pickSave', async (e, name)=>
        {
            await fs.mkdir(DEFAULT_FOLDER(), { recursive: true }).catch(()=> {});
            const { canceled, filePath } = await screen.saveDialog(win(e), { title: 'Save the project', buttonLabel: 'Save',
                defaultPath: path.join(DEFAULT_FOLDER(), path.basename(String(name)) || 'Untitled') });
            return canceled || !filePath ? '' : folders.grant(filePath);
        });

        ipcMain.on('doc:dirty', (e, on)=>
        {
            const w = win(e);
            if (!w) return;
            dirty.set(w, !!on);
            if (process.platform === 'darwin') w.setDocumentEdited(!!on);
        });
        // the page answered the close question (or there was nothing to ask): close for good
        ipcMain.on('doc:close', (e)=> { win(e)?.destroy(); });
    },
    window(shell, win)
    {
        win.on('close', (e)=>
        {
            if (!dirty.get(win)) return;
            e.preventDefault();
            win.webContents.send('doc:closing');
        });
    },
});
