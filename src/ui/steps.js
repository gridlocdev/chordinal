// What the step grid does (PRD §4): steps painted on and off, accents, the step size, rows added and hidden, the
// preview sound, and switching the editor between the piano roll and the grid as drum clips are selected.
import { effect } from '@preact/signals';
import { findClip, updateClip, updateTrack, isDrums } from '../daw/project.js';
import { stepOf, stepCount, setStep, toggleAccent, addRow, hideRow } from '../daw/steps.js';
import { project, selectedClip, settings, setSettings, playing, picked, beat } from './store.js';
import { playheadStep } from './components/grid-view.js';
import { focus } from './focus.js';
import { edit } from './document.js';
import { press, release } from './live.js';

const PREVIEW_MS = 250;     // how long a step's sound is held when it's turned on while stopped

/**
 * the step of `clip` the playhead is on, or −1 when stopped or outside it. Read inside a computed, its value changes
 * once a step, so the grid redraws on each step rather than on every frame of playback.
 */
export function playingStep(clip)
{
    if (!playing.value || !clip) return -1;
    const p = project.value;
    const linked = clip.pattern ? p.tracks.flatMap(t => t.clips).filter(c => c.pattern === clip.pattern) : [clip];
    return playheadStep(linked, beat.value, stepOf(clip), stepCount(clip));
}

/** the selected clip and its track, or nulls */
export function gridTarget()
{
    const sel = selectedClip.value, p = project.value;
    const track = sel ? p.tracks.find(t => t.id === sel.track) ?? null : null;
    const clip = sel && track ? findClip(p, sel.track, sel.clip) : null;
    return { track, clip };
}

/** the clip's notes changed by fn(notes, step), as one undo step; nothing is recorded when nothing changes (PRD §6.1) */
function changeSteps(trackId, clipId, fn, merge = null)
{
    const c = findClip(project.value, trackId, clipId);
    const notes = c && fn(c.notes, stepOf(c));
    if (!c || notes === c.notes) return;
    edit(p => updateClip(p, trackId, clipId, { notes }), merge);
    // the grid reorders notes, so piano-roll picks (by index) would point at others
    picked.value = new Set();
}

/** one cell set on or off; `merge` makes a drag one undo step (PRD §4.8) */
export const paintStep = (trackId, clipId, key, i, on, merge)=> changeSteps(trackId, clipId, (notes, step)=> setStep(notes, key, i, step, on), merge);

export const accentStep = (trackId, clipId, key, i)=> changeSteps(trackId, clipId, (notes, step)=> toggleAccent(notes, key, i, step));

/** the clip's step size; the size it has already changes nothing (PRD §4.4, §6.1) */
export function setStepSize(trackId, clipId, step)
{
    const c = findClip(project.value, trackId, clipId);
    if (c && stepOf(c) !== step) edit(p => updateClip(p, trackId, clipId, { step }));
}

/** the track's rows changed by fn(track); nothing is recorded when nothing changes */
function changeRows(trackId, fn)
{
    const t = project.value.tracks.find(x => x.id === trackId);
    const next = t && fn(t);
    if (t && next !== t) edit(p => updateTrack(p, trackId, next));
}

export const addGridRow = (trackId, key)=> changeRows(trackId, t => addRow(t, key));

export const hideGridRow = (trackId, key, clip)=> changeRows(trackId, t => hideRow(t, key, clip));

/** the drum heard once, when a step is turned on while stopped (PRD §4.10) */
export function previewStep(key)
{
    if (playing.value) return;
    press(key);
    setTimeout(()=> release(key), PREVIEW_MS);
}

/** the editor follows the selection: the grid for a drum clip, the piano roll for another (PRD §4.2) */
export function startEditorFollow()
{
    let last = null;
    effect(()=>
    {
        const sel = selectedClip.value;
        if (!sel || (last && sel.track === last.track && sel.clip === last.clip)) return;
        last = sel;
        // a clip picked in the piano roll itself (clicking a note in it) keeps the roll (PRD §4.2)
        if (focus.peek() === 'roll') return;
        const track = project.peek().tracks.find(t => t.id === sel.track);
        const tab = settings.peek().editorTab;
        if (!track) return;
        if (tab === 'roll' && isDrums(track)) setSettings({ editorTab: 'grid' });
        else if (tab === 'grid' && !isDrums(track)) setSettings({ editorTab: 'roll' });
    });
}
