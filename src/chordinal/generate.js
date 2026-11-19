// Generate Part… (Chordinal PRD §8): the composer writes one part into a new clip on the selected track, over the
// selection, the loop or the whole project, in the project's tempo, meter and key, following its chords. One undo
// step; Generate Again replaces the last generated clip while it is untouched.
import { signal } from '@preact/signals';
import { barAt, beatsPerBar } from '../daw/meter.js';
import { bpmAt } from '../lib/tempo-map.js';
import { addTrack, makeTrack, addClip, removeClip, findClip, newId, isDrums, makePattern, nextPatternName, projectEnd } from '../daw/project.js';
import { composePart, PARTS } from '../composer/part.js';
import { project, selected, selectedClip, chordRange } from '../ui/store.js';
import { edit } from '../ui/document.js';
import { appDialog } from '../ui/dialogs.js';
import { trackOf } from '../ui/tracks.js';

export { PARTS };

/** the dialog, when open: the track it writes on (null: a new one) */
export const generating = signal(/** @type {{ trackId: string|null }|null} */ (null));

/** the clips generated, newest last, for Generate Again: where each is, and the clip as it was made (an undo brings an
 * earlier one back as it was) */
const made = /** @type {{ trackId: string, clipId: string, clip: any }[]} */ ([]);
const KEEP = 50;

export function openGenerate(trackId = selected.value)
{
    generating.value = { trackId: trackId && trackOf(trackId) ? trackId : null };
    appDialog.value = true;
}

export function closeGenerate()
{
    generating.value = null;
    appDialog.value = false;
}

/** the part a track's dialog starts on: drums on a drum track, the melody otherwise */
export const defaultPart = (track)=> track && isDrums(track) ? 'drums' : 'melody';

/** the ranges to write over, those that exist, in the order the dialog offers them (the first is the default) */
export function rangeChoices(p = project.value)
{
    const out = [];
    const c = selectedClip.value, clip = c && findClip(p, c.track, c.clip);
    const sel = chordRange.value ? { from: chordRange.value.beat, to: chordRange.value.beat + chordRange.value.beats }
        : clip ? { from: clip.start, to: clip.start + clip.beats } : null;
    if (sel && sel.to > sel.from) out.push({ id: 'selection', label: 'Selection', range: sel });
    if (p.loop && p.loop.to > p.loop.from) out.push({ id: 'loop', label: 'Loop', range: p.loop });
    out.push({ id: 'project', label: 'Whole project', range: { from: 0, to: Math.max(projectEnd(p), beatsPerBar(p.meters[0].sig)) } });
    return out;
}

/** the newest generated clip still there as it was made, on this track (any track for null) */
const lastMade = (trackId)=> made.findLast(m => (trackId == null || m.trackId === trackId) && findClip(project.value, m.trackId, m.clipId) === m.clip) ?? null;

/** whether Generate Again has a clip to replace */
export const canAgain = (trackId)=> !!lastMade(trackId);

/**
 * Writes the part.
 * @param {{ part: string, style: string, seed: string, range: { from: number, to: number }, trackId: string|null,
 *   key?: { tonic: number, mode: string } }} request  key: when the project has none
 * @param {{ again?: boolean }} [how]  again: replaces the last generated clip
 * @returns {{ ok: true, trackId: string, clipId: string } | { ok: false, message: string }}
 */
export function generatePart(request, { again = false } = {})
{
    const p = project.value;
    const { from } = request.range;
    const bar = barAt(p.meters, from);
    const meter = p.meters.findLast(m => m.beat <= from + 1e-9)?.sig ?? p.meters[0].sig;
    const bars = Math.max(1, Math.round((request.range.to - from) / bar.beatsPerBar));
    const key = p.key ?? request.key ?? { tonic: 0, mode: 'major' };
    const to = from + bars * bar.beatsPerBar;
    const under = p.chords.filter(c => c.beat < to - 1e-9 && c.beat + c.beats > from + 1e-9);
    const result = composePart({ part: /** @type {any} */ (request.part), style: request.style, seed: request.seed,
        tempo: Math.round(bpmAt(p.tempoMap, from)), meter, tonic: key.tonic, mode: key.mode, bars,
        chords: under.map(c => ({ ...c, beat: c.beat - from })) });
    if (!result.ok) return result;

    const replacing = again ? lastMade(request.trackId) : null;
    let trackId = replacing?.trackId ?? request.trackId, clipId = '';
    edit(q =>
    {
        let out = replacing ? removeClip(q, replacing.trackId, replacing.clipId) : q;
        if (!trackId || !out.tracks.some(t => t.id === trackId))
        {
            const t = makeTrack(out, { name: result.name, instrument: result.instrument });
            trackId = t.id;
            out = addTrack(out, t, out.tracks.length);
        }
        clipId = newId(out, 'c');
        out = addClip(out, trackId, { id: clipId, start: from, beats: result.beats, notes: result.notes });
        const t = out.tracks.find(x => x.id === trackId);
        if (isDrums(t)) out = makePattern(out, trackId, clipId, nextPatternName(out, t.name));
        // no chords there: the ones the part was written over go on the chord track, for the parts that follow chords
        if (!under.length && request.part !== 'drums')
            out = { ...out, chords: [...out.chords, ...result.chords.map(c => ({ ...c, beat: c.beat + from }))].sort((a, b)=> a.beat - b.beat) };
        return out;
    });
    made.push({ trackId, clipId, clip: findClip(project.value, trackId, clipId) });
    if (made.length > KEEP) made.shift();
    selected.value = trackId;
    selectedClip.value = { track: trackId, clip: clipId };
    return { ok: true, trackId, clipId };
}
