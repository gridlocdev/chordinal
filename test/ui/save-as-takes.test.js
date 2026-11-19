// Save As to a new folder brings the project's whistled takes along, so the copy still has the recordings its
// clips were read from.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openProject, saveAs } from '../../src/ui/document.js';
import { setPlace } from '../../src/ui/place.js';
import { status } from '../../src/ui/store.js';
import { emptyProject } from '../../src/daw/project.js';
import { writeProject } from '../../src/daw/project-format.js';

globalThis.requestAnimationFrame ??= ()=> 0;
globalThis.cancelAnimationFrame ??= ()=> {};

// project folders on a pretend disk: each a project.json and its takes
const disk = new Map();
const folder = (name)=> { if (!disk.has(name)) disk.set(name, { text: null, takes: new Map() }); return disk.get(name); };
let next = '';
setPlace({
    files: {
        read: async (name)=> { const t = disk.get(name)?.text; if (t == null) throw new Error('missing'); return t; },
        write: async (name, text)=> { folder(name).text = text; },
        takes: async (name)=> [...(disk.get(name)?.takes.keys() ?? [])],
        readTake: async (name, file)=> folder(name).takes.get(file).slice().buffer,
        writeTake: async (name, file, bytes)=> { folder(name).takes.set(file, new Uint8Array(bytes)); },
    },
    where: (name)=> `“${name}”`,
    chooseName: async ()=> next ? { name: next, title: next } : null,
    saved: ()=> {},
});

test('Save As to a new folder copies the takes, and leaves the old folder as it was', async ()=>
{
    const old = folder('/a/Night Drive');
    old.text = writeProject(emptyProject({ title: 'Night Drive' }));
    old.takes.set('take-1.wav', new Uint8Array([1, 2, 3]));
    old.takes.set('take-2.wav', new Uint8Array([4, 5]));
    assert.equal(await openProject('/a/Night Drive'), true);

    next = '/b/Night Drive 2';
    assert.equal(await saveAs(), true);
    const copy = disk.get('/b/Night Drive 2');
    assert.ok(copy.text);
    assert.deepEqual([...copy.takes.keys()].sort(), ['take-1.wav', 'take-2.wav']);
    assert.deepEqual([...copy.takes.get('take-1.wav')], [1, 2, 3]);
    assert.deepEqual([...old.takes.keys()].sort(), ['take-1.wav', 'take-2.wav']);
    assert.match(status.value, /Saved/);
});

test('a take already in the new folder is not overwritten', async ()=>
{
    const old = folder('/a/Hook');
    old.text = writeProject(emptyProject({ title: 'Hook' }));
    old.takes.set('take-1.wav', new Uint8Array([1]));
    folder('/b/Hook').takes.set('take-1.wav', new Uint8Array([9]));
    await openProject('/a/Hook');
    next = '/b/Hook';
    assert.equal(await saveAs(), true);
    assert.deepEqual([...disk.get('/b/Hook').takes.get('take-1.wav')], [9]);
});
