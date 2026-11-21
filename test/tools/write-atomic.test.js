import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeAtomic } from '../../apps/desktop/src/write-atomic.mjs';

test('writes of one file at the same moment all succeed, and the file ends whole', async ()=>
{
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'write-atomic-'));
    try
    {
        const file = path.join(root, 'song/project.json');
        const texts = Array.from({ length: 8 }, (_, i)=> JSON.stringify({ save: i, pad: 'x'.repeat(200000) }));
        const results = await Promise.allSettled(texts.map(t => writeAtomic(file, new TextEncoder().encode(t))));
        assert.deepEqual(results.map(r => r.status), texts.map(()=> 'fulfilled'));
        assert.ok(texts.includes(await fs.readFile(file, 'utf8')));
        assert.deepEqual(await fs.readdir(path.join(root, 'song')), ['project.json'], 'no temporary file left behind');
    }
    finally { await fs.rm(root, { recursive: true, force: true }); }
});
