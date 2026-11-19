import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { projectRequest } from '../../tools/project-files.mjs';

test('saves of one project at the same moment all succeed, and the file ends whole', async ()=>
{
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'project-files-'));
    try
    {
        const texts = Array.from({ length: 8 }, (_, i)=> JSON.stringify({ save: i, pad: 'x'.repeat(200000) }));
        const results = await Promise.allSettled(texts.map(t => projectRequest(root, 'PUT', '/projects/song/project.json', async ()=> new TextEncoder().encode(t))));
        assert.deepEqual(results.map(r => r.status), texts.map(()=> 'fulfilled'));
        assert.ok(texts.includes(await fs.readFile(path.join(root, 'projects/song/project.json'), 'utf8')));
        assert.deepEqual(await fs.readdir(path.join(root, 'projects/song')), ['project.json'], 'no temporary file left behind');
    }
    finally { await fs.rm(root, { recursive: true, force: true }); }
});
