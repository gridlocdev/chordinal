import test from 'node:test';
import assert from 'node:assert/strict';
import { folderName } from '../../src/platform/project-files.js';

test('a song title makes a projects/ folder name the desktop app accepts', ()=>
{
    assert.equal(folderName('Night Drive'), 'night-drive');
    assert.equal(folderName('  --Boss: Phase 2!-- '), 'boss-phase-2');
    assert.equal(folderName(''), 'untitled');
    for (const t of ['Café at Closing', '夜の歌', 'Ночь', '🎵 Theme']) assert.match(folderName(t), /^[\w-]+$/, t);
});

test('titles in other scripts, or with accents, keep apart instead of all becoming untitled', ()=>
{
    assert.equal(folderName('Café'), 'cafe');
    assert.equal(folderName('Señor Niño'), 'senor-nino');
    const names = ['夜の歌', '朝の歌', 'Ночь', 'День', '🎵', '🎶'].map(folderName);
    assert.equal(new Set(names).size, names.length, names.join(' '));
    assert.ok(!names.includes('untitled'));
});
