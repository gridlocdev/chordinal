// Chordinal's desktop app (the window, the settings, the menus and the SoundFonts are in shell.ts). Projects are folders
// anywhere on disk (Chordinal PRD §4), reached through project-folders.ts: only those the user picked or has in
// Open Recent. New projects are saved in Documents/Chordinal/ unless the user picks somewhere else.
//
// Closing the window or quitting while the project has unsaved changes (§4.7): the page asks its own question, in the
// window ("Save changes to …?"), saves if told to, then tells this side to close.
//
// A project folder handed over when Chordinal starts (on the command line, or by the Finder through macOS's
// open-file) opens instead of the last project; one handed over while it runs opens like
// Open Recent, after the unsaved-changes question. A MIDI file handed over the same way (Open With in the Finder) is
// read here and opens as a new project, as File → Import MIDI File does.
import './headless-errors.ts'; // first: a headless run exits on an uncaught error instead of showing a dialog
import { app, BrowserWindow } from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { projectFolders } from './project-folders.ts';
import { startShell } from './shell.ts';

const DEFAULT_FOLDER = () => path.join(app.getPath('documents'), 'Chordinal');

/** whether each window's project has unsaved changes, as its page last said */
const dirty = new WeakMap<BrowserWindow, boolean>();

/** a MIDI file, by its name; anything else handed over is a project folder or its project.json */
const isMidiFile = (file: string) => /\.(mid|midi|smf)$/i.test(file);
const readMidiFile = async (file: string) => ({
  name: path.basename(file),
  bytes: new Uint8Array(await fs.readFile(file)),
});

/** folders and MIDI files handed over before the page asked for them, and the call that opens one once the folders
 * are loaded */
const handed = process.argv
  .slice(app.isPackaged ? 1 : 2)
  .filter((a) => !a.startsWith('-') && path.isAbsolute(a));
let handOver: ((file: string) => void) | null = null;
// macOS sends it before the app is ready, as well as while it runs
app.on('open-file', (e, file) => {
  e.preventDefault();
  if (handOver) handOver(file);
  else handed.push(file);
});

startShell({
  name: 'Chordinal',
  id: 'chordinal',
  page: 'index.html',
  askMicrophone: true,
  async setup({ ipc, screen }) {
    const folders = projectFolders({ listFile: path.join(app.getPath('userData'), 'recent.json') });
    await folders.load();
    const win = (e: IpcMainEvent | IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender);
    const windowOf = (e: IpcMainInvokeEvent) => {
      const w = win(e);
      if (!w) throw new Error('no window');
      return w;
    };

    ipc.handle('folders:recent', () => folders.recent());
    ipc.handle('folders:forget', (_e, dir: unknown) => folders.forget(dir));
    ipc.handle('folders:clear', () => folders.clear());
    ipc.handle('folders:exists', (_e, dir: unknown) => folders.exists(dir).catch(() => false));
    ipc.handle('folders:read', (_e, dir: unknown) => folders.read(dir));
    ipc.handle('folders:write', (_e, dir: unknown, text: unknown, expected: unknown) =>
      folders.write(dir, text, expected),
    );
    ipc.handle('folders:used', (_e, dir: unknown) => folders.used(dir));
    ipc.handle('folders:takes', (_e, dir: unknown) => folders.takes(dir));
    ipc.handle('folders:readTake', (_e, dir: unknown, file: unknown) => folders.readTake(dir, file));
    ipc.handle('folders:writeTake', (_e, dir: unknown, file: unknown, bytes: Uint8Array) =>
      folders.writeTake(dir, file, bytes),
    );
    ipc.handle('folders:samples', (_e, dir: unknown) => folders.samples(dir));
    ipc.handle('folders:readSample', (_e, dir: unknown, file: unknown) => folders.readSample(dir, file));
    ipc.handle('folders:writeSample', (_e, dir: unknown, file: unknown, bytes: Uint8Array) =>
      folders.writeSample(dir, file, bytes),
    );
    ipc.handle('folders:audio', (_e, dir: unknown) => folders.audio(dir));
    ipc.handle('folders:readAudio', (_e, dir: unknown, file: unknown) => folders.readAudio(dir, file));
    ipc.handle('folders:writeAudio', (_e, dir: unknown, file: unknown, bytes: Uint8Array) =>
      folders.writeAudio(dir, file, bytes),
    );
    ipc.handle('folders:library', () => folders.listIn(DEFAULT_FOLDER()));
    // the MIDI file handed over at launch, read, once; the page asks for it before the folder
    ipc.handle('folders:handedMidi', async () => {
      const file = handed.findLast(isMidiFile);
      handed.splice(0, handed.length, ...handed.filter((f) => !isMidiFile(f)));
      return file ? readMidiFile(file) : null;
    });
    // the folder handed over at launch, granted, once
    ipc.handle('folders:handed', () => {
      const file = handed.filter((f) => !isMidiFile(f)).pop();
      handed.length = 0;
      return file ? folders.grant(file) : '';
    });
    handOver = (file) => {
      const page = BrowserWindow.getAllWindows()[0]?.webContents;
      if (!isMidiFile(file)) page?.send('folders:handedOver', folders.grant(file));
      else
        readMidiFile(file).then(
          (midi) => page?.send('folders:midiHandedOver', midi),
          (e: unknown) => console.error(`could not read ${file}`, e),
        );
    };
    ipc.handle('folders:reveal', (_e, dir: unknown) => {
      screen.showInFolder(folders.fileToShow(dir));
    });
    // Open…: a project folder, or its project.json
    ipc.handle('folders:pickOpen', async (e) => {
      const { canceled, filePaths } = await screen.openDialog(windowOf(e), {
        title: 'Open a project',
        buttonLabel: 'Open',
        defaultPath: DEFAULT_FOLDER(),
        properties: ['openDirectory', 'openFile'],
        filters: [{ name: 'Chordinal project', extensions: ['json'] }],
      });
      const picked = filePaths[0];
      return canceled || !picked ? '' : folders.grant(picked);
    });
    // Save As…: a new folder, named after the project, in Documents/Chordinal/ unless the user picks somewhere else
    ipc.handle('folders:pickSave', async (e, name: unknown) => {
      await fs.mkdir(DEFAULT_FOLDER(), { recursive: true }).catch(() => {});
      const { canceled, filePath } = await screen.saveDialog(windowOf(e), {
        title: 'Save the project',
        buttonLabel: 'Save',
        defaultPath: path.join(DEFAULT_FOLDER(), path.basename(String(name)) || 'Untitled'),
      });
      return canceled || !filePath ? '' : folders.grant(filePath);
    });

    ipc.on('doc:dirty', (e, on: unknown) => {
      const w = win(e);
      if (!w) return;
      dirty.set(w, !!on);
      if (process.platform === 'darwin') w.setDocumentEdited(!!on);
    });
    // the page answered the close question (or there was nothing to ask): close for good
    ipc.on('doc:close', (e) => {
      win(e)?.destroy();
    });
  },
  window(_shell, win) {
    win.on('close', (e) => {
      if (!dirty.get(win)) return;
      e.preventDefault();
      win.webContents.send('doc:closing');
    });
  },
});
