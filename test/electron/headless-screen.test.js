import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';
import { _electron } from 'playwright-core';
import { screenCalls } from '../../electron/headless-screen.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLOSE_LIMIT_MS = 15000;

/** a stand-in for electron's dialog and shell that fails the test if anything reaches it */
function forbidden()
{
    const no = (name)=> ()=> assert.fail(`${name} was called in a headless run`);
    return { dialog: { showSaveDialog: no('showSaveDialog'), showOpenDialog: no('showOpenDialog'), showMessageBoxSync: no('showMessageBoxSync') },
        shell: { openPath: no('openPath'), openExternal: no('openExternal'), showItemInFolder: no('showItemInFolder') } };
}

test('a headless run shows no dialog, Finder window or other app, and keeps what it would have shown', async ()=>
{
    const s = screenCalls({ headless: true, ...forbidden() });
    assert.deepEqual(await s.saveDialog(null, { title: 'a' }), { canceled: true, filePath: '' });
    assert.deepEqual(await s.openDialog(null, { title: 'b' }), { canceled: true, filePaths: [] });
    assert.equal(s.askToClose(null, { message: 'Close without saving?' }), true);
    await s.openPath('/x.md');
    await s.openExternal('https://example.com');
    s.showInFolder('/y');
    assert.equal(await s.launch('open', ['-a', 'Chordinal', '/z']), true);
    assert.deepEqual(globalThis.headlessPrompts.map(p => p.kind), ['saveDialog', 'openDialog', 'askToClose', 'openPath', 'openExternal', 'showInFolder', 'launch']);
    assert.deepEqual(globalThis.headlessPrompts.at(-1).what, { command: 'open', args: ['-a', 'Chordinal', '/z'] });
});

test('a headless test can queue what a dialog answers, once', async ()=>
{
    const s = screenCalls({ headless: true, ...forbidden() });
    globalThis.headlessAnswers.saveDialog.push('/tmp/Song');
    globalThis.headlessAnswers.openDialog.push('/tmp/Other/project.json');
    assert.deepEqual(await s.saveDialog(null, {}), { canceled: false, filePath: '/tmp/Song' });
    assert.deepEqual(await s.saveDialog(null, {}), { canceled: true, filePath: '' });
    assert.deepEqual(await s.openDialog(null, {}), { canceled: false, filePaths: ['/tmp/Other/project.json'] });
});

test('closing a project with unsaved changes headless closes without a dialog', { skip: !existsSync(path.join(ROOT, 'dist/app.js')) && 'run just build first' }, async ()=>
{
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'mg-close-'));
    const marker = path.join(tmp, 'dialog-shown');
    const app = await _electron.launch({ executablePath: electronPath, args: [ROOT, '--headless'], cwd: ROOT });
    const proc = app.process();
    try
    {
        const page = await app.firstWindow();
        await page.waitForLoadState('domcontentloaded');
        // if the gate ever breaks, the real dialog is still kept off the screen: it writes a marker and answers "close"
        await app.evaluate(({ dialog }, marker)=>
        {
            dialog.showMessageBoxSync = ()=> { process.getBuiltinModule('node:fs').writeFileSync(marker, ''); return 0; };
        }, marker);
        const dirty = async ()=>
        {
            const deadline = Date.now() + CLOSE_LIMIT_MS;
            while (!await app.evaluate(({ Menu })=> !!Menu.getApplicationMenu()?.getMenuItemById('newTrack')))
            {
                assert.ok(Date.now() < deadline, 'the menu bar was built');
                await new Promise(r => setTimeout(r, 100));
            }
            await app.evaluate(({ Menu })=> Menu.getApplicationMenu().getMenuItemById('newTrack').click());
        };
        await page.waitForFunction(()=> document.querySelector('.lane'));
        await dirty();
        // a reload asks the same question as closing, and leaves the app running to read what it kept
        await page.reload();
        await page.waitForFunction(()=> document.querySelector('.lane'));
        const prompts = await app.evaluate(()=> globalThis.headlessPrompts.map(p => p.what.message ?? p.kind));
        assert.deepEqual(prompts, ['Close without saving?']);
        await dirty();
        const exited = new Promise(r => proc.once('exit', ()=> r(true)));
        await app.evaluate(({ BrowserWindow })=> BrowserWindow.getAllWindows()[0].close());
        assert.equal(await Promise.race([exited, new Promise(r => setTimeout(()=> r(false), CLOSE_LIMIT_MS))]), true, 'the app quit');
        assert.equal(existsSync(marker), false, 'no native dialog was asked for');
    }
    finally
    {
        if (proc.exitCode === null) proc.kill('SIGKILL');
        await rm(tmp, { recursive: true, force: true });
    }
});
