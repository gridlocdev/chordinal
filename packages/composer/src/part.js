// One part over a stretch of bars, for Chordinal's Generate Part… (Chordinal PRD §8): the composer writes a one-section
// song in the project's tempo, meter and key, over the project's chords when it has some, and this keeps the one part
// asked for. Pure and deterministic, like compose(): the same request always gives the same notes.
import { MODES, pitchName } from '@chordinal/lib';
import { ROLE_NAMES } from './composer-data.js';
import { GENRES } from './genre-data.js';
import { METERS } from './patterns-data.js';
import { compose } from './compose.js';

/** the parts Generate Part writes, each with the composer's role that plays it */
export const PARTS = /** @type {const} */ ({ drums: 'drums', bass: 'bass', chords: 'chords', pad: 'pad', arpeggio: 'arp', melody: 'lead', countermelody: 'counter' });

/** the part's usual program, when the style's band has no player for it */
const USUAL = { lead: 73, counter: 71, arp: 46, chords: 0, pad: 89, bass: 33, drums: 0 };

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const MAJOR = MODES.major;

/** a style's name for messages: 'hopeful' → 'Hopeful', 'lo-fi-hip-hop' → 'Lo-fi hip hop' */
export function styleName(style)
{
    const s = String(style).replace(/^(feeling|genre):/, '').replace(/-/g, ' ');
    return s ? `${s[0].toUpperCase()}${s.slice(1)}` : '';
}

/**
 * A chord's pitch classes (root first) as a Roman numeral in a key, the way a spec's progression writes it: 'vi', 'V7',
 * 'bVII', 'iiø', 'VII/I'. Its quality comes from the tones; a plain numeral counts in the mode, one with b from the
 * major scale. Null with no tones.
 * @param {number[]} tones @param {number} tonic @param {string} mode
 */
export function romanFor(tones, tonic, mode)
{
    if (!tones?.length) return null;
    const root = tones[0], t = new Set(tones.map(x => ((x - root) % 12 + 12) % 12));
    const minor = t.has(3) && !t.has(4), dim = minor && t.has(6) && !t.has(7), aug = t.has(4) && t.has(8) && !t.has(7);
    const sus = !t.has(3) && !t.has(4) ? (t.has(5) ? 'sus4' : t.has(2) ? 'sus2' : '') : '';
    const quality = dim ? (t.has(10) ? 'ø' : '°') : aug ? '+' : '';
    const ext = dim ? (t.has(9) ? '7' : '') : sus ? (t.has(10) && sus === 'sus4' ? '7sus4' : sus)
        : t.has(11) ? 'maj7' : t.has(10) ? '7' : t.has(9) ? '6' : '';
    const step = ((root - tonic) % 12 + 12) % 12;
    const write = (acc, degree)=> { const n = NUMERALS[degree]; return `${acc}${minor || dim ? n.toLowerCase() : n}${quality}${ext}`; };
    // a plain numeral when the mode has the step (and a diminished seventh isn't the leading tone's, which a plain vii° is)
    const inMode = MODES[mode].indexOf(step);
    if (inMode >= 0 && !(inMode === 6 && dim && step !== 11)) return write('', inMode);
    // a step of the major scale the mode lacks (the leading tone in minor) is that numeral in the tonic's major key
    const inMajor = MAJOR.indexOf(step);
    if (inMajor >= 0) return `${write('', inMajor)}/I`;
    return write('b', MAJOR.indexOf(step + 1));
}

/**
 * The chords over a range as a progression ('vi:2 IV:2 I:1.5 V:2.5'), each in bars, from the range's start; a gap is
 * held by the chord before it (or the first, at the start). Null when no chord falls in the range or one can't be spelt.
 * @param {{ beat: number, beats: number, tones: number[] }[]} chords @param {{ from: number, to: number }} range
 */
export function progressionOver(chords, range, beatsPerBar, tonic, mode)
{
    const inside = chords.filter(c => c.beat < range.to - 1e-9 && c.beat + c.beats > range.from + 1e-9).sort((a, b)=> a.beat - b.beat);
    if (!inside.length) return null;
    const out = [];
    for (let i = 0; i < inside.length; i++)
    {
        const from = i === 0 ? range.from : Math.max(range.from, inside[i].beat);
        const to = i + 1 < inside.length ? Math.max(from, inside[i + 1].beat) : range.to;
        if (to - from < 1e-9) continue;
        const symbol = romanFor(inside[i].tones, tonic, mode);
        if (!symbol) return null;
        out.push(`${symbol}:${+((to - from) / beatsPerBar).toFixed(4)}`);
    }
    return out.join(' ');
}

/**
 * Writes one part.
 * @param {{ part: keyof typeof PARTS, style: string, seed: string, tempo: number, meter: string, tonic: number, mode: string,
 *   bars: number, chords?: { beat: number, beats: number, tones: number[] }[] }} request
 *   style: 'feeling:<emotion>' or 'genre:<genre>'; chords: the project's, from the range's start (beat 0), to follow
 * @returns {{ ok: true, notes: any[], beats: number, instrument: { bank: number, program: number }, name: string,
 *   chords: { beat: number, beats: number, name: string, tones: number[] }[] } | { ok: false, message: string }}
 *   chords: the ones the part was written over, from the range's start
 */
export function composePart({ part, style, seed, tempo, meter, tonic, mode, bars, chords = [] })
{
    const role = PARTS[part];
    const cant = { ok: /** @type {false} */ (false), message: `${styleName(style)} can't write ${String(part)} in ${meter}.` };
    const m = METERS[meter];
    if (!role || !m || !(bars > 0)) return cant;
    const beats = bars * m.beats;
    const [kind, name] = String(style).split(':');
    const progression = chords.length ? progressionOver(chords, { from: 0, to: beats }, m.beats, tonic, mode) : null;
    const spec = {
        title: 'Part', seed: String(seed), key: pitchName(tonic, /b/.test(String(chords[0]?.name ?? ''))), mode, tempo, meter, form: ['verse'], loop: true,
        ...(kind === 'genre' ? { genre: GENRES[name] ? name : '' } : { emotion: name }),
        // the project's chords as written: no colour added, no cadence forced on the last bar
        ...(progression && { extend: null }),
        sections: { verse: { bars, energy: 0.8, fullness: 1, endOn: null, ...(progression && { progression }) } },
    };
    const write = (band)=> { try { return compose(band ? { ...spec, band } : spec); } catch { return null; } };
    let score = write(null);
    let track = score?.tracks.find(t => t.role === role);
    if (score && !track) { score = write({ [role]: USUAL[role] }); track = score?.tracks.find(t => t.role === role); }
    if (!score || !track?.notes.length || Math.abs(score.beats - beats) > 1e-6) return cant;
    const notes = track.notes.filter(n => n.beat < beats - 1e-9)
        .map(({ anticipates, ...n })=> ({ ...n, beats: Math.min(n.beats, beats - n.beat), ...(anticipates !== undefined && { early: anticipates - n.beat }) }));
    return { ok: true, notes, beats, instrument: { bank: track.bank, program: track.program }, name: ROLE_NAMES[role],
        chords: score.chords.map(c => ({ beat: c.beat, beats: c.beats, name: c.name, tones: c.tones })) };
}
