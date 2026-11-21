// Everything the desktop app can put on the screen besides its window: dialogs and the Finder. A --headless
// run (automated tests) must never show any of them, even with its window hidden, so in one every call is kept in
// `globalThis.headlessPrompts` (for a test to read) and answered as if cancelled, unless the test queued an answer in
// `globalThis.headlessAnswers` ({ saveDialog: [path…], openDialog: [path…] }); the close guard closes the window.
/**
 * @param {{ headless: boolean, dialog: any, shell: any }} real the electron modules
 */
export function screenCalls({ headless, dialog, shell })
{
    if (!headless) return {
        saveDialog: (win, opts)=> dialog.showSaveDialog(win, opts),
        openDialog: (win, opts)=> dialog.showOpenDialog(win, opts),
        askToClose: (win, opts)=> dialog.showMessageBoxSync(win, opts) === 0,
        openPath: (file)=> shell.openPath(file),
        openExternal: (url)=> shell.openExternal(url),
        showInFolder: (file)=> shell.showItemInFolder(file),
    };
    const g = /** @type {any} */ (globalThis);
    g.headlessPrompts = [];
    g.headlessAnswers = { saveDialog: [], openDialog: [] };
    const keep = (kind, what)=> { g.headlessPrompts.push({ kind, what }); };
    const queued = (kind)=> g.headlessAnswers[kind]?.shift() ?? '';
    return {
        saveDialog: async (win, opts)=> { keep('saveDialog', opts); const file = queued('saveDialog'); return { canceled: !file, filePath: file }; },
        openDialog: async (win, opts)=> { keep('openDialog', opts); const file = queued('openDialog'); return { canceled: !file, filePaths: file ? [file] : [] }; },
        askToClose: (win, opts)=> { keep('askToClose', opts); return true; },
        openPath: async (file)=> { keep('openPath', file); return ''; },
        openExternal: async (url)=> { keep('openExternal', url); },
        showInFolder: (file)=> { keep('showInFolder', file); },
    };
}
