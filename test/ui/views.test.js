import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join(import.meta.dirname, '../../src');

test('plain modules never import a view, so commands and state load without the UI', ()=>
{
    const wrong = fs.readdirSync(SRC, { recursive: true }).filter(f => f.endsWith('.js'))
        .filter(f => /from '[^']+\.jsx'/.test(fs.readFileSync(path.join(SRC, f), 'utf8')));
    assert.deepEqual(wrong, [], 'move the state the module needs out of the .jsx view into a .js module');
});

test('the two apps never import each other: what both need lives in src/ui (Chordinal PRD §3.2)', ()=>
{
    const apps = ['app', 'chordinal'];
    const wrong = apps.flatMap(a =>
    {
        const dir = path.join(SRC, a);
        if (!fs.existsSync(dir)) return [];
        const other = apps.filter(b => b !== a);
        return fs.readdirSync(dir, { recursive: true }).filter(f => /\.jsx?$/.test(f))
            .filter(f => other.some(b => new RegExp(`from '(\\.\\./)+${b}/`).test(fs.readFileSync(path.join(dir, f), 'utf8'))))
            .map(f => `${a}/${f}`);
    });
    assert.deepEqual(wrong, [], 'move the shared code into src/ui');
});
