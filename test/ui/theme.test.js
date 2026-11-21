// The theme: System follows the OS, Light and Dark don't; the canvases' colours start as the dark theme's, and a hex
// colour can be drawn see-through.
import test from 'node:test';
import assert from 'node:assert/strict';
import { shownTheme, palette, alpha } from '@chordinal/ui';
import { settings } from '@chordinal/ui';

test('System follows the OS; Light and Dark are what they say', ()=>
{
    assert.equal(settings.value.theme, 'system', 'System to begin with');
    assert.equal(shownTheme('system', true), 'dark');
    assert.equal(shownTheme('system', false), 'light');
    assert.equal(shownTheme('light', true), 'light');
    assert.equal(shownTheme('dark', false), 'dark');
    assert.equal(shownTheme('something old', false), 'light');
});

test('the canvases have every colour before the page is read', ()=>
{
    for (const t of ['text', 'muted', 'accent', 'select', 'rec', 'grid-bar', 'key-white', 'key-black', 'clip-text'])
        assert.ok(palette.value[t], `${t} is set`);
});

test('alpha turns #rrggbb see-through and leaves other colours alone', ()=>
{
    assert.equal(alpha('#ff8000', 0.5), 'rgba(255, 128, 0, 0.5)');
    assert.equal(alpha('rgba(0, 0, 0, .3)', 0.5), 'rgba(0, 0, 0, .3)');
});
