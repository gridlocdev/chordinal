// Everything the desktop app can put on the screen besides its window: dialogs, the Finder, other apps. A --headless
// run (automated tests) must never show any of them, even with its window hidden, so in one every call is kept in
// `globalThis.headlessPrompts` (for a test to read) and answered as if cancelled; the close guard closes the window.

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
    const keep = (kind, what)=> { g.headlessPrompts.push({ kind, what }); };
    return {
        saveDialog: async (win, opts)=> { keep('saveDialog', opts); return { canceled: true, filePath: '' }; },
        openDialog: async (win, opts)=> { keep('openDialog', opts); return { canceled: true, filePaths: [] }; },
        askToClose: (win, opts)=> { keep('askToClose', opts); return true; },
        openPath: async (file)=> { keep('openPath', file); return ''; },
        openExternal: async (url)=> { keep('openExternal', url); },
        showInFolder: (file)=> { keep('showInFolder', file); },
    };
}
