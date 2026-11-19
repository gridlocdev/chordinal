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
