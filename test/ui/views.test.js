import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '../..');
const SOURCES = ['packages/ui/src', 'apps/web/src'];

test('plain modules never import a view, so commands and state load without the UI', ()=>
{
    const wrong = SOURCES.flatMap(dir => fs.readdirSync(path.join(ROOT, dir), { recursive: true })
        .filter(f => f.endsWith('.js') && f !== 'components/index.js').map(f => path.join(dir, f)))
        .filter(f => /from '([^']+\.jsx|@chordinal\/ui\/components)'/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    assert.deepEqual(wrong, [], 'move the state the module needs out of the .jsx view into a .js module');
});
