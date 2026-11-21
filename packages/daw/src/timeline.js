// A project's timeline: the base tempo and meter, tempo and meter changes, the loop, markers, and time put in or
// taken out across everything at once. Pure edits returning a new project, like project.js.
import { splitAt, projectEnd } from './project.js';

/** a new base tempo: the whole tempo map is scaled, so ramps and changes keep their shape */
export function setTempo(p, bpm)
{
    const k = bpm / p.tempoMap[0].bpm;
    // the first tempo is the one asked for; the rest scale with it, kept fine enough that changing the tempo back and
    // forth doesn't drift them (rounding them to hundredths did)
    const scale = (x)=> Math.round(x * k * 1e6) / 1e6;
    return { ...p, tempoMap: p.tempoMap.map((s, i)=> ({ ...s, bpm: i === 0 ? bpm : scale(s.bpm), ...(s.to !== undefined ? { to: scale(s.to) } : {}) })) };
}

/** the meter from the start, until the first change after it */
export const setMeter = (p, sig)=> ({ ...p, meters: p.meters.map((m, i)=> i === 0 ? { ...m, sig } : m) });

const sameBeat = (a, b)=> Math.abs(a - b) < 1e-6;

/**
 * a tempo change at a beat, or a new tempo for the one there; a ramp into it from the change before follows it
 * @param {{ ramp?: boolean }} [options]  ramp: from here to the next change (false: hold)
 */
export function setTempoAt(p, beat, bpm, { ramp } = {})
{
    const i = p.tempoMap.findIndex(s => sameBeat(s.beat, beat));
    const old = p.tempoMap[i];
    let seg = { ...(old ?? { beat: Math.max(0, beat) }), bpm };
    if (ramp === false) { const { to, ...held } = seg; seg = held; }
    const list = (old ? p.tempoMap.map(s => s === old ? seg : s) : [...p.tempoMap, seg]).sort((a, b)=> a.beat - b.beat);
    const at = list.indexOf(seg), before = list[at - 1];
    if (old && before?.to !== undefined && Math.abs(before.to - old.bpm) < 1e-6) list[at - 1] = { ...before, to: bpm };
    if (ramp && list[at + 1]) list[at] = { ...seg, to: list[at + 1].bpm };
    return { ...p, tempoMap: list };
}

/** takes out a tempo change after the first; the tempo before it holds on */
export const removeTempoChange = (p, index)=> index > 0 ? { ...p, tempoMap: p.tempoMap.filter((_, i)=> i !== index) } : p;

/** a meter change at a beat (a bar line), or a new meter for the one there */
export function setMeterAt(p, beat, sig)
{
    const i = p.meters.findIndex(m => sameBeat(m.beat, beat));
    const meters = i >= 0 ? p.meters.map((m, k)=> k === i ? { ...m, sig } : m) : [...p.meters, { beat: Math.max(0, beat), sig }].sort((a, b)=> a.beat - b.beat);
    return { ...p, meters };
}

/** takes out a meter change after the first; the meter before it holds on */
export const removeMeterChange = (p, index)=> index > 0 ? { ...p, meters: p.meters.filter((_, i)=> i !== index) } : p;

/** loops the playback between two beats, or stops looping with null */
export const setLoop = (p, loop)=> ({ ...p, loop: loop && loop.to > loop.from ? { from: Math.max(0, loop.from), to: loop.to } : null });

/** a marker at a beat; one splitting a section takes that section's meta, so a MIDI FX reads both halves alike */
export function addMarker(p, beat, name)
{
    const before = p.markers.findLast(m => m.beat <= beat);
    if (before?.beat === beat) return p;
    const marker = { beat, name, ...(before?.meta && { meta: before.meta }) };
    return { ...p, markers: [...p.markers, marker].sort((a, b)=> a.beat - b.beat) };
}

export const renameMarker = (p, index, name)=> ({ ...p, markers: p.markers.map((m, i)=> i === index ? { ...m, name } : m) });

export const removeMarker = (p, index)=> ({ ...p, markers: p.markers.filter((_, i)=> i !== index) });

/** the stretch a marker heads: to the next marker, or the project's end */
export function markerRange(p, index)
{
    const m = p.markers[index];
    return m ? { from: m.beat, to: p.markers[index + 1]?.beat ?? projectEnd(p) } : null;
}

/** chords cut at a beat, where one spans it */
const splitChords = (chords, at)=> chords.flatMap(c => c.beat < at - 1e-9 && c.beat + c.beats > at + 1e-9
    ? [{ ...c, beats: at - c.beat }, { ...c, beat: at, beats: c.beat + c.beats - at }] : [c]);

/** everything in the project at a beat or after it, moved on by `beats` (or back, for a negative): clips, notes,
 * markers, chords, tempo and meter changes, automation and the loop. Nothing at beat 0's tempo or meter moves. */
function shiftFrom(p, at, by)
{
    const move = (b)=> b >= at - 1e-9 ? b + by : b;
    const keepFirst = (list)=> list.map((x, i)=> i === 0 ? x : { ...x, beat: move(x.beat) });
    return {
        ...p,
        length: Math.max(0, p.length + by),
        tempoMap: keepFirst(p.tempoMap),
        meters: keepFirst(p.meters),
        markers: p.markers.map(m => ({ ...m, beat: move(m.beat) })),
        chords: p.chords.map(c => ({ ...c, beat: move(c.beat) })),
        loop: p.loop && { from: move(p.loop.from), to: move(p.loop.to) },
        tracks: p.tracks.map(t => ({
            ...t,
            clips: t.clips.map(c => ({ ...c, start: move(c.start) })),
            automation: Object.fromEntries(Object.entries(t.automation).map(([k, frames])=> [k, frames.map(f => ({ ...f, beat: move(f.beat) }))])),
        })),
    };
}

/** empty time put in at a beat, `beats` long: what was there and after moves on, a clip across it is cut in two */
export function insertTime(p, at, beats)
{
    if (beats <= 0) return p;
    const cut = { ...splitAt(p, at), chords: splitChords(p.chords, at) };
    return shiftFrom(cut, at, beats);
}

/** a tempo map or meter list with the changes inside [from, to) taken out; the last of them moves to `to`, so what
 * follows the stretch keeps the tempo or meter it had, unless a change is already there */
function carryChanges(list, from, to)
{
    const inside = (b)=> b >= from - 1e-9 && b < to - 1e-9;
    const last = list.findLast(x => inside(x.beat));
    const kept = list.filter(x => !inside(x.beat));
    if (!last || kept.some(x => Math.abs(x.beat - to) < 1e-9)) return kept.length ? kept : [last];
    return [...kept, { ...last, beat: to }].sort((a, b)=> a.beat - b.beat);
}

/** the time from one beat to another taken out: what was in it goes, what was after moves back */
export function deleteTime(p, from, to)
{
    if (to <= from) return p;
    const len = to - from, inside = (b)=> b >= from - 1e-9 && b < to - 1e-9;
    let q = splitAt(splitAt(p, from), to);
    q = {
        ...q,
        chords: splitChords(splitChords(q.chords, from), to).filter(c => !inside(c.beat)),
        markers: q.markers.filter(m => !inside(m.beat)),
        tempoMap: carryChanges(q.tempoMap, from, to),
        meters: carryChanges(q.meters, from, to),
        // a loop end inside the stretch comes back to its start
        loop: q.loop && { from: inside(q.loop.from) ? to : q.loop.from, to: inside(q.loop.to) ? from + len : q.loop.to },
        tracks: q.tracks.map(t => ({
            ...t,
            clips: t.clips.filter(c => !inside(c.start)),
            automation: Object.fromEntries(Object.entries(t.automation).map(([k, frames])=> [k, frames.filter(f => !inside(f.beat))])),
        })),
    };
    const out = shiftFrom(q, to, -len);
    // shiftFrom keeps the first change where it is; after deleting from the start, it opens the project again
    const opening = (list)=> list.map((x, i)=> i === 0 ? { ...x, beat: 0 } : x);
    return { ...out, tempoMap: opening(out.tempoMap), meters: opening(out.meters), length: Math.max(0, p.length - Math.max(0, Math.min(p.length, to) - from)), loop: out.loop && out.loop.to - out.loop.from > 1e-9 ? out.loop : null };
}
