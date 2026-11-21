// In a headless run (--headless, for automated tests), an error nothing caught in the main process is written to stderr
// and the app exits with code 1, so the test fails loudly. Without this, Electron shows its own "A JavaScript error
// occurred in the main process" dialog on the screen and keeps running. The app's entry imports this module first,
// before anything else runs; the export tool's Electron, which never shows a window, calls exitOnUncaughtErrors itself.

/** from now on, an error nothing caught in this process goes to stderr and exits with code 1, with no dialog */
export function exitOnUncaughtErrors(): void {
  const fail = (kind: string) => (e: unknown) => {
    const text = e instanceof Error ? (e.stack ?? e.message) : String(e);
    process.stderr.write(`${kind} in the main process: ${text}\n`);
    process.exit(1);
  };
  process.on('uncaughtException', fail('uncaught exception'));
  process.on('unhandledRejection', fail('unhandled rejection'));
}

if (process.argv.includes('--headless')) exitOnUncaughtErrors();
