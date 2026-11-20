// Loaded SoundFonts are let go once their samples pass a budget, least recently asked for first (audit: every font
// ever loaded stayed in memory until the app quit, so trying instruments from many libraries kept growing).
import test from 'node:test';
import assert from 'node:assert/strict';
import { trimFonts } from '../../src/audio/soundfont.js';

test('the least recently asked for fonts go until the rest fit, never the one just loaded or one still loading', ()=>
{
    const cache = new Map([['a', { bytes: 100 }], ['b', { bytes: undefined }], ['c', { bytes: 100 }], ['d', { bytes: 100 }]]);
    trimFonts(cache, 250, 'd');
    assert.deepEqual([...cache.keys()], ['b', 'c', 'd']);
    trimFonts(cache, 50, 'd');
    assert.deepEqual([...cache.keys()], ['b', 'd'], 'over budget with only the kept font left is fine');
});

test('fonts within the budget all stay', ()=>
{
    const cache = new Map([['a', { bytes: 100 }], ['b', { bytes: 100 }]]);
    trimFonts(cache, 200, 'b');
    assert.deepEqual([...cache.keys()], ['a', 'b']);
});
