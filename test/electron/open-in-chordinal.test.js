// Open in Chordinal (Chordinal PRD §9.2), run headless across both apps: Music Generator copies the song's folder into
// Documents/Chordinal/<title>/ (" 2" the second time) and starts Chordinal on it; Chordinal, started on that folder,
// opens it instead of a new project. No window or dialog reaches the screen, and every app started is closed.
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
// where headless runs keep their settings and Documents (electron/shell.js)
const MG_DOCS = path.join(os.tmpdir(), 'music-generator-headless-documents');
const CHORDINAL = [path.join(os.tmpdir(), 'chordinal-headless'), path.join(os.tmpdir(), 'chordinal-headless-documents')];

async function until(what, fn)
{
    const deadline = Date.now() + LIMIT_MS;
    while (!await fn())
    {
        assert.ok(Date.now() < deadline, what);
        await new Promise(r => setTimeout(r, 100));
    }
}

async function launch(args)
{
    const app = await _electron.launch({ executablePath: electronPath, args: [...args.slice(0, 1), '--headless', ...args.slice(1)], cwd: ROOT });
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(()=> document.querySelector('.lane, .song'));
    return { app, page, proc: app.process() };
}

async function quit(run)
{
    assert.deepEqual(await run.app.evaluate(()=> globalThis.headlessPrompts.filter(p => p.kind !== 'launch')), [], 'nothing else was asked for');
    const exited = new Promise(r => run.proc.once('exit', ()=> r(true)));
    await run.app.evaluate(({ BrowserWindow })=> BrowserWindow.getAllWindows()[0].close());
    assert.equal(await Promise.race([exited, new Promise(r => setTimeout(()=> r(false), LIMIT_MS))]), true, 'the app quit');
}

test('Open in Chordinal copies the song into Documents/Chordinal/ and Chordinal opens it', { skip: !existsSync(path.join(ROOT, 'dist/chordinal.js')) && 'run just build first', timeout: 60000 }, async ()=>
{
    await fs.rm(MG_DOCS, { recursive: true, force: true });
    for (const dir of CHORDINAL) await fs.rm(dir, { recursive: true, force: true });
    const runs = [];
    try
    {
        const mg = await launch([ROOT]);
        runs.push(mg);
        await until('the menu bar was built', ()=> mg.app.evaluate(({ Menu })=> !!Menu.getApplicationMenu()?.getMenuItemById('openInChordinal')));
        const title = (await mg.page.title()).replace(/ · Music Generator$/, '');

        // §9.1: the window is the songs, the player and the song; nothing in it edits
        assert.ok(await mg.page.$$eval('.songs .item', l => l.length) > 10, 'the shipped songs are listed');
        assert.equal(await mg.page.textContent('.song h1'), title);
        for (const gone of ['.arrange', '.editor', '.lane', '.transport .rec'])
            assert.equal(await mg.page.$(gone), null, `no ${gone}`);
        for (const id of ['newTrack', 'record', 'undo', 'newFromMelody'])
            assert.equal(await mg.app.evaluate(({ Menu }, id)=> !!Menu.getApplicationMenu().getMenuItemById(id), id), false, `no ${id} in the menu bar`);
        const launches = ()=> mg.app.evaluate(()=> globalThis.headlessPrompts.filter(p => p.kind === 'launch').map(p => p.what));
        const open = async (n)=>
        {
            await mg.app.evaluate(({ Menu })=> Menu.getApplicationMenu().getMenuItemById('openInChordinal').click());
            await until(`Chordinal was started ${n} times`, async ()=> (await launches()).length === n);
            return (await launches())[n - 1];
        };

        // §9.2: saved into Documents/Chordinal/<title>/, and Chordinal started on it
        const first = await open(1);
        const dir = path.join(MG_DOCS, 'Chordinal', title);
        assert.deepEqual(first.args, [path.join(ROOT, 'electron', 'chordinal.js'), dir]);
        assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'project.json'), 'utf8')).title, title);
        // the name is taken the second time; the button does the same as the menu item
        await mg.page.click('.transport button.primary');
        await until('Chordinal was started again', async ()=> (await launches()).length === 2);
        assert.equal((await launches())[1].args[1], `${dir} 2`);
        assert.match(await mg.page.textContent('.transport'), /Opened .* in Chordinal/);
        await quit(mg);

        // Chordinal started on the folder opens it, not a new project
        const ch = await launch([path.join(ROOT, 'electron', 'chordinal.js'), dir]);
        runs.push(ch);
        await until('the song is open', async ()=> await ch.page.title() === `${title} — Chordinal`);
        assert.ok(await ch.page.$$eval('.track[data-id]', l => l.length) > 2);
        await quit(ch);
    }
    finally
    {
        for (const run of runs) if (run.proc.exitCode === null) run.proc.kill('SIGKILL');
        await fs.rm(MG_DOCS, { recursive: true, force: true });
    }
});
