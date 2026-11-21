// The installable app (apps/desktop/electron-builder.json, built by electron-builder): it ships every file its main
// process loads, the built page, the docs and its icons (Chordinal PRD §3.3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DESKTOP = path.join(ROOT, 'apps/desktop');
const read = (rel)=> readFileSync(path.join(DESKTOP, rel), 'utf8');
const pkg = JSON.parse(read('package.json'));
const config = JSON.parse(read('electron-builder.json'));

/** whether electron-builder's `files` take `rel` in (the patterns used here: a file, or a folder/**) */
const shipped = (files, rel)=> files.some(p => p.endsWith('/**') ? rel.startsWith(p.slice(0, -2)) : rel === p);

/** the files of apps/desktop that `rel` loads, and theirs, through relative imports and requires */
function loaded(rel, seen = new Set())
{
    if (seen.has(rel)) return seen;
    seen.add(rel);
    const text = read(rel);
    const refs = [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)].map(m => m[1]);
    for (const ref of refs)
    {
        const next = path.relative(DESKTOP, path.resolve(DESKTOP, path.dirname(rel), ref));
        if (existsSync(path.join(DESKTOP, next)) && /\.(m?js|cjs)$/.test(next)) loaded(next, seen);
    }
    return seen;
}

test('the build ships every file its main process loads, and the packages it imports are its dependencies', ()=>
{
    const main = config.extraMetadata.main;
    const needed = [...loaded(main), 'src/preload.cjs', 'assets/icon/icon.png', 'package.json'];
    assert.deepEqual(needed.filter(rel => !shipped(config.files, rel)), [], 'add these to electron-builder.json "files"');
    const imported = new Set([...loaded(main)].flatMap(rel => [...read(rel).matchAll(/from '(@chordinal\/[a-z]+)'/g)].map(m => m[1])));
    for (const name of imported) assert.ok(pkg.dependencies[name], `${name} must be in apps/desktop's dependencies`);
});

test('the build ships the page, the docs and the bundled SoundFont as resources', ()=>
{
    const to = Object.fromEntries(config.extraResources.map(r => [r.to, r.from]));
    assert.equal(to.web, '../web/dist');
    assert.equal(to.docs, '../../docs');
    assert.equal(to['README.md'], '../../README.md');
    assert.ok(to['soundfonts/GeneralUser-GS']);
    assert.ok(existsSync(path.join(ROOT, 'apps/web/index.html')));
});

test('its icons are there', ()=>
{
    for (const file of [config.mac.icon, config.win.icon, config.linux.icon])
        assert.ok(existsSync(path.join(DESKTOP, file)), `${file} is missing: run just icons`);
});

test('the app asks for the microphone, is named chordinal, and runs src/chordinal.js', ()=>
{
    assert.equal(config.extraMetadata.productName, config.productName);
    assert.ok(config.mac.extendInfo.NSMicrophoneUsageDescription);
    assert.equal(config.extraMetadata.name, 'chordinal');
    assert.equal(pkg.main, config.extraMetadata.main);
    const root = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.equal(root.name, 'chordinal');
    assert.equal(pkg.homepage, 'https://github.com/gridlocdev/chordinal');
    assert.equal(root.build, undefined, 'the build settings live in apps/desktop/electron-builder.json');
});
