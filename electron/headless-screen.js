// Everything the desktop app can put on the screen besides its window: dialogs, the Finder, other apps. A --headless
// run (automated tests) must never show any of them, even with its window hidden, so in one every call is kept in
// `globalThis.headlessPrompts` (for a test to read) and answered as if cancelled, unless the test queued an answer in
// `globalThis.headlessAnswers` ({ saveDialog: [path…], openDialog: [path…] }); the close guard closes the window.
// `launch` starts another app (Music Generator's Open in Chordinal); headless it is only kept, and counts as started.
import { spawn } from 'node:child_process';

/** starts `command` on its own; resolves to whether it started, or with `wait`, whether it exited with 0 */
function start(command, args, { wait = false } = {})
{
    return new Promise((resolve)=>
    {
        const child = spawn(command, args, { detached: true, stdio: 'ignore' });
        child.once('error', ()=> resolve(false));
        if (wait) child.once('exit', (code)=> resolve(code === 0));
        else child.once('spawn', ()=> { child.unref(); resolve(true); });
    });
}

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
        launch: start,
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
        launch: async (command, args)=> { keep('launch', { command, args }); return true; },
    };
}
