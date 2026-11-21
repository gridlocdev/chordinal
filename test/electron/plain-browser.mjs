// A plain browser for the browser-build test: one hidden window, no preload (so no desktop bridge), no Dock icon, a
// throwaway profile. It loads the URL it is given.
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const url = process.argv.at(-1);
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chordinal-browser-')));
app.whenReady().then(() => {
  app.dock?.hide();
  const win = new BrowserWindow({ show: false, width: 1280, height: 800 });
  win.loadURL(url);
});
app.on('window-all-closed', () => app.quit());
