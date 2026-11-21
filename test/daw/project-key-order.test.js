// Opening a project and saving it unchanged writes the same file (audit: reading put key, markers, loop, groove and
// chords first, so the next save moved them and every project showed a diff).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readProject, writeProject } from '@chordinal/daw';
import { emptyProject } from '@chordinal/daw';

test('a project read and written again is the same text', ()=>
{
    const text = writeProject(emptyProject({ title: 'Round Trip' }));
    assert.equal(writeProject(readProject(text)), text);
    const song = fs.readFileSync(new URL('../../projects/first-light/project.json', import.meta.url), 'utf8');
    assert.equal(writeProject(readProject(song)), song);
});

test('the settings are written in one order, whatever order they were in', ()=>
{
    const p = emptyProject({ title: 'Order' });
    const shuffled = Object.fromEntries(Object.entries(p).reverse());
    shuffled.extra = 1;
    assert.deepEqual(Object.keys(JSON.parse(writeProject(shuffled))),
        ['format', 'version', 'title', 'length', 'tempoMap', 'meters', 'key', 'markers', 'loop', 'groove', 'chords', 'extra', 'tracks']);
});
