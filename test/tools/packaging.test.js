// The installable app (packaging/chordinal.json, built by electron-builder): it ships every file its main process and
// page load, and its icons (Chordinal PRD §3.3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel)=> readFileSync(path.join(ROOT, rel), 'utf8');
const pkg = JSON.parse(read('package.json'));
const APPS = ['chordinal'].map(name =>
{
    const config = JSON.parse(read(`packaging/${name}.json`));
    return { name, config, main: config.extraMetadata?.main ?? pkg.main };
});

/** whether electron-builder's `files` take `rel` in (the patterns used here: a file, or a folder/**) */
const shipped = (files, rel)=> files.some(p => p.endsWith('/**') ? rel.startsWith(p.slice(0, -2)) : rel === p);

/** the files of this checkout that `rel` loads, and theirs, through relative imports, requires and page links */
function loaded(rel, seen = new Set())
{
    if (seen.has(rel)) return seen;
    seen.add(rel);
    const text = read(rel);
    const refs = rel.endsWith('.html')
        ? [...text.matchAll(/(?:src|href)="(?!https?:|#)([^"]+)"/g)].map(m => m[1])
        : [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)].map(m => m[1]);
    for (const ref of refs)
    {
        const next = path.relative(ROOT, path.resolve(ROOT, path.dirname(rel), ref));
        if (existsSync(path.join(ROOT, next)) && /\.(m?js|cjs|jsx|html|css)$/.test(next)) loaded(next, seen);
    }
    return seen;
}

for (const { name, config, main } of APPS)
{
    test(`${name}: the build ships every file its main process and page load`, ()=>
    {
        const entry = read(main);
        const page = entry.match(/page: '([^']+)'/)[1];
        const icon = entry.match(/icon: '([^']+)'/)[1];
        const needed = [...loaded(main), ...loaded(page), 'electron/preload.cjs', `assets/${icon}/icon.png`, 'package.json'];
        const missing = needed.filter(rel => !shipped(config.files, rel));
        assert.deepEqual(missing, [], `add these to packaging/${name}.json "files"`);
        assert.ok(existsSync(path.join(ROOT, page)));
    });

    test(`${name}: its icons are there`, ()=>
    {
        for (const file of [config.mac.icon, config.win.icon, config.linux.icon])
            assert.ok(existsSync(path.join(ROOT, file)), `${file} is missing: run just icons`);
    });
}

test('the app asks for the microphone, runs electron/chordinal.js, and keeps its build settings in packaging/', ()=>
{
    const [ch] = APPS.map(a => a.config);
    assert.equal(ch.extraMetadata.productName, ch.productName);
    assert.ok(ch.mac.extendInfo.NSMicrophoneUsageDescription);
    assert.equal(pkg.main, 'electron/chordinal.js');
    assert.equal(pkg.name, 'chordinal');
    assert.equal(pkg.homepage, 'https://github.com/gridlocdev/chordinal');
    assert.equal(pkg.build, undefined, 'the build settings live in packaging/, not package.json');
});
