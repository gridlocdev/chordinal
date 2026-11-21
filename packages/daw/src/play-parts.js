// The pieces playProject (player.js) schedules from: each pass's note events, the notes a start mid-way restarts,
// the beats a track ducks on, an automation lane on an audio param, and a metronome click.
import { trackNotes, isDrums } from './project.js';
import { performProject } from './fx.js';
import { valueAt } from './automation.js';

const CLICK = { bar: 1760, beat: 1320, seconds: 0.05, gain: 0.3 };  // the metronome: pitches of a bar's first beat and the rest

/**
 * The notes sounding at a beat that started before it, which a start or a jump there has to restart: not drums, since
 * a hit restarted mid-ring would sound like a new one.
 * @param {any[][]} played each track's played notes
 * @returns {{ i: number, n: any }[]}
 */
export function heldAt(played, tracks, beat)
{
    return played.flatMap((notes, i)=> isDrums(tracks[i]) ? [] :
        notes.filter(n => n.grid < beat && n.beat < beat && n.beat + n.beats > beat).map(n => ({ i, n })));
}

/**
 * Whether a note's note-off should release its key: not when a later note on the same key has retriggered it, or the
 * earlier note's end would cut the later one short.
 * @param {Map<string, { n?: any }>} sounding
 */
export const ownsKey = (sounding, id, n)=> { const s = sounding.get(id); return !s?.n || s.n === n; };

/**
 * One pass's performance as note events: note-offs sort before note-ons on the same beat, so a repeated key is
 * released before it restarts. A held note has no off: the next note glides on from it.
 */
export function passEvents(project, pass)
{
    const { tracks: played, events: fxEvents } = performProject(project, pass);
    const events = played.flatMap((notes, i)=> notes.flatMap(n => [
        { beat: n.beat, on: true, i, n },
        ...(n.held ? [] : [{ beat: n.beat + n.beats, on: false, i, n }]),
    ])).sort((a, b)=> a.beat - b.beat || +a.on - +b.on);
    return { played, events, fx: [...fxEvents].sort((a, b)=> a.beat - b.beat) };
}

/**
 * each track's ducks: the beats of its source track's notes on the duck's keys, at least `apart` seconds apart so
 * the track comes back up between them
 * @param {(beat: number)=> number} secs  a beat's time in seconds
 */
export function duckPlan(tracks, secs, apart)
{
    return tracks.map(t =>
    {
        const d = t.mixer.duck, source = d && tracks.find(s => s.id === d.from);
        if (!source) return [];
        const out = [];
        for (const b of [...new Set(trackNotes(source).filter(n => d.keys.includes(n.key)).map(n => n.beat))].sort((a, b)=> a - b))
            if (!out.length || secs(b) - secs(out.at(-1)) >= apart) out.push(b);
        return out;
    });
}

/**
 * an automation lane's keyframes on an audio param, for the segment `s` (from beat s.from at time s.at, to s.until)
 * @param {(beat: number)=> number} timeOf  a beat's audio time in the segment
 */
export function scheduleLane(param, keyframes, s, timeOf, now)
{
    // just after s.at, so the last segment's ramp ending at s.at isn't dropped short of its target
    param.cancelScheduledValues(s.at + 0.001);
    param.setValueAtTime(valueAt(keyframes, s.from), Math.max(now, s.at));
    for (const f of keyframes)
    {
        if (f.beat <= s.from || f.beat > s.until) continue;
        const t = timeOf(f.beat);
        if (f.curve === 'exp') param.exponentialRampToValueAtTime(f.value, t);
        else if (f.curve === 'linear') param.linearRampToValueAtTime(f.value, t);
        else param.setValueAtTime(f.value, t);
    }
}

/** a metronome click at `at` into `output`: higher on a bar's first beat. Returns its oscillator, which ends itself. */
export function playClick(ctx, output, first, at)
{
    const osc = new OscillatorNode(ctx, { frequency: first ? CLICK.bar : CLICK.beat });
    const env = new GainNode(ctx, { gain: 0 });
    env.gain.setValueAtTime(CLICK.gain, at);
    env.gain.exponentialRampToValueAtTime(0.001, at + CLICK.seconds);
    osc.connect(env).connect(output);
    osc.start(at);
    osc.stop(at + CLICK.seconds);
    osc.addEventListener('ended', ()=> env.disconnect());
    return osc;
}
