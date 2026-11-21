// The installable app (apps/desktop/electron-builder.json, built by electron-builder): it ships every file its main
// process loads (bundled into one file), the built page, the docs and its icons (Chordinal PRD §3.3).
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
const shipped = (files, rel)=> files.some(p => !p.startsWith('!') && (p.endsWith('/**') ? rel.startsWith(p.slice(0, -2)) : rel === p));

test('the build ships the bundled main process and what it loads at run time, and no workspace package', ()=>
{
    // tools/build.mjs bundles src/chordinal.ts, and the packages it imports, into dist/chordinal.js: a packaged app
    // can't run the packages' TypeScript from node_modules
    assert.equal(config.extraMetadata.main, 'dist/chordinal.js');
    for (const rel of ['dist/chordinal.js', 'dist/preload.cjs', 'assets/icon/icon.png', 'package.json'])
        assert.ok(shipped(config.files, rel), `add ${rel} to electron-builder.json "files"`);
    assert.ok(!shipped(config.files, 'src/chordinal.ts'), 'the unbundled sources stay out');
    assert.deepEqual(Object.keys(pkg.dependencies ?? {}), [], 'the main process is bundled: it has no dependencies to ship');
    assert.match(readFileSync(path.join(ROOT, 'tools/build.mjs'), 'utf8'), /apps\/desktop/);
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

test('the app asks for the microphone and is named chordinal', ()=>
{
    assert.equal(config.extraMetadata.productName, config.productName);
    assert.ok(config.mac.extendInfo.NSMicrophoneUsageDescription);
    assert.equal(config.extraMetadata.name, 'chordinal');
    const root = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.equal(root.name, 'chordinal');
    assert.equal(pkg.homepage, 'https://github.com/gridlocdev/chordinal');
    assert.equal(root.build, undefined, 'the build settings live in apps/desktop/electron-builder.json');
});
