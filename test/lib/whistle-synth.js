// A made-up whistle for the transcription tests: notes as sine waves with breath noise, detune, vibrato and timing
// wobble. Not a test file itself.

export const RATE = 22050;
const hz = (midi)=> 440 * 2 ** ((midi - 69) / 12);

/**
 * A made-up whistle: each note a sine (with a quiet 2nd harmonic and breath noise), detuned by `cents`, notes
 * tongued with a short dip, optional vibrato, and a small timing wobble so the grid has to be found.
 */
export function whistle(notes, { tempo, cents = 0, lead = 0.4, jitter = 0.015, noise = 0.01, seed = 1 })
{
    const spb = 60 / tempo;
    const end = lead + Math.max(...notes.map(n => n.beat + n.beats)) * spb + 0.3;
    const out = new Float32Array(Math.ceil(end * RATE));
    let s = seed, phase = 0;
    const rand = ()=> (s = (s * 16807) % 2147483647) / 2147483647;
    for (const n of notes)
    {
        const t0 = lead + n.beat * spb + (rand() - 0.5) * jitter, t1 = lead + (n.beat + n.beats) * spb - (n.gap ?? 0.04);
        for (let i = Math.floor(t0 * RATE); i < t1 * RATE; i++)
        {
            const t = i / RATE - t0;
            const vib = n.vibrato ? n.vibrato.depth * Math.sin(2 * Math.PI * n.vibrato.rate * t) : 0;
            phase += 2 * Math.PI * hz(n.key + cents / 100 + vib) / RATE;
            const env = Math.min(1, t / 0.02, (t1 - i / RATE) / 0.02);
            out[i] = 0.5 * env * (Math.sin(phase) + 0.05 * Math.sin(2 * phase));
        }
    }
    for (let i = 0; i < out.length; i++) out[i] += noise * (rand() * 2 - 1);
    return out;
}

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const LETTERS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** a length in beats as text: a triplet's as a fraction, `1/3` or `2/3`, so they add up exactly */
function beatText(b)
{
    const twelfths = Math.round(b * 12);
    if (Math.abs(b * 12 - twelfths) < 1e-6 && twelfths % 3 !== 0)
    {
        const gcd = (x, y)=> y ? gcd(y, x % y) : x, g = gcd(twelfths, 12);
        return `${twelfths / g}/${12 / g}`;
    }
    return String(Math.round(b * 1000) / 1000);
}

/**
 * Notes written as names, one after another: `Eb5:2` (a length in beats after `:`, 1 left out; `1/3` for a triplet),
 * `~` for vibrato, `r:n` a rest, `|` a bar line (only to read by). Middle C is C4.
 */
export function notesOf(text)
{
    const out = [];
    let beat = 0;
    for (const tok of text.split(/\s+/).filter(x => x && x !== '|'))
    {
        const [head, len = '1'] = tok.split(':');
        const [a, b] = len.split('/').map(Number), beats = b ? a / b : a;
        if (head !== 'r')
        {
            const m = /^([A-G])(b|#)?(-?\d+)(~)?$/.exec(head);
            if (!m) throw new Error(`not a note: ${tok}`);
            const key = 12 * (Number(m[3]) + 1) + LETTERS[m[1]] + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0);
            out.push({ beat, beats, key, ...(m[4] ? { vibrato: true } : {}) });
        }
        beat += beats;
    }
    return out;
}

/** notes as names (see notesOf), sharp or flat, rests between them and a `|` at each bar line */
export function namesOf(notes, { beatsPerBar = 4, flats = false } = {})
{
    const names = flats ? FLATS : SHARPS;
    const out = [];
    let t = 0;
    const bar = (b)=> { if (b > 0 && Math.abs(b / beatsPerBar - Math.round(b / beatsPerBar)) < 1e-6) out.push('|'); };
    for (const n of notes)
    {
        if (n.beat > t + 1e-6) { bar(t); out.push(`r${n.beat - t === 1 ? '' : ':' + beatText(n.beat - t)}`); t = n.beat; }
        bar(t);
        out.push(`${names[((n.key % 12) + 12) % 12]}${Math.floor(n.key / 12) - 1}${n.vibrato ? '~' : ''}${n.beats === 1 ? '' : ':' + beatText(n.beats)}`);
        t = n.beat + n.beats;
    }
    return out.join(' ');
}
