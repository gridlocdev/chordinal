// What the piano roll draws: a keyboard in the gutter and a lane per key, the bars, clips, chords, notes (other tracks'
// faintly), velocities and the selection rectangle, in the theme's colours.
import { MODES } from '@chordinal/lib';
import { noteName } from '@chordinal/lib';
import { barLines } from '@chordinal/daw';
import { settings, selectedClip, picked } from '../store.js';
import { held } from '../live.js';
import { notesOf, canonicalIds, isPicked } from '../notes.js';
import { rgba } from './canvas.js';
import { palette, alpha } from '../theme.js';
import { GUTTER, STRIP, LANE_H, VEL_H, band, geometry } from './roll-view.js';

const FONT = '-apple-system, system-ui, sans-serif';
const BLACK = new Set([1, 3, 6, 8, 10]);
let C = colours(palette.value);

/** the roll's colours, from the theme's */
function colours(t)
{
    return {
        lane: t['grid-lane'], inKey: t['grid-key'], tonic: alpha(t.accent, 0.13), held: t.select,
        beat: t['grid-beat'], bar: t['grid-bar'], outside: t.outside, vel: t['grid-lane'],
        label: t.muted, text: t.text, selected: t.text, chord: alpha(t.select, 0.16), chordEdge: alpha(t.select, 0.55),
        keyWhite: t['key-white'], keyBlack: t['key-black'], keyEdge: t['key-edge'], keyLabel: t.faint, tonicMark: t.accent,
        band: alpha(t.select, 0.12), bandEdge: alpha(t.select, 0.8), gutter: t.panel,
    };
}

function text(g, s, x, y, size, color, align = 'left')
{
    g.font = `${size}px ${FONT}`;
    g.fillStyle = color;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillText(s, x, y);
}

/** the keyboard in the gutter (keys held on the keyboard light up, the tonic has a mark) and the key's lanes */
function lanes(g, L, key, w)
{
    const scale = key ? new Set(MODES[key.mode].map(i => (key.tonic + i) % 12)) : null;
    const on = held.value;
    const blackW = Math.round(GUTTER * 0.6);
    g.fillStyle = C.gutter;
    g.fillRect(0, 0, GUTTER, L.y(L.lo) + L.laneH);
    for (let k = L.lo; k <= L.hi; k++)
    {
        const pc = ((k % 12) + 12) % 12, tonic = key && pc === key.tonic, y = L.y(k);
        g.fillStyle = tonic ? C.tonic : scale?.has(pc) ? C.inKey : C.lane;
        g.fillRect(GUTTER, y + 1, w - GUTTER, L.laneH - 1);
        // the white keys under every lane, the black ones over them; a line where two white keys meet (B|C and E|F)
        g.fillStyle = on.has(k) && !BLACK.has(pc) ? C.held : C.keyWhite;
        g.fillRect(0, y, GUTTER - 1, L.laneH);
        if (pc === 0 || pc === 5) { g.fillStyle = C.keyEdge; g.fillRect(0, y + L.laneH - 1, GUTTER - 1, 1); }
    }
    for (let k = L.lo; k <= L.hi; k++)
    {
        const pc = ((k % 12) + 12) % 12, y = L.y(k);
        if (BLACK.has(pc))
        {
            g.fillStyle = on.has(k) ? C.held : C.keyBlack;
            g.beginPath(); g.roundRect(0, y + 0.5, blackW, L.laneH - 1, [0, 2, 2, 0]); g.fill();
            g.fillStyle = C.keyEdge; g.fillRect(0, y + L.laneH / 2, blackW * 0.45, 1);
        }
        if (key && pc === key.tonic) { g.fillStyle = C.tonicMark; g.fillRect(GUTTER - 4, y + 2, 2, L.laneH - 4); }
        if (pc === 0 && L.laneH >= 7) text(g, noteName(k), GUTTER - 7, y + L.laneH / 2, Math.min(10, Math.max(8, L.laneH * 0.75)), C.keyLabel, 'right');
    }
    g.fillStyle = C.keyEdge;
    g.fillRect(GUTTER - 1, 0, 1, L.y(L.lo) + L.laneH);
}

/** the roll for project p's track on a canvas of w × h */
export function drawRoll(g, w, h, p, track)
{
    C = colours(palette.value);
    const G = geometry(w, h);
    const shown = (w - GUTTER) / G.ppb;
    lanes(g, G.L, p.key, w);
    if (!track) { text(g, 'Select a track to see its notes', w / 2, h / 2, 14, C.label, 'center'); return; }
    g.save();
    g.beginPath(); g.rect(GUTTER, 0, w - GUTTER, h); g.clip();
    const grid = settings.value.grid;
    if (grid * G.ppb >= 8)
        for (let b = Math.ceil(G.from / grid) * grid; b < G.from + shown; b += grid) { g.fillStyle = C.beat; g.fillRect(G.x(b), G.top, 1, G.bottom - G.top); }
    for (const b of barLines(p.meters, Math.max(0, G.from), G.from + shown)) { g.fillStyle = C.bar; g.fillRect(G.x(b), G.top, 1, h - G.top); }
    // outside the clips is shaded; the selected clip's edges are brighter
    let at = Math.max(0, G.from);
    g.fillStyle = C.outside;
    for (const c of [...track.clips].sort((a, b)=> a.start - b.start))
    {
        if (c.start > at) g.fillRect(G.x(at), G.top, (c.start - at) * G.ppb, G.bottom - G.top);
        at = Math.max(at, c.start + c.beats);
    }
    g.fillRect(G.x(at), G.top, w, G.bottom - G.top);
    const sel = selectedClip.value;
    for (const c of track.clips)
    {
        const a = G.x(c.start), b = G.x(c.start + c.beats);
        if (b < GUTTER || a > w) continue;
        g.fillStyle = sel?.clip === c.id ? rgba(track.color, 0.9) : rgba(track.color, 0.4);
        g.fillRect(a, G.top, 1, G.bottom - G.top); g.fillRect(b - 1, G.top, 1, G.bottom - G.top);
    }
    // chords
    for (const c of p.chords)
    {
        const a = G.x(c.beat), b = G.x(c.beat + c.beats);
        if (b < GUTTER || a > w) continue;
        g.fillStyle = C.chord; g.beginPath(); g.roundRect(a + 1, 3, b - a - 2, STRIP - 6, 4); g.fill();
        g.fillStyle = C.chordEdge; g.fillRect(a + 1, 3, 1.5, STRIP - 6);
        if (b - a > 20) text(g, c.name, (a + b) / 2, STRIP / 2, 12, C.text, 'center');
    }
    // the other tracks' notes, faintly, to write against (drum kits' keys are drums, not pitches)
    if (settings.value.ghosts)
        for (const t of p.tracks)
        {
            if (t === track || t.instrument.bank >= 128) continue;
            g.fillStyle = rgba(t.color, 0.16);
            for (const { n, clip, at: b0 } of notesOf(t))
            {
                const a = G.x(b0), b = G.x(b0 + Math.min(n.beats, clip.beats - n.beat)), y = G.L.y(n.key);
                if (b < GUTTER || a > w || y < G.top - 1 || y >= G.bottom) continue;
                g.fillRect(a + 0.5, y + 3, Math.max(2, b - a - 1), LANE_H - 6);
            }
        }
    // notes, and their velocities below
    g.fillStyle = C.vel;
    g.fillRect(GUTTER, G.bottom, w, VEL_H);
    g.fillStyle = C.bar;
    g.fillRect(GUTTER, G.bottom, w, 1);
    const on = canonicalIds(track, picked.value);
    for (const { n, i, clip, at: b0 } of notesOf(track))
    {
        const a = G.x(b0), b = G.x(b0 + Math.min(n.beats, clip.beats - n.beat));
        if (b < GUTTER || a > w) continue;
        const sel = isPicked(track, clip.id, i, on), y = G.L.y(n.key);
        // a note above or below the keys shown has only its velocity drawn
        if (y >= G.top - 1 && y < G.bottom)
        {
            g.fillStyle = rgba(track.color, 0.35 + 0.6 * Math.min(1, (n.vel ?? 90) / 127));
            g.beginPath(); g.roundRect(a + 0.5, y + 1, Math.max(2, b - a - 1), LANE_H - 2, 2); g.fill();
            if (sel) { g.strokeStyle = C.selected; g.lineWidth = 1.5; g.strokeRect(a + 0.5, y + 1, Math.max(2, b - a - 1), LANE_H - 2); }
        }
        const vh = (VEL_H - 6) * (n.vel / 127);
        g.fillStyle = sel ? C.selected : rgba(track.color, 0.9);
        g.fillRect(a, h - 2 - vh, 2, vh);
        g.fillRect(a, h - 2 - vh, 6, 2);
    }
    const box = band.value;
    if (box)
    {
        const x0 = G.x(Math.min(box.a.beat, box.b.beat)), x1 = G.x(Math.max(box.a.beat, box.b.beat));
        const y0 = G.L.y(Math.max(box.a.key, box.b.key)), y1 = G.L.y(Math.min(box.a.key, box.b.key)) + LANE_H;
        g.fillStyle = C.band; g.fillRect(x0, y0, x1 - x0, y1 - y0);
        g.strokeStyle = C.bandEdge; g.lineWidth = 1; g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
    }
    g.restore();
    text(g, 'vel', GUTTER - 6, G.bottom + VEL_H / 2, 10, C.label, 'right');
}
