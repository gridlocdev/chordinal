// The browser build on its own (no desktop app): served over HTTP and loaded in a plain, hidden browser window with no
// desktop bridge, the page starts without an error, shows the arrangement, and keeps its settings across a reload.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';
import { _electron } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = path.join(ROOT, 'apps/web/dist');
const built = existsSync(path.join(DIST, 'index.html'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json', '.sf2': 'application/octet-stream' };

/** serves apps/web/dist on 127.0.0.1, on a free port */
async function serve()
{
    const server = http.createServer(async (req, res)=>
    {
        const name = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        const file = path.join(DIST, name === '/' ? 'index.html' : name);
        if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
        try
        {
            const body = await fs.readFile(file);
            res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' }).end(body);
        }
        catch { res.writeHead(404).end(); }
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    return server;
}

test('the browser build starts with no desktop app, and keeps a setting across a reload', { skip: !built && 'run just build first', timeout: 60000 }, async ()=>
{
    const server = await serve();
    const url = `http://127.0.0.1:${server.address().port}/`;
    const app = await _electron.launch({ executablePath: electronPath, args: [path.join(ROOT, 'test/electron/plain-browser.mjs'), url], cwd: ROOT });
    try
    {
        const page = await app.firstWindow();
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        await page.waitForSelector('.lane');
        assert.equal(await page.evaluate(()=> 'chordinalNative' in window), false, 'a plain page, with no desktop bridge');

        const mixer = 'button[role=tab]:text-is("Mixer")';
        assert.equal(await page.getAttribute(mixer, 'aria-selected'), 'false');
        await page.evaluate(()=> [...document.querySelectorAll('button[role=tab]')].find(b => b.textContent === 'Mixer').click());
        await page.waitForFunction(()=> localStorage.getItem('chordinal.settings')?.includes('"editorTab":"mixer"'));

        await page.reload();
        await page.waitForSelector('.lane');
        await page.waitForSelector(`${mixer}[aria-selected=true]`);
        assert.deepEqual(errors, []);
    }
    finally
    {
        const proc = app.process();
        await app.close().catch(()=> {});
        if (proc.exitCode === null) proc.kill('SIGKILL');
        server.close();
    }
});
