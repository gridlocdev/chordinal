// The right-click menus, one for each thing that can be clicked: a clip, an empty stretch of a lane, a track's
// header, the ruler, the chord track, a note, the piano roll's background, a mixer strip, and the browser's
// instruments and takes. The part clicked is selected first, so the menu's commands act on it.
import { TRACK_COLORS, findClip, isDrums } from '@chordinal/daw';
import { renameMarker, removeMarker, markerRange } from '@chordinal/daw';
import { barAt } from '@chordinal/daw';
import { appMenu } from './platform/app-menu.js';
import { cut as cutChord } from '@chordinal/sketch';
import { project, selected, selectedClip, chordRange, settings, setSettings, picked } from './store.js';
import { edit } from './document.js';
import { seek } from './player.js';
import { record, dropTake } from './recording.js';
import { focus } from './focus.js';
import { askText } from './ask.js';
import { pickedNotes, setVelocity, legatoPicked, pickKey, transposePicked, humanizePicked, scalePicked, reversePicked } from './notes.js';
import { paste, clipboard } from './clipboard.js';
import { trackOf, addNewTrack, assignPreset, chooseInstrument, renameTrack, deleteTrack, duplicateTheTrack, moveTrackBy, setTrackColor,
    toggleMute, toggleSolo, setMix, newClipAt, splitClipsAt, joinWithNext, nextClip, setClipBars, quantizeClip,
    transposeClip, loopOver, clipRange, toggleClipMute, humanizeClip, scaleClip, reverseClip, makePatternOf, makeUniqueOf, renamePatternOf } from './tracks.js';
import { item, snapItems, addMarkerAt, COMMANDS } from './commands.js';
import { askTempo, askMeter, askTempoChange, askMeterChange } from './timeline.js';

const COLOR_NAMES = ['Amber', 'Sky', 'Green', 'Pink', 'Violet', 'Orange', 'Grey'];
const sameColor = (a, b)=> a.every((v, i)=> Math.abs(v - b[i]) < 1e-3);

const transposeItems = (by)=> [
    { label: 'Up a Semitone', run: ()=> by(1) },
    { label: 'Down a Semitone', run: ()=> by(-1) },
    { label: 'Up an Octave', run: ()=> by(12) },
    { label: 'Down an Octave', run: ()=> by(-12) },
];

const speedItems = (by)=> [
    { label: 'Double Speed', run: ()=> by(0.5) },
    { label: 'Half Speed', run: ()=> by(2) },
];

const pasteHere = (trackId, at)=> ({ label: 'Paste Here', enabled: !!clipboard.value, run: ()=> paste(at, trackId) });
const playheadHere = (at)=> ({ label: 'Move Playhead Here', run: ()=> seek(at) });

/** items an app adds to every track's menu, after Choose Instrument… (Chordinal's Generate Part…) */
let appTrackItems = (_trackId)=> /** @type {any[]} */ ([]);
export const setTrackItems = (fn)=> { appTrackItems = fn; };

function trackItems(trackId)
{
    const t = trackOf(trackId);
    if (!t) return [];
    const tracks = project.value.tracks, i = tracks.indexOf(t);
    return [
        { label: 'Rename…', run: ()=> renameTrack(trackId) },
        { label: 'Choose Instrument…', run: ()=> chooseInstrument(trackId) },
        ...appTrackItems(trackId),
        { label: 'Color', submenu: TRACK_COLORS.map((c, n)=> ({ label: COLOR_NAMES[n], radio: true, checked: sameColor(c, t.color), run: ()=> setTrackColor(trackId, c) })) },
        '-',
        { label: 'Mute', checked: t.mixer.mute, run: ()=> toggleMute(trackId) },
        { label: 'Solo', checked: t.mixer.solo, run: ()=> toggleSolo(trackId) },
        '-',
        { label: 'Move Up', enabled: i > 0, run: ()=> moveTrackBy(trackId, -1) },
        { label: 'Move Down', enabled: i < tracks.length - 1, run: ()=> moveTrackBy(trackId, 1) },
        '-',
        { label: 'New Track Below', run: ()=> addNewTrack({ after: trackId }) },
        { label: 'Duplicate Track', run: ()=> duplicateTheTrack(trackId) },
        { label: 'Delete Track', run: ()=> deleteTrack(trackId) },
    ];
}

// ── the arrangement ──────────────────────────────────────────────────────────────────────────────────────────────────

/** a clip, at the beat clicked */
export function clipMenu(trackId, clipId, at)
{
    selected.value = trackId;
    focus.value = 'arrange';
    selectedClip.value = { track: trackId, clip: clipId };
    const c = findClip(project.value, trackId, clipId);
    const bars = c ? c.beats / barAt(project.value.meters, c.start).beatsPerBar : 0;
    const inside = c && at > c.start + 1e-6 && at < c.start + c.beats - 1e-6;
    appMenu.popup([
        { label: 'Open in Piano Roll', run: ()=> setSettings({ editorTab: 'roll' }) },
        ...(isDrums(trackOf(trackId)) ? [{ label: 'Open in Step Grid', run: ()=> setSettings({ editorTab: 'grid' }) }] : []),
        '-',
        item('cut'), item('copy'), item('paste', { label: 'Paste at Playhead' }), item('duplicate'), item('delete'),
        '-',
        { label: 'Split Here', enabled: !!inside, run: ()=> splitClipsAt(barSnap(at), trackId) },
        item('split'),
        { label: 'Join with Next Clip', enabled: !!nextClip(trackId, clipId), run: ()=> joinWithNext(trackId, clipId) },
        { label: 'Mute Clip', checked: !!c?.mute, run: ()=> toggleClipMute(trackId, clipId) },
        '-',
        ...(c?.pattern ? [{ label: 'Rename Pattern…', run: ()=> renamePatternOf(trackId, clipId) }, { label: 'Make Unique', run: ()=> makeUniqueOf(trackId, clipId) }]
            : [{ label: 'Make Pattern', accelerator: 'CmdOrCtrl+P', run: ()=> makePatternOf(trackId, clipId) }]),
        '-',
        { label: 'Quantize Notes', run: ()=> quantizeClip(trackId, clipId) },
        { label: 'Humanize', run: ()=> humanizeClip(trackId, clipId) },
        { label: 'Speed', submenu: speedItems(k => scaleClip(trackId, clipId, k)) },
        { label: 'Reverse', run: ()=> reverseClip(trackId, clipId) },
        { label: 'Transpose', submenu: transposeItems(by => transposeClip(trackId, clipId, by)) },
        { label: 'Length', submenu: [1, 2, 4, 8, 16].map(n => ({ label: `${n} bar${n > 1 ? 's' : ''}`, radio: true, checked: Math.abs(bars - n) < 1e-6, run: ()=> setClipBars(trackId, clipId, n) })) },
        '-',
        { label: 'Loop This Clip', run: ()=> loopOver(clipRange(trackId, clipId)) },
        item('newFromMelody'),
    ]);
}

/** a beat snapped to the grid */
const barSnap = (b)=> Math.round(b / settings.value.grid) * settings.value.grid;

/** an empty stretch of a track's lane */
export function laneMenu(trackId, at)
{
    selected.value = trackId;
    selectedClip.value = null;
    focus.value = 'arrange';
    appMenu.popup([
        { label: 'New Clip Here', run: ()=> newClipAt(trackId, at) },
        pasteHere(trackId, barAt(project.value.meters, at).start),
        playheadHere(at),
        '-',
        ...trackItems(trackId),
    ]);
}

/** a track's header */
export function trackContextMenu(trackId)
{
    selected.value = trackId;
    appMenu.popup(trackItems(trackId));
}

/** the ruler, at a beat: the playhead, markers and the loop */
export function rulerMenu(at)
{
    const p = project.value;
    const i = p.markers.findLastIndex(m => m.beat <= at + 1e-6);
    const m = p.markers[i];
    const bar = barAt(p.meters, at).start;
    appMenu.popup([
        playheadHere(at),
        { label: 'Add Marker Here…', run: ()=> addMarkerAt(bar) },
        ...(m ? [
            '-',
            { label: `Rename “${m.name}”…`, run: async ()=> { const name = await askText('Marker name', m.name, 'Rename'); if (name) edit(q => renameMarker(q, i, name)); } },
            { label: `Loop “${m.name}”`, run: ()=> loopOver(markerRange(p, i)) },
            { label: `Delete “${m.name}”`, run: ()=> edit(q => removeMarker(q, i)) },
        ] : []),
        '-',
        { label: 'Loop This Bar', run: ()=> loopOver({ from: bar, to: bar + barAt(p.meters, at).beatsPerBar }) },
        { label: 'Loop Off', enabled: !!p.loop, run: ()=> loopOver(null) },
        '-',
        item('insertBars', { run: ()=> { seek(bar); COMMANDS.insertBars.run(); } }),
        item('deleteBars', { run: ()=> { seek(bar); COMMANDS.deleteBars.run(); } }),
        '-',
        { label: 'Tempo Change Here…', run: ()=> askTempoChange(bar) },
        { label: 'Meter Change Here…', run: ()=> askMeterChange(bar) },
        { label: 'Tempo…', run: askTempo },
        { label: 'Meter…', run: askMeter },
    ]);
}

/** the chord track, at a beat */
export function chordMenu(at)
{
    const p = project.value;
    focus.value = 'chords';
    const chord = p.chords.find(c => at >= c.beat && at < c.beat + c.beats);
    const bar = barAt(p.meters, at);
    const range = chordRange.value && at >= chordRange.value.beat && at < chordRange.value.beat + chordRange.value.beats ? chordRange.value
        : chord ? { beat: chord.beat, beats: chord.beats } : { beat: bar.start, beats: bar.beatsPerBar };
    chordRange.value = range;
    appMenu.popup([
        { label: 'Whistle a Chord Here', run: ()=> { chordRange.value = range; record(); } },
        { label: 'Delete Chords Here', enabled: p.chords.some(c => c.beat < range.beat + range.beats && c.beat + c.beats > range.beat),
            run: ()=> edit(q => ({ ...q, chords: q.chords.flatMap(c => cutChord(c, range.beat, range.beat + range.beats)) })) },
        '-',
        { label: 'Loop This Stretch', run: ()=> loopOver({ from: range.beat, to: range.beat + range.beats }) },
        playheadHere(at),
    ]);
}

// ── the piano roll ───────────────────────────────────────────────────────────────────────────────────────────────────

/** the picked notes (the one clicked is picked first) */
export function noteMenu()
{
    focus.value = 'roll';
    const list = pickedNotes();
    const vel = list.length && list.every(o => o.n.vel === list[0].n.vel) ? list[0].n.vel : null;
    appMenu.popup([
        item('cut'), item('copy'), item('duplicate'), item('delete'),
        '-',
        item('quantize'),
        { label: 'Transpose', submenu: transposeItems(transposePicked) },
        { label: 'Velocity', submenu: [32, 56, 80, 100, 120, 127].map(v => ({ label: String(v), radio: true, checked: vel === v, run: ()=> setVelocity(v) })) },
        { label: 'Legato', enabled: list.length > 1, run: legatoPicked },
        { label: 'Humanize', run: humanizePicked },
        { label: 'Speed', submenu: speedItems(scalePicked) },
        { label: 'Reverse', run: reversePicked },
        '-',
        item('selectAll'),
        { label: 'Select Same Pitch', run: ()=> pickKey(list[0].n.key) },
        { label: 'Snap', submenu: snapItems() },
    ]);
}

/** the piano roll's background, at a beat, on a track */
export function rollMenu(trackId, at)
{
    focus.value = 'roll';
    picked.value = new Set();
    appMenu.popup([
        pasteHere(trackId, Math.round(at / settings.value.grid) * settings.value.grid),
        item('selectAll'),
        { label: 'Snap', submenu: snapItems() },
        '-',
        playheadHere(at),
        item('newFromMelody'),
    ]);
}

// ── the mixer ────────────────────────────────────────────────────────────────────────────────────────────────────────

export function stripMenu(trackId)
{
    selected.value = trackId;
    const t = trackOf(trackId);
    if (!t) return;
    appMenu.popup([
        { label: 'Reset Volume to 0 dB', enabled: t.mixer.volumeDb !== 0, run: ()=> setMix(trackId, { volumeDb: 0 }) },
        { label: 'Center Pan', enabled: t.mixer.pan !== 0, run: ()=> setMix(trackId, { pan: 0 }) },
        '-',
        ...trackItems(trackId),
    ]);
}

// ── the browser ──────────────────────────────────────────────────────────────────────────────────────────────────────

export function presetMenu(preset)
{
    const t = trackOf(selected.value);
    appMenu.popup([
        { label: t ? `Put on ${t.name}` : 'Put on the Selected Track', enabled: !!t, run: ()=> assignPreset(t.id, preset) },
        { label: 'New Track with It', run: ()=> addNewTrack({ instrument: { bank: preset.bank, program: preset.program }, after: selected.value }) },
    ]);
}

export function takeMenu(file, at)
{
    const t = trackOf(selected.value);
    appMenu.popup([
        { label: t ? `Read onto ${t.name} at the Playhead` : 'Read onto the Selected Track', enabled: !!t, run: ()=> dropTake(t.id, file, at) },
        { label: 'Read onto a New Track', run: ()=> { const id = addNewTrack({ instrument: { bank: 0, program: 73 }, after: selected.value }); dropTake(id, file, at); } },
    ]);
}

/** text fields get the usual edit menu */
export function textMenu()
{
    appMenu.popup([
        { label: 'Cut', text: 'cut', native: true }, { label: 'Copy', text: 'copy', native: true }, { label: 'Paste', text: 'paste', native: true },
        '-',
        { label: 'Select All', text: 'selectAll', native: true },
    ]);
}
