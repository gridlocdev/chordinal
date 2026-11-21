import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { settingsFile } from '../../apps/desktop/src/settings-file.mjs';

async function scratch(fn)
{
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'settings-file-'));
    try { await fn(root, path.join(root, 'data', 'save.json')); }
    finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('a first run has no settings, and what is written is read back', ()=> scratch(async (root, file)=>
{
    const settings = settingsFile(file);
    assert.deepEqual(await settings.load(), {});
    settings.write({ a: 1 });
    await settings.write({ a: 2, grid: '1/16' });
    assert.deepEqual(await settingsFile(file).load(), { a: 2, grid: '1/16' });
    assert.deepEqual(await fs.readdir(path.dirname(file)), ['save.json'], 'no temporary file left behind');
}));

test('a settings file that cannot be read is kept aside, not overwritten by the next change', ()=> scratch(async (root, file)=>
{
    await fs.mkdir(path.dirname(file), { recursive: true });
    for (const bad of ['{"library": "fluid', '[1, 2]'])
    {
        await fs.writeFile(file, bad);
        const settings = settingsFile(file);
        const errors = console.error;
        console.error = ()=> {};
        try { assert.deepEqual(await settings.load(), {}); }
        finally { console.error = errors; }
        await settings.write({ fresh: true });
        const names = await fs.readdir(path.dirname(file));
        const aside = names.filter(n => n.startsWith('save.json.bad-'));
        assert.ok(aside.length >= 1);
        assert.ok((await Promise.all(aside.map(n => fs.readFile(path.join(path.dirname(file), n), 'utf8')))).includes(bad), 'the bad file is kept as it was');
        assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { fresh: true });
        await new Promise(r => setTimeout(r, 2));
    }
}));
