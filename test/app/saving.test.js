import test from 'node:test';
import assert from 'node:assert/strict';
import { openProject, save, saveAs, edit, watchProjects } from '../../src/app/document.js';
import { asking, answer } from '../../src/app/ask.js';
import { projectName, dirty, project } from '../../src/app/store.js';
import { emptyProject } from '../../src/daw/project.js';
import { writeProject } from '../../src/daw/project-format.js';

// the window's frame calls, which stopping playback uses
globalThis.requestAnimationFrame ??= ()=> 0;
globalThis.cancelAnimationFrame ??= ()=> {};

// projects/ on a pretend disk, behind the same requests the desktop app answers; a write can be held back
const disk = new Map();
const writes = /** @type {string[]} */ ([]);
let slow = 0;
globalThis.fetch = async (url, { method = 'GET', body } = {})=>
{
    const m = /^projects\/([\w-]+)\/project\.json$/.exec(url);
    const reply = (status, text = '')=> ({ ok: status < 300, status, text: async ()=> text, json: async ()=> JSON.parse(text) });
    if (url === 'projects/') return reply(200, JSON.stringify([...disk.keys()].map(name => ({ name, title: name }))));
    if (!m) return reply(404);
    if (method === 'PUT')
    {
        if (slow) { const wait = slow; slow = 0; await new Promise(r => setTimeout(r, wait)); }
        disk.set(m[1], body); writes.push(body);
        return reply(204);
    }
    return disk.has(m[1]) ? reply(200, disk.get(m[1])) : reply(404);
};
const tick = ()=> new Promise(r => setTimeout(r, 0));
const title = (text)=> JSON.parse(text.replace(/\n/g, '')).title;

test('saves land in the order they were made, even when the first is slow', async ()=>
{
    disk.set('song', writeProject(emptyProject({ title: 'A' })));
    assert.equal(await openProject('song'), true);
    edit(p => ({ ...p, title: 'B' }));
    slow = 50;
    const first = save();
    edit(p => ({ ...p, title: 'C' }));
    await Promise.all([first, save()]);
    assert.equal(title(writes.at(-1)), 'C');
    assert.equal(title(disk.get('song')), 'C', 'the slow first save never lands over the newer one');
    assert.equal(dirty.value, false);
});

test('saving over a file changed on disk since it was opened asks first', async ()=>
{
    disk.set('song', writeProject(emptyProject({ title: 'Mine' })));
    await openProject('song');
    edit(p => ({ ...p, title: 'Mine, edited' }));
    disk.set('song', writeProject(emptyProject({ title: 'Theirs' })));
    const done = save();
    for (let i = 0; i < 20 && !asking.value; i++) await tick();
    assert.match(asking.value?.text ?? '', /changed on disk/);
    answer(null);
    await done;
    assert.equal(title(disk.get('song')), 'Theirs', 'cancelled: their file is kept');
    assert.equal(dirty.value, true);
});

test('a Save As that fails keeps the project under its old name', async ()=>
{
    disk.set('old', writeProject(emptyProject({ title: 'Old' })));
    const opened = openProject('old');
    await tick();
    if (asking.value) answer('');     // discard the last test's unsaved change
    assert.equal(await opened, true);
    const real = globalThis.fetch;
    globalThis.fetch = async (url, opts = {})=> opts.method === 'PUT' ? { ok: false, status: 500 } : real(url, opts);
    try
    {
        const done = saveAs();
        for (let i = 0; i < 20 && !asking.value; i++) await tick();
        answer('New Name');
        await done;
        assert.equal(projectName.value, 'old');
    }
    finally { globalThis.fetch = real; }
});

test('an edit made while a changed file is read again is kept, not reloaded over', async ()=>
{
    let changed = ()=> {};
    globalThis.projectFolder = { onChange: (fn)=> { changed = fn; } };
    disk.set('watched', writeProject(emptyProject({ title: 'Watched' })));
    const opened = openProject('watched');
    await tick();
    if (asking.value) answer('');
    await opened;
    watchProjects();
    disk.set('watched', writeProject(emptyProject({ title: 'Regenerated' })));
    const real = globalThis.fetch;
    // the edit lands while the file is being read
    globalThis.fetch = async (url, opts)=> { if (url === 'projects/watched/project.json') edit(p => ({ ...p, title: 'Edited' })); return real(url, opts); };
    try { await changed(); }
    finally { globalThis.fetch = real; }
    assert.equal(project.value.title, 'Edited');
});
