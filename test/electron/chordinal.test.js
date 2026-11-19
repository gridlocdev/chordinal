// Chordinal's shell, run headless (no window on screen, no dialog): start-up, Save As to a chosen folder, the close
// question, reopening at the next start, and a missing project at start-up (Chordinal PRD §4).
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
// where a headless Chordinal keeps its settings and Documents (electron/shell.js)
const DATA = path.join(os.tmpdir(), 'chordinal-headless'), DOCS = path.join(os.tmpdir(), 'chordinal-headless-documents');

async function until(what, fn)
{
    const deadline = Date.now() + LIMIT_MS;
    while (!await fn())
    {
        assert.ok(Date.now() < deadline, what);
        await new Promise(r => setTimeout(r, 100));
    }
}

async function launch(marker)
{
    const app = await _electron.launch({ executablePath: electronPath, args: [path.join(ROOT, 'electron/chordinal.js'), '--headless'], cwd: ROOT });
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    // if the headless gate ever breaks, a native dialog still stays off the screen: it leaves a marker and answers
    await app.evaluate(({ dialog }, marker)=>
    {
        const fs = process.getBuiltinModule('node:fs');
        dialog.showMessageBoxSync = ()=> { fs.writeFileSync(marker, ''); return 0; };
        dialog.showSaveDialog = async ()=> { fs.writeFileSync(marker, ''); return { canceled: true }; };
        dialog.showOpenDialog = async ()=> { fs.writeFileSync(marker, ''); return { canceled: true, filePaths: [] }; };
    }, marker);
    await page.waitForFunction(()=> document.querySelector('.lane'));
    await until('the menu bar was built', ()=> app.evaluate(({ Menu })=> !!Menu.getApplicationMenu()?.getMenuItemById('saveAs')));
    const click = async (id)=>
    {
        await until(`${id} is in the menu`, ()=> app.evaluate(({ Menu }, id)=> !!Menu.getApplicationMenu()?.getMenuItemById(id)?.enabled, id));
        await app.evaluate(({ Menu }, id)=> Menu.getApplicationMenu().getMenuItemById(id).click(), id);
    };
    return { app, page, proc: app.process(), click };
}

/** closes the window and waits for the app to quit, so the next start finds it gone */
async function quit(run)
{
    const exited = new Promise(r => run.proc.once('exit', ()=> r(true)));
    await run.app.evaluate(({ BrowserWindow })=> BrowserWindow.getAllWindows()[0].close());
    assert.equal(await Promise.race([exited, new Promise(r => setTimeout(()=> r(false), LIMIT_MS))]), true, 'the app quit');
}

test('Chordinal starts on a new project, saves it to a chosen folder, asks before closing, and reopens it next time', { skip: !existsSync(path.join(ROOT, 'dist/chordinal.js')) && 'run just build first', timeout: 90000 }, async ()=>
{
    await fs.rm(DATA, { recursive: true, force: true });
    await fs.rm(DOCS, { recursive: true, force: true });
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'chordinal-'));
    const marker = path.join(tmp, 'dialog-shown'), folder = path.join(tmp, 'Night Drive');
    let run = null;
    try
    {
        // §4.2, §4.3: the first run opens a new project, saying nothing
        run = await launch(marker);
        const { app, page, click } = run;
        assert.equal(await page.title(), 'Untitled — Chordinal');
        assert.deepEqual(await page.$$eval('.track[data-id]', l => l.length), 2, 'a drum track and a Grand Piano track');
        assert.deepEqual(await app.evaluate(()=> globalThis.headlessPrompts), []);

        // §4.8: an unsaved change shows a dot
        await click('newTrack');
        await until('the title has a dot', async ()=> (await page.title()).startsWith('• '));

        // §4.6: the first save asks for a folder, in Documents/Chordinal/ by default, and writes project.json there
        await app.evaluate((x, folder)=> { globalThis.headlessAnswers.saveDialog.push(folder); }, folder);
        await click('save');
        await until('saved', async ()=> await page.title() === 'Night Drive — Chordinal');
        const asked = await app.evaluate(()=> globalThis.headlessPrompts.find(p => p.kind === 'saveDialog').what.defaultPath);
        assert.equal(asked, path.join(DOCS, 'Chordinal', 'Untitled'));
        const saved = JSON.parse(await fs.readFile(path.join(folder, 'project.json'), 'utf8'));
        assert.equal(saved.title, 'Night Drive');
        assert.equal(saved.tracks.length, 3);
        await until('it is in Open Recent', ()=> app.evaluate(({ Menu }, id)=> !!Menu.getApplicationMenu()?.getMenuItemById(id), `recent:${folder}`));

        // §4.7: closing with unsaved changes asks in the window; Don't Save closes without saving
        await click('newTrack');
        await until('the title has a dot', async ()=> (await page.title()).startsWith('• '));
        const exited = new Promise(r => run.proc.once('exit', ()=> r(true)));
        await app.evaluate(({ BrowserWindow })=> BrowserWindow.getAllWindows()[0].close());
        await page.waitForSelector('.dialog.ask');
        assert.equal(await page.textContent('.dialog.ask p'), 'Save changes to “Night Drive”?');
        await page.click('.dialog.ask button.other');
        assert.equal(await Promise.race([exited, new Promise(r => setTimeout(()=> r(false), LIMIT_MS))]), true, 'the app quit');
        assert.equal(JSON.parse(await fs.readFile(path.join(folder, 'project.json'), 'utf8')).tracks.length, 3, 'the change was not saved');

        // §4.1: the next start reopens it
        run = await launch(marker);
        assert.equal(await run.page.title(), 'Night Drive — Chordinal');
        assert.equal(await run.page.$$eval('.track[data-id]', l => l.length), 3);
        await quit(run);

        // §4.2, §4.5: gone at the next start: a new project, and Open Recent greys it out
        await fs.rm(folder, { recursive: true });
        run = await launch(marker);
        assert.equal(await run.page.title(), 'Untitled — Chordinal');
        assert.equal(await run.app.evaluate(({ Menu }, id)=> Menu.getApplicationMenu().getMenuItemById(id)?.enabled, `recent:${folder}`), false);
        await quit(run);
        assert.equal(existsSync(marker), false, 'no native dialog was asked for');
    }
    finally
    {
        if (run && run.proc.exitCode === null) run.proc.kill('SIGKILL');
        await fs.rm(tmp, { recursive: true, force: true });
    }
});

test('the left panel: the channel rack above the browser, a row\'s double-click, B, and the divider', { skip: !existsSync(path.join(ROOT, 'dist/chordinal.js')) && 'run just build first', timeout: 60000 }, async ()=>
{
    await fs.rm(DATA, { recursive: true, force: true });
    await fs.rm(DOCS, { recursive: true, force: true });
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'chordinal-'));
    const marker = path.join(tmp, 'dialog-shown');
    let run = null;
    try
    {
        run = await launch(marker);
        const { page } = run;
        // §6.1: a row per track, in track order
        assert.deepEqual(await page.$$eval('.rack .row .name', l => l.map(x => x.textContent)), ['Drums', 'Grand Piano']);

        // §6.2: double-clicking the drum row makes a pattern at the playhead and opens the step grid
        await page.dblclick('.rack .row:first-child .names');
        await until('the step grid is open', async ()=> await page.textContent('.editor .tabs button.on') === 'Step Grid');

        // §6.4: + Add Drums
        await page.click('.rack .add button:last-child');
        assert.equal(await page.$$eval('.rack .row', l => l.length), 3);

        // §7.1: the tabs
        await page.click('.left .tabs button:nth-child(2)');
        assert.ok((await page.$$eval('.left .browser .item', l => l.map(x => x.textContent))).some(n => n.startsWith('Standard')), 'the kits are listed');
        await page.click('.left .tabs button:nth-child(1)');
        assert.equal(await page.textContent('.left .browser .group'), 'Piano');

        // §5.2: the divider drags, and B hides and shows the panel
        const box = await page.locator('.left .divider').boundingBox();
        const before = (await page.locator('.rack').boundingBox()).height;
        await page.mouse.move(box.x + 20, box.y + 2);
        await page.mouse.down();
        await page.mouse.move(box.x + 20, box.y + 62, { steps: 4 });
        await page.mouse.up();
        assert.equal(Math.round((await page.locator('.rack').boundingBox()).height - before), 60);
        await page.click('.arrange');
        await page.keyboard.press('b');
        await until('the panel is hidden', async ()=> !await page.$('.left'));
        await page.keyboard.press('b');
        await until('the panel is back', async ()=> !!await page.$('.left'));
        await run.app.evaluate(({ BrowserWindow })=> BrowserWindow.getAllWindows()[0].webContents.send('doc:closing'));
        await page.waitForSelector('.dialog.ask');
        await page.click('.dialog.ask button.other');
        await until('the app quit', ()=> run.proc.exitCode !== null);
        assert.equal(existsSync(marker), false, 'no native dialog was asked for');
    }
    finally
    {
        if (run && run.proc.exitCode === null) run.proc.kill('SIGKILL');
        await fs.rm(tmp, { recursive: true, force: true });
    }
});
