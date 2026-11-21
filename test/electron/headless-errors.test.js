// The app's main process, run headless: an error nothing caught exits the app with code 1 and says why on stderr,
// instead of putting Electron's error dialog on the screen; and closing the window while the settings are being
// written finishes the write, then quits. The export tool's windowless Electron exits the same way, with no flag.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';
import { _electron } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LIMIT_MS = 15000;
const APPS = [
    { id: 'chordinal', entry: 'apps/desktop/dist/chordinal.js', ready: '.lane' },
];
const PROFILE = path.join(os.tmpdir(), `chordinal-test-${process.pid}`);
const built = existsSync(path.join(ROOT, 'apps/web/dist/chordinal.js'));

async function launch({ entry, ready })
{
    const app = await _electron.launch({ executablePath: electronPath, args: [path.join(ROOT, entry), '--headless', `--profile=${PROFILE}`], cwd: ROOT });
    const proc = app.process();
    let stderr = '';
    proc.stderr.on('data', (d)=> { stderr += d; });
    const exited = new Promise(r => proc.once('exit', (code)=> r(code)));
    const page = await app.firstWindow();
    await page.waitForSelector(ready);
    return { app, page, proc, exited, stderr: ()=> stderr };
}

/** the exit code, or 'still running' after the limit */
const exitOf = (run)=> Promise.race([run.exited, new Promise(r => setTimeout(()=> r('still running'), LIMIT_MS))]);

for (const config of APPS)
{
    for (const [kind, throwIt] of [
        ['an uncaught exception', ()=> { setTimeout(()=> { throw new Error('boom from the test'); }); }],
        ['an unhandled rejection', ()=> { Promise.reject(new Error('boom from the test')); }],
    ])
    {
        test(`${config.id}: ${kind} in the headless main process exits with code 1 and no dialog`, { skip: !built && 'run just build first', timeout: 60000 }, async ()=>
        {
            const run = await launch(config);
            try
            {
                await run.app.evaluate(throwIt).catch(()=> {});
                assert.equal(await exitOf(run), 1);
                assert.match(run.stderr(), /boom from the test/);
            }
            finally { if (run.proc.exitCode === null) run.proc.kill('SIGKILL'); }
        });
    }

    test(`${config.id}: closing the window while the settings are written finishes the write and quits`, { skip: !built && 'run just build first', timeout: 60000 }, async ()=>
    {
        const run = await launch(config);
        try
        {
            const mark = `closed-during-save-${Date.now()}`;
            await run.page.evaluate((mark)=> { window.chordinalNative.storage.write({ mark }); }, mark);
            await run.app.evaluate(({ BrowserWindow })=> BrowserWindow.getAllWindows()[0].close());
            assert.equal(await exitOf(run), 0, run.stderr());
            const saved = JSON.parse(await fs.readFile(path.join(PROFILE, 'data', 'save.json'), 'utf8'));
            assert.equal(saved.mark, mark);
        }
        finally { if (run.proc.exitCode === null) run.proc.kill('SIGKILL'); }
    });
}

for (const [kind, throwIt] of [
    ['an uncaught exception', ()=> { setTimeout(()=> { throw new Error('boom from the test'); }); }],
    ['an unhandled rejection', ()=> { Promise.reject(new Error('boom from the test')); }],
])
{
    test(`the CLI's render browser: ${kind} exits with code 1 and no dialog`, { timeout: 60000 }, async ()=>
    {
        const app = await _electron.launch({ executablePath: electronPath, args: [path.join(ROOT, 'apps/cli/dist/electron.mjs'), 'about:blank'], cwd: ROOT });
        const proc = app.process();
        let stderr = '';
        proc.stderr.on('data', (d)=> { stderr += d; });
        const run = { exited: new Promise(r => proc.once('exit', (code)=> r(code))) };
        try
        {
            await app.firstWindow();
            await app.evaluate(throwIt).catch(()=> {});
            assert.equal(await exitOf(run), 1);
            assert.match(stderr, /boom from the test/);
        }
        finally { if (proc.exitCode === null) proc.kill('SIGKILL'); }
    });
}
