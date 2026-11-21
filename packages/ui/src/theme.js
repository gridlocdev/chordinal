// The theme: System (follows the OS), Light or Dark, kept in the settings. It sets `data-theme` on the page, so the
// stylesheet's tokens switch, and keeps `palette`, the same tokens read back for the canvases: a canvas that draws with
// `palette.value` redraws when the theme changes.
import { signal, effect } from '@preact/signals';
import { settings } from './store.js';

/** the colours the canvases draw with, by token name (without the leading --) */
const TOKENS = ['bg', 'panel', 'panel-2', 'raised', 'line', 'line-soft', 'text', 'muted', 'faint', 'accent', 'play', 'rec', 'select',
    'grid-lane', 'grid-key', 'grid-beat', 'grid-bar', 'outside', 'key-white', 'key-black', 'key-edge', 'clip-text', 'note-edge'];

/** the dark theme's colours, for drawing before the page's are read (and in tests, which have no page) */
const DARK = {
    bg: '#131417', panel: '#1a1b1f', 'panel-2': '#212227', raised: '#2a2b31', line: '#2e2f35', 'line-soft': '#232429',
    text: '#e9e9ed', muted: '#9b9ca6', faint: '#64656f', accent: '#f4b74a', play: '#4fd18b', rec: '#ff5c5c', select: '#6fa8ff',
    'grid-lane': 'rgba(255, 255, 255, .018)', 'grid-key': 'rgba(255, 255, 255, .045)', 'grid-beat': 'rgba(255, 255, 255, .06)',
    'grid-bar': 'rgba(255, 255, 255, .16)', outside: 'rgba(0, 0, 0, .32)', 'key-white': '#d9dade', 'key-black': '#1c1d21',
    'key-edge': '#8d8e97', 'clip-text': '#101114', 'note-edge': 'rgba(0, 0, 0, .35)',
};

/** @type {import('@preact/signals').Signal<Record<string, string>>} */
export const palette = signal(DARK);

/** '#rrggbb' at alpha a, as CSS */
export function alpha(hex, a)
{
    const n = parseInt(hex.slice(1), 16);
    return /^#[0-9a-f]{6}$/i.test(hex) ? `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})` : hex;
}

/** 'light' or 'dark': the setting, or the OS's choice for System */
export const shownTheme = (choice, osDark)=> choice === 'light' || choice === 'dark' ? choice : osDark ? 'dark' : 'light';

/** follows the theme setting and the OS's choice from now on */
export function startTheme()
{
    const os = matchMedia('(prefers-color-scheme: dark)');
    const osDark = signal(os.matches);
    os.addEventListener('change', ()=> { osDark.value = os.matches; });
    effect(()=>
    {
        const root = document.documentElement;
        root.dataset.theme = shownTheme(settings.value.theme, osDark.value);
        const css = getComputedStyle(root);
        palette.value = { ...DARK, ...Object.fromEntries(TOKENS.map(t => [t, css.getPropertyValue(`--${t}`).trim()]).filter(([, v])=> v)) };
    });
}
