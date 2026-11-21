// The CLI's browser (bundled into dist/electron.mjs): Electron with no window on screen and no Dock icon, muted,
// loading the page whose URL is its last argument. It quits when the page's window closes; the CLI ends it once it's
// done. An error nothing caught exits with code 1 instead of showing Electron's error dialog.
import { app, BrowserWindow } from 'electron';

const fail = (kind: string) => (e: unknown) => {
  process.stderr.write(
    `${kind} in the render browser: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`,
  );
  process.exit(1);
};
process.on('uncaughtException', fail('uncaught exception'));
process.on('unhandledRejection', fail('unhandled rejection'));

app.dock?.hide();
void app.whenReady().then(() => {
  // a hidden window's timers would be throttled, and the render pauses on them
  const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
  win.webContents.setAudioMuted(true);
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error') console.error(e.message);
  });
  void win.loadURL(process.argv.at(-1) ?? 'about:blank');
  win.on('closed', () => app.quit());
});
