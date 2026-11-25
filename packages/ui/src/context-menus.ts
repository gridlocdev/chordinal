// The right-click menus, one for each thing that can be clicked: a clip, an audio clip, an empty stretch of a lane, a track's
// header, the ruler, a note, the piano roll's background, a mixer strip, and the browser's
// instruments and takes. The part clicked is selected first, so the menu's commands act on it.
import { TRACK_COLORS, audioClipEnd, findAudioClip, findClip, isDrums } from '@chordinal/daw';
import { renameMarker, removeMarker, markerRange } from '@chordinal/daw';
import { barAt, laneParam, removeKeyframe, setKeyframeCurve, clearLane } from '@chordinal/daw';
import type { LaneId } from '@chordinal/daw';
import { shownLanes, toggleAutomation } from './automation.ts';
import { appMenu } from './platform/app-menu.ts';
import type { MenuEntry, MenuItem } from './platform/app-menu.ts';
import { project, selected, selectedClip, selectedAudio, settings, setSettings, picked } from './store.ts';
import { edit } from './document.ts';
import { seek } from './player.ts';
import { dropTake } from './recording.ts';
import { focus } from './focus.ts';
import { askText } from './ask.ts';
import {
  pickedNotes,
  setVelocity,
  legatoPicked,
  pickKey,
  transposePicked,
  humanizePicked,
  scalePicked,
  reversePicked,
} from './notes.ts';
import { paste, clipboard } from './clipboard.ts';
import {
  AUDIO_GAINS_DB,
  audioClipRange,
  audioGainDb,
  setAudioGain,
  toggleAudioMute,
} from './audio-tracks.ts';
import { convertDialog, sourceOf } from './recording.ts';
import {
  trackOf,
  addNewTrack,
  assignPreset,
  chooseInstrument,
  renameTrack,
  deleteTrack,
  duplicateTheTrack,
  moveTrackBy,
  setTrackColor,
  toggleMute,
  toggleSolo,
  setMix,
  newClipAt,
  splitClipsAt,
  joinWithNext,
  nextClip,
  setClipBars,
  quantizeClip,
  transposeClip,
  loopOver,
  clipRange,
  toggleClipMute,
  humanizeClip,
  scaleClip,
  reverseClip,
  makePatternOf,
  makeUniqueOf,
  renamePatternOf,
} from './tracks.ts';
import { item, snapItems, addMarkerAt, catalog } from './commands.ts';
import { askTempo, askMeter, askTempoChange, askMeterChange } from './timeline.ts';
import type { InstrumentRef } from './tracks.ts';

const COLOR_NAMES = ['Amber', 'Sky', 'Green', 'Pink', 'Violet', 'Orange', 'Grey'];
const sameColor = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - (b[i] ?? NaN)) < 1e-3);

const transposeItems = (by: (semitones: number) => unknown): MenuItem[] => [
  { label: 'Up a Semitone', run: () => by(1) },
  { label: 'Down a Semitone', run: () => by(-1) },
  { label: 'Up an Octave', run: () => by(12) },
  { label: 'Down an Octave', run: () => by(-12) },
];

const speedItems = (by: (k: number) => unknown): MenuItem[] => [
  { label: 'Double Speed', run: () => by(0.5) },
  { label: 'Half Speed', run: () => by(2) },
];

const pasteHere = (trackId: string, at: number): MenuItem => ({
  label: 'Paste Here',
  enabled: !!clipboard.value,
  run: () => paste(at, trackId),
});
const playheadHere = (at: number): MenuItem => ({ label: 'Move Playhead Here', run: () => seek(at) });

/** items an app adds to every track's menu, after Choose Instrument… (Chordinal's Record Melody) */
let appTrackItems: (trackId: string) => MenuEntry[] = () => [];
export const setTrackItems = (fn: (trackId: string) => MenuEntry[]): void => {
  appTrackItems = fn;
};

function trackItems(trackId: string): MenuEntry[] {
  const t = trackOf(trackId);
  if (!t) return [];
  const tracks = project.value.tracks,
    i = tracks.indexOf(t);
  return [
    { label: 'Rename…', run: () => renameTrack(trackId) },
    { label: 'Choose Instrument…', run: () => chooseInstrument(trackId) },
    ...appTrackItems(trackId),
    {
      label: 'Color',
      submenu: TRACK_COLORS.map((c, n) => ({
        label: COLOR_NAMES[n] ?? `Color ${n + 1}`,
        radio: true,
        checked: sameColor(c, t.color),
        run: () => setTrackColor(trackId, c),
      })),
    },
    '-',
    { label: 'Mute', checked: t.mixer.mute, run: () => toggleMute(trackId) },
    { label: 'Solo', checked: t.mixer.solo, run: () => toggleSolo(trackId) },
    { label: 'Show Automation', checked: !!shownLanes.value[trackId], run: () => toggleAutomation(trackId) },
    '-',
    { label: 'Move Up', enabled: i > 0, run: () => moveTrackBy(trackId, -1) },
    { label: 'Move Down', enabled: i < tracks.length - 1, run: () => moveTrackBy(trackId, 1) },
    '-',
    { label: 'New Track Below', run: () => addNewTrack({ after: trackId }) },
    { label: 'Duplicate Track', run: () => duplicateTheTrack(trackId) },
    { label: 'Delete Track', run: () => deleteTrack(trackId) },
  ];
}

// ── the arrangement ──────────────────────────────────────────────────────────────────────────────────────────────────

/** a clip, at the beat clicked */
export function clipMenu(trackId: string, clipId: string, at: number): void {
  selected.value = trackId;
  focus.value = 'arrange';
  selectedClip.value = { track: trackId, clip: clipId };
  const c = findClip(project.value, trackId, clipId);
  const bars = c ? c.beats / barAt(project.value.meters, c.start).beatsPerBar : 0;
  const inside = c && at > c.start + 1e-6 && at < c.start + c.beats - 1e-6;
  appMenu.popup([
    { label: 'Open in Piano Roll', run: () => setSettings({ editorTab: 'roll' }) },
    ...(isDrumTrack(trackId)
      ? [{ label: 'Open in Step Grid', run: () => setSettings({ editorTab: 'grid' }) }]
      : []),
    '-',
    item('cut'),
    item('copy'),
    item('paste', { label: 'Paste at Playhead' }),
    item('duplicate'),
    item('delete'),
    '-',
    { label: 'Split Here', enabled: !!inside, run: () => splitClipsAt(barSnap(at), trackId) },
    item('split'),
    {
      label: 'Join with Next Clip',
      enabled: !!nextClip(trackId, clipId),
      run: () => joinWithNext(trackId, clipId),
    },
    { label: 'Mute Clip', checked: !!c?.mute, run: () => toggleClipMute(trackId, clipId) },
    '-',
    ...(c?.pattern
      ? [
          { label: 'Rename Pattern…', run: () => renamePatternOf(trackId, clipId) },
          { label: 'Make Unique', run: () => makeUniqueOf(trackId, clipId) },
        ]
      : [item('makePattern', { run: () => makePatternOf(trackId, clipId) })]),
    '-',
    ...(sourceOf(trackId, clipId)
      ? [
          {
            label: 'Convert Audio Again…',
            run: () => (convertDialog.value = { track: trackId, clip: clipId }),
          },
        ]
      : []),
    { label: 'Quantize Notes', run: () => quantizeClip(trackId, clipId) },
    { label: 'Humanize', run: () => humanizeClip(trackId, clipId) },
    { label: 'Speed', submenu: speedItems((k) => scaleClip(trackId, clipId, k)) },
    { label: 'Reverse', run: () => reverseClip(trackId, clipId) },
    { label: 'Transpose', submenu: transposeItems((by) => transposeClip(trackId, clipId, by)) },
    {
      label: 'Length',
      submenu: [1, 2, 4, 8, 16].map((n) => ({
        label: `${n} bar${n > 1 ? 's' : ''}`,
        radio: true,
        checked: Math.abs(bars - n) < 1e-6,
        run: () => setClipBars(trackId, clipId, n),
      })),
    },
    '-',
    { label: 'Loop This Clip', run: () => loopOver(clipRange(trackId, clipId)) },
  ]);
}

/** an audio clip, at the beat clicked (PRD §16.6) */
export function audioClipMenu(trackId: string, clipId: string, at: number): void {
  selected.value = trackId;
  focus.value = 'arrange';
  selectedAudio.value = { track: trackId, clip: clipId };
  const c = findAudioClip(project.value, trackId, clipId);
  if (!c) return;
  const end = audioClipEnd(project.value.tempoMap, c);
  const inside = at > c.start + 1e-6 && at < end - 1e-6;
  const db = audioGainDb(c);
  appMenu.popup([
    item('cut'),
    item('copy'),
    item('paste', { label: 'Paste at Playhead' }),
    item('duplicate'),
    item('delete'),
    '-',
    { label: 'Split Here', enabled: inside, run: () => splitClipsAt(at, trackId) },
    item('split'),
    { label: 'Mute Clip', checked: !!c.mute, run: () => toggleAudioMute(trackId, clipId) },
    '-',
    {
      label: 'Gain',
      submenu: AUDIO_GAINS_DB.map((g) => ({
        label: g > 0 ? `+${g} dB` : `${g} dB`,
        radio: true,
        checked: Math.abs(db - g) < 0.05,
        run: () => setAudioGain(trackId, clipId, g),
      })),
    },
    '-',
    { label: 'Loop This Clip', run: () => loopOver(audioClipRange(trackId, clipId)) },
  ]);
}

/** an empty stretch of an audio track's lane */
export function audioLaneMenu(trackId: string, at: number): void {
  selected.value = trackId;
  selectedAudio.value = null;
  focus.value = 'arrange';
  appMenu.popup([
    { ...pasteHere(trackId, at), enabled: clipboard.value?.kind === 'audio' },
    playheadHere(at),
  ]);
}

const isDrumTrack = (trackId: string) => {
  const t = trackOf(trackId);
  return !!t && isDrums(t);
};

/** a beat snapped to the grid */
const barSnap = (b: number) => Math.round(b / settings.value.grid) * settings.value.grid;

/** an empty stretch of a track's lane */
export function laneMenu(trackId: string, at: number): void {
  selected.value = trackId;
  selectedClip.value = null;
  focus.value = 'arrange';
  appMenu.popup([
    { label: 'New Clip Here', run: () => newClipAt(trackId, at) },
    pasteHere(trackId, barAt(project.value.meters, at).start),
    playheadHere(at),
    '-',
    ...trackItems(trackId),
  ]);
}

/** a track's automation lane: the point under the cursor (by index, or none), its curve, and the lane */
export function automationMenu(trackId: string, lane: LaneId, index: number | null): void {
  selected.value = trackId;
  focus.value = 'arrange';
  const param = laneParam(lane, trackOf(trackId) ?? undefined);
  const frame = index === null ? undefined : trackOf(trackId)?.automation[lane]?.[index];
  const curve = (label: string, c: 'set' | 'linear' | 'exp'): MenuItem => ({
    label,
    radio: true,
    enabled: !!frame && (c !== 'exp' || param.exp),
    checked: frame?.curve === c,
    run: () => index !== null && edit((p) => setKeyframeCurve(p, trackId, lane, index, c)),
  });
  appMenu.popup([
    {
      label: 'Delete Point',
      enabled: !!frame,
      run: () => index !== null && edit((p) => removeKeyframe(p, trackId, lane, index)),
    },
    '-',
    curve('Step', 'set'),
    curve('Linear', 'linear'),
    curve('Exponential', 'exp'),
    '-',
    {
      label: `Clear ${param.label} Lane`,
      enabled: !!trackOf(trackId)?.automation[lane]?.length,
      run: () => edit((p) => clearLane(p, trackId, lane)),
    },
    { label: 'Hide Automation', run: () => toggleAutomation(trackId) },
  ]);
}

/** a track's header */
export function trackContextMenu(trackId: string): void {
  selected.value = trackId;
  appMenu.popup(trackItems(trackId));
}

/** the ruler, at a beat: the playhead, markers and the loop */
export function rulerMenu(at: number): void {
  const p = project.value;
  const i = p.markers.findLastIndex((m) => m.beat <= at + 1e-6);
  const m = p.markers[i];
  const bar = barAt(p.meters, at).start;
  appMenu.popup([
    playheadHere(at),
    { label: 'Add Marker Here…', run: () => addMarkerAt(bar) },
    ...(m
      ? ([
          '-',
          {
            label: `Rename “${m.name}”…`,
            run: async () => {
              const name = await askText('Marker name', m.name, 'Rename');
              if (name) edit((q) => renameMarker(q, i, name));
            },
          },
          { label: `Loop “${m.name}”`, run: () => loopOver(markerRange(p, i)) },
          { label: `Delete “${m.name}”`, run: () => edit((q) => removeMarker(q, i)) },
        ] satisfies MenuEntry[])
      : []),
    '-',
    { label: 'Loop This Bar', run: () => loopOver({ from: bar, to: bar + barAt(p.meters, at).beatsPerBar }) },
    { label: 'Loop Off', enabled: !!p.loop, run: () => loopOver(null) },
    '-',
    item('insertBars', {
      run: () => {
        seek(bar);
        catalog.get('insertBars')?.run();
      },
    }),
    item('deleteBars', {
      run: () => {
        seek(bar);
        catalog.get('deleteBars')?.run();
      },
    }),
    '-',
    { label: 'Tempo Change Here…', run: () => askTempoChange(bar) },
    { label: 'Meter Change Here…', run: () => askMeterChange(bar) },
    { label: 'Tempo…', run: askTempo },
    { label: 'Meter…', run: askMeter },
  ]);
}

// ── the piano roll ───────────────────────────────────────────────────────────────────────────────────────────────────

/** the picked notes (the one clicked is picked first) */
export function noteMenu(): void {
  focus.value = 'roll';
  const list = pickedNotes(),
    first = list[0];
  const vel = first && list.every((o) => o.n.vel === first.n.vel) ? first.n.vel : null;
  appMenu.popup([
    item('cut'),
    item('copy'),
    item('duplicate'),
    item('delete'),
    '-',
    item('quantize'),
    { label: 'Transpose', submenu: transposeItems(transposePicked) },
    {
      label: 'Velocity',
      submenu: [32, 56, 80, 100, 120, 127].map((v) => ({
        label: String(v),
        radio: true,
        checked: vel === v,
        run: () => setVelocity(v),
      })),
    },
    { label: 'Legato', enabled: list.length > 1, run: legatoPicked },
    { label: 'Humanize', run: humanizePicked },
    { label: 'Speed', submenu: speedItems(scalePicked) },
    { label: 'Reverse', run: reversePicked },
    '-',
    item('selectAll'),
    {
      label: 'Select Same Pitch',
      run: () => {
        if (first) pickKey(first.n.key);
      },
    },
    { label: 'Snap', submenu: snapItems() },
  ]);
}

/** the piano roll's background, at a beat, on a track */
export function rollMenu(trackId: string, at: number): void {
  focus.value = 'roll';
  picked.value = new Set();
  appMenu.popup([
    pasteHere(trackId, Math.round(at / settings.value.grid) * settings.value.grid),
    item('selectAll'),
    { label: 'Snap', submenu: snapItems() },
    '-',
    playheadHere(at),
  ]);
}

// ── the mixer ────────────────────────────────────────────────────────────────────────────────────────────────────────

export function stripMenu(trackId: string): void {
  selected.value = trackId;
  const t = trackOf(trackId);
  if (!t) return;
  appMenu.popup([
    {
      label: 'Reset Volume to 0 dB',
      enabled: t.mixer.volumeDb !== 0,
      run: () => setMix(trackId, { volumeDb: 0 }),
    },
    { label: 'Center Pan', enabled: t.mixer.pan !== 0, run: () => setMix(trackId, { pan: 0 }) },
    '-',
    ...trackItems(trackId),
  ]);
}

// ── the browser ──────────────────────────────────────────────────────────────────────────────────────────────────────

export function presetMenu(preset: InstrumentRef): void {
  const t = trackOf(selected.value);
  appMenu.popup([
    {
      label: t ? `Put on ${t.name}` : 'Put on the Selected Track',
      enabled: !!t,
      run: () => {
        if (t) assignPreset(t.id, preset);
      },
    },
    {
      label: 'New Track with It',
      run: () => addNewTrack({ instrument: preset, after: selected.value }),
    },
  ]);
}

export function takeMenu(file: string, at: number): void {
  const t = trackOf(selected.value);
  appMenu.popup([
    {
      label: t ? `Read onto ${t.name} at the Playhead` : 'Read onto the Selected Track',
      enabled: !!t,
      run: () => t && dropTake(t.id, file, at),
    },
    {
      label: 'Read onto a New Track',
      run: () => {
        const id = addNewTrack({ instrument: { bank: 0, program: 73 }, after: selected.value });
        void dropTake(id, file, at);
      },
    },
  ]);
}

/** text fields get the usual edit menu */
export function textMenu(): void {
  appMenu.popup([
    { label: 'Cut', text: 'cut', native: true },
    { label: 'Copy', text: 'copy', native: true },
    { label: 'Paste', text: 'paste', native: true },
    '-',
    { label: 'Select All', text: 'selectAll', native: true },
  ]);
}
