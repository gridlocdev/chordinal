import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { projectFolders, folderOf, RECENT_LIMIT } from '../../tools/project-folders.mjs';

async function scratch(fn)
{
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'project-folders-'));
    try { await fn(root, projectFolders({ listFile: path.join(root, 'data', 'recent.json') })); }
    finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('a picked project.json names its folder', ()=>
{
    assert.equal(folderOf('/a/Song/project.json'), '/a/Song');
    assert.equal(folderOf('/a/Song'), '/a/Song');
});

test('a folder the user never picked and that is not recent cannot be read or written', ()=> scratch(async (root, folders)=>
{
    await folders.load();
    const other = path.join(root, 'other');
    await assert.rejects(folders.read(other), /isn't a project this app opened/);
    await assert.rejects(folders.write(other, '{}'), /isn't a project this app opened/);
    await assert.rejects(fs.access(path.join(other, 'project.json')));
}));

test('saving into a picked folder writes project.json whole and puts it at the top of Open Recent, kept across runs', ()=> scratch(async (root, folders)=>
{
    await folders.load();
    const a = folders.grant(path.join(root, 'A')), b = folders.grant(path.join(root, 'B', 'project.json'));
    await folders.write(a, '{"a":1}');
    await folders.write(b, '{"b":1}');
    assert.equal(await folders.read(a), '{"a":1}');
    assert.deepEqual(await fs.readdir(a), ['project.json'], 'no temporary file left behind');
    assert.deepEqual((await folders.recent()).map(r => r.name), ['B', 'A']);
    await folders.used(a);
    const again = projectFolders({ listFile: path.join(root, 'data', 'recent.json') });
    await again.load();
    assert.deepEqual((await again.recent()).map(r => r.name), ['A', 'B']);
    assert.equal(await again.read(b), '{"b":1}', 'a recent project can be opened in the next run');
}));

test('Open Recent keeps the last ten, marks missing ones, and forgets or clears on request', ()=> scratch(async (root, folders)=>
{
    await folders.load();
    for (let i = 0; i < RECENT_LIMIT + 2; i++) await folders.write(folders.grant(path.join(root, `S${i}`)), '{}');
    let list = await folders.recent();
    assert.equal(list.length, RECENT_LIMIT);
    assert.equal(list[0].name, `S${RECENT_LIMIT + 1}`);
    await fs.rm(path.join(root, 'S11'), { recursive: true });
    list = await folders.recent();
    assert.equal(list[0].exists, false);
    assert.equal(list[1].exists, true);
    await folders.forget(list[0].path);
    assert.equal((await folders.recent())[0].name, 'S10');
    await folders.clear();
    assert.deepEqual(await folders.recent(), []);
    assert.equal(await folders.read(path.join(root, 'S10')), '{}', 'a folder picked in this run stays reachable after Clear Menu');
}));

test('takes are kept in the folder\'s takes/, by safe names only', ()=> scratch(async (root, folders)=>
{
    await folders.load();
    const a = folders.grant(path.join(root, 'A'));
    await folders.writeTake(a, 'take-1.wav', new Uint8Array([1, 2, 3]));
    assert.deepEqual(await folders.takes(a), ['take-1.wav']);
    assert.deepEqual([...await folders.readTake(a, 'take-1.wav')], [1, 2, 3]);
    await assert.rejects(folders.writeTake(a, '../../evil.wav', new Uint8Array([1])), /not a take/);
}));

test('the projects in a folder are listed by name, and each can be opened', ()=> scratch(async (root, folders)=>
{
    await folders.load();
    const home = path.join(root, 'Chordinal');
    for (const name of ['Beta', 'Alpha']) { await fs.mkdir(path.join(home, name), { recursive: true }); await fs.writeFile(path.join(home, name, 'project.json'), `"${name}"`); }
    await fs.mkdir(path.join(home, 'Not a project'));
    assert.deepEqual((await folders.listIn(home)).map(p => p.name), ['Alpha', 'Beta']);
    assert.equal(await folders.read(path.join(home, 'Beta')), '"Beta"');
    assert.deepEqual(await folders.listIn(path.join(root, 'missing')), []);
}));
