// Chordinal's files (Chordinal PRD §4) against a pretend disk behind the same calls the desktop app answers.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.requestAnimationFrame ??= ()=> 0;
globalThis.cancelAnimationFrame ??= ()=> {};

const disk = new Map();
let recentList = /** @type {string[]} */ ([]);
let pickSaveAnswer = '', pickOpenAnswer = '', handedAnswer = '', handedOver = (dir)=> {};
const toTop = (d)=> { recentList = [d, ...recentList.filter(x => x !== d)]; };
/** @type {any} */ (globalThis).projectFolders = {
    read: async (d)=> { if (!disk.has(d)) throw new Error('no such folder'); return disk.get(d); },
    write: async (d, t)=> { disk.set(d, t); toTop(d); },
    exists: async (d)=> disk.has(d),
    used: async (d)=> toTop(d),
    recent: async ()=> recentList.map(p => ({ path: p, name: p.split('/').at(-1), exists: disk.has(p) })),
    forget: async (d)=> { recentList = recentList.filter(x => x !== d); },
    clear: async ()=> { recentList = []; },
    takes: async ()=> [],
    pickSave: async ()=> pickSaveAnswer,
    pickOpen: async ()=> pickOpenAnswer,
    handed: async ()=> { const d = handedAnswer; handedAnswer = ''; return d; },
    onHandedOver: (fn)=> { handedOver = fn; },
};

const { newSongProject, newSong, openFolder, openRecent, startUp, recent, useProjectFolders } = await import('../../src/chordinal/files.js');
const { edit, save } = await import('../../src/ui/document.js');
const { asking, answer, OTHER } = await import('../../src/ui/ask.js');
const { project, projectName, dirty, status, settings } = await import('../../src/ui/store.js');
const { addTrack, makeTrack } = await import('../../src/daw/project.js');
const { writeProject } = await import('../../src/daw/project-format.js');
useProjectFolders();

const tick = ()=> new Promise(r => setTimeout(r, 0));
const addOne = ()=> edit(p => addTrack(p, makeTrack(p)));

test('a new project is 120 bpm, 4/4, 8 bars, with a Standard kit drum track and a Grand Piano track (§4.3)', ()=>
{
    const p = newSongProject();
    assert.deepEqual(p.tempoMap, [{ beat: 0, bpm: 120 }]);
    assert.deepEqual(p.meters, [{ beat: 0, sig: '4/4' }]);
    assert.equal(p.length, 32);
    assert.deepEqual(p.tracks.map(t => [t.name, t.instrument.bank, t.instrument.program]), [['Drums', 128, 0], ['Grand Piano', 0, 0]]);
});

test('the first start opens a new project with nothing to save, and asks nothing (§4.2)', async ()=>
{
    await startUp();
    assert.equal(project.value.tracks.length, 2);
    assert.equal(dirty.value, false);
    assert.equal(asking.value, null);
});

test('a folder handed over at start-up (Open in Chordinal) opens instead of the last project; one handed over later asks first (§9.2)', async ()=>
{
    const a = '/docs/Chordinal/Handed', b = '/docs/Chordinal/Later';
    for (const [dir, title] of [[a, 'Handed'], [b, 'Later']]) disk.set(dir, writeProject({ ...newSongProject(), title }));
    handedAnswer = a;
    await startUp();
    assert.equal(projectName.value, a);
    assert.equal(project.value.title, 'Handed');
    addOne();
    handedOver(b);
    await tick();
    assert.ok(asking.value, 'the unsaved changes are asked about');
    answer(OTHER);
    await tick(); await tick();
    assert.equal(projectName.value, b);
    disk.delete(a); disk.delete(b);
    recentList = [];
    await newSong();
});

test('New with unsaved changes asks Save, Don\'t Save or Cancel (§4.3)', async ()=>
{
    addOne();
    let done = newSong();
    await tick();
    assert.equal(asking.value.text, 'Save changes to “Untitled”?');
    answer(null);
    await done;
    assert.equal(project.value.tracks.length, 3, 'Cancel keeps the project');

    done = newSong();
    await tick();
    answer(OTHER);
    await done;
    assert.equal(project.value.tracks.length, 2, 'Don\'t Save starts a new one');
    assert.equal(dirty.value, false);

    addOne();
    pickSaveAnswer = '/music/Night Drive';
    done = newSong();
    await tick();
    answer('');
    await done;
    assert.equal(JSON.parse(disk.get('/music/Night Drive').replace(/\n/g, '')).tracks.length, 3, 'Save writes it first');
    assert.equal(project.value.tracks.length, 2);
    assert.equal(project.value.title, 'Untitled');
});

test('Save as names the project after its folder, and puts it in Open Recent (§4.5, §4.6)', async ()=>
{
    pickSaveAnswer = '/music/Rain Song';
    assert.equal(await save(), true);
    assert.equal(projectName.value, '/music/Rain Song');
    assert.equal(project.value.title, 'Rain Song');
    assert.equal(settings.value.project, '/music/Rain Song');
    assert.equal(recent.value[0].name, 'Rain Song');
    assert.equal(status.value, 'Saved “Rain Song”');
});

test('cancelling Save in the question keeps the project open (§4.3)', async ()=>
{
    await newSong();
    addOne();
    pickSaveAnswer = '';
    const done = newSong();
    await tick();
    answer('');
    await done;
    assert.equal(project.value.tracks.length, 3, 'nothing was saved, so nothing was thrown away');
    assert.equal(dirty.value, true);
});

test('Open… opens the folder picked; a recent project that is gone says so and leaves the list (§4.4, §4.5)', async ()=>
{
    disk.set('/elsewhere/Old Tune', writeProject({ ...newSongProject(), title: 'Old Tune' }));
    pickOpenAnswer = '/elsewhere/Old Tune';
    const done = openFolder();
    await tick();
    answer(OTHER);     // the changes left from the last test
    await done;
    await tick();
    assert.equal(project.value.title, 'Old Tune');
    assert.equal(recent.value[0].path, '/elsewhere/Old Tune');

    disk.delete('/music/Rain Song');
    await openRecent('/music/Rain Song');
    assert.equal(status.value, 'Rain Song was moved or deleted');
    assert.equal(recent.value.some(r => r.path === '/music/Rain Song'), false);
    assert.equal(project.value.title, 'Old Tune', 'the open project stays');
});
