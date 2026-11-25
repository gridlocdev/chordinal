// The shared commands, in the one catalog (commands/catalog.ts) the keys, the menu bar, the right-click menus, ⌘K and
// the Keyboard Shortcuts window all read. Shortcuts with Cmd are answered by the native menu bar where there is one;
// plain keys, which must still type in a text field, by the page (keys.ts). The menu bar is built in menu-bar.ts; an
// app adds its own commands with `catalog.add`.
//
// What Edit's commands act on follows the part last clicked (focus.ts): the picked notes in the piano roll, or the
// selected clip in the arrangement.
import { toggleAutomation, shownLanes } from './automation.ts';
import { appMenu } from './platform/app-menu.ts';
import { barAt, barLines } from '@chordinal/daw';
import { projectEnd, findClip } from '@chordinal/daw';
import { markerRange, addMarker, insertTime, deleteTime } from '@chordinal/daw';
import { projectMidi } from '@chordinal/daw';
import {
  project,
  projectName,
  dirty,
  hist,
  selected,
  selectedClip,
  selectedTrack,
  beat,
  playing,
  settings,
  setSettings,
  notify,
  exporting,
} from './store.ts';
import { edit, undo, redo, save, saveAs, openProject } from './document.ts';
import { toggle, seek } from './player.ts';
import { record, recording } from './recording.ts';
import { focus } from './focus.ts';
import { asking, askText } from './ask.ts';
import {
  pickedNotes,
  deletePicked,
  transposePicked,
  quantizePicked,
  pickAll,
  clearPicked,
  GRIDS,
  nudgePicked,
  humanizePicked,
  scalePicked,
  reversePicked,
  hasPicks,
} from './notes.ts';
import { cut, copy, paste, duplicate, canCopy, clipboard } from './clipboard.ts';
import {
  addNewTrack,
  renameTrack,
  deleteTrack,
  duplicateTheTrack,
  moveTrackBy,
  toggleMute,
  toggleSolo,
  chooseInstrument,
  deleteClip,
  splitClipsAt,
  joinWithNext,
  nextClip,
  quantizeClip,
  loopOver,
  clipRange,
  arrangeZoom,
  arrangePpb,
  toggleClipMute,
  nudgeClip,
  humanizeClip,
  scaleClip,
  reverseClip,
  makePatternOf,
  makeUniqueOf,
  patternOf,
} from './tracks.ts';
import { exportDialog } from './bounce.ts';
import { convertDialog } from './recording.ts';
import { importMidi } from './midi-import.ts';
import { audioEngine } from '@chordinal/playback';
import { askTempo, askMeter } from './timeline.ts';
import { appDialog, overlay, toggleOverlay } from './dialogs.ts';
import { CommandCatalog } from './commands/index.ts';
import type { CommandMenuItem } from './commands/index.ts';
import type { MenuItem } from './platform/app-menu.ts';
import type { Loop } from '@chordinal/daw';

/** what holds the commands back: a dialog, ⌘K or the Keyboard Shortcuts window ('overlay'), or nothing */
const busyWith = () =>
  appDialog.value ||
  exportDialog.value ||
  convertDialog.value ||
  asking.value ||
  audioEngine.rendering ||
  exporting.value
    ? 'dialog'
    : overlay.value
      ? 'overlay'
      : null;

/** a dialog is open: commands wait */
export const busy = (): boolean => busyWith() !== null;

// ── what the commands act on ─────────────────────────────────────────────────────────────────────────────────────────

const inRoll = () => focus.value === 'roll' && hasPicks();
const clipSelected = () => focus.value !== 'roll' && !!selectedClip.value;

/** Delete: the picked notes or the selected clip, in the part last clicked */
export function deleteSelection(): boolean {
  if (focus.value === 'roll') return deletePicked();
  const c = selectedClip.value;
  if (!c) return false;
  deleteClip(c.track, c.clip);
  return true;
}

const canDelete = () => (focus.value === 'roll' ? hasPicks() : !!selectedClip.value);

/** the stretch a loop is set to: the selection, else the section at the playhead, else four bars from its bar */
export function selectionRange(): Loop | null {
  const p = project.value;
  if (inRoll()) {
    const list = pickedNotes();
    const a = barAt(p.meters, Math.min(...list.map((o) => o.at))),
      b = barAt(p.meters, Math.max(...list.map((o) => o.at + o.n.beats)) - 1e-6);
    return { from: a.start, to: b.start + b.beatsPerBar };
  }
  const c = selectedClip.value;
  if (c) return clipRange(c.track, c.clip);
  const m = p.markers.findLastIndex((x) => x.beat <= beat.value + 1e-6);
  if (m >= 0) return markerRange(p, m);
  const bar = barAt(p.meters, beat.value);
  return { from: bar.start, to: bar.start + bar.beatsPerBar * 4 };
}

// ── the transport ────────────────────────────────────────────────────────────────────────────────────────────────────

function stepBar(by: number): void {
  const p = project.value,
    lines = barLines(p.meters, 0, projectEnd(p) + 1);
  const i = lines.findLastIndex((b) => b <= beat.value + 1e-6);
  // the bar line at or before the playhead: there is always one, at beat 0
  const here = lines[i] ?? 0;
  // back from inside a bar goes to its start first
  const to =
    by < 0 && beat.value - here > 0.25
      ? here
      : (lines[Math.max(0, Math.min(lines.length - 1, i + by))] ?? here);
  seek(to);
}

function stepMarker(by: number): void {
  const marks = project.value.markers.map((m) => m.beat);
  const to = by < 0 ? marks.findLast((b) => b < beat.value - 0.25) : marks.find((b) => b > beat.value + 1e-6);
  seek(to ?? (by < 0 ? 0 : beat.value));
}

export async function addMarkerAt(at: number = beat.value): Promise<void> {
  const name = await askText('Marker name', `Marker ${project.value.markers.length + 1}`, 'Add');
  if (name) edit((p) => addMarker(p, at, name));
}

async function exportMidi(): Promise<void> {
  const p = project.value;
  const file = await appMenu.saveFile(`${projectName.value || 'untitled'}.mid`, projectMidi(p));
  if (file) notify(`Exported ${file}`);
}

/** asks how many bars, then puts in (or takes out) that many from the bar the playhead is in */
async function changeBars(insert: boolean): Promise<void> {
  const p = project.value,
    bar = barAt(p.meters, beat.value);
  const n = Math.round(
    Number(
      await askText(
        insert ? 'Bars to insert at the playhead' : 'Bars to delete from the playhead',
        '1',
        insert ? 'Insert' : 'Delete',
      ),
    ),
  );
  if (!(n >= 1 && n <= 64)) return;
  const beats = n * bar.beatsPerBar;
  edit((q) => (insert ? insertTime(q, bar.start, beats) : deleteTime(q, bar.start, bar.start + beats)));
  selectedClip.value = null;
  clearPicked();
}

/** the picked notes in the piano roll, else the selected clip: fn(notes) or fn(track, clip) */
const onSelection = (notes: () => unknown, clip: (track: string, clip: string) => unknown) => () => {
  const sel = selectedClip.value;
  return inRoll() ? notes() : sel ? clip(sel.track, sel.clip) : undefined;
};

const ZOOM = 1.5;
const zoomBy = (k: number) => {
  arrangeZoom.value = Math.max(0.5, Math.min(120, (arrangeZoom.value || arrangePpb.value || 20) * k));
};

const clipMuted = () => {
  const c = selectedClip.value;
  return !!c && !!findClip(project.value, c.track, c.clip)?.mute;
};

// ── the commands ─────────────────────────────────────────────────────────────────────────────────────────────────────

const track = () => selectedTrack.value;

const clipCommand = (fn: (track: string, clip: string) => unknown) => () => {
  const sel = selectedClip.value;
  return sel ? fn(sel.track, sel.clip) : undefined;
};
const onNotesOrClip = () => inRoll() || clipSelected();

/** the shared commands: what each does, its shortcut and when it can be used (see commands/catalog.ts) */
export const catalog = new CommandCatalog([
  // File
  {
    id: 'save',
    group: 'File',
    title: 'Save',
    shortcut: 'mod+s',
    run: save,
    description: 'Save the project in its folder; the first save asks where.',
    keywords: 'write store keep',
  },
  {
    id: 'saveAs',
    group: 'File',
    title: 'Save As…',
    shortcut: 'mod+shift+s',
    run: saveAs,
    description: 'Save a copy of the project in a new folder, with its takes.',
    keywords: 'copy duplicate rename',
  },
  {
    id: 'revert',
    group: 'File',
    title: 'Revert to Saved',
    run: () => openProject(projectName.value),
    enabled: () => !!projectName.value && dirty.value,
    description: 'Throw away the changes since the last save.',
    keywords: 'discard undo reload',
  },
  {
    id: 'importMidi',
    group: 'File',
    title: 'Import MIDI File…',
    run: importMidi,
    description: 'Open a MIDI file as a new project.',
    keywords: 'mid load open',
  },
  {
    id: 'exportMidi',
    group: 'File',
    title: 'Export as MIDI File…',
    shortcut: 'mod+e',
    run: exportMidi,
    description: 'Save the project as a MIDI file.',
    keywords: 'mid save',
  },
  {
    id: 'exportAudio',
    group: 'File',
    title: 'Export as Audio File…',
    shortcut: 'mod+b',
    run: () => {
      exportDialog.value = true;
    },
    enabled: () => project.value.tracks.some((t) => t.clips.length),
    description: 'Render the mix, or each track, to WAV.',
    keywords: 'bounce render wav mixdown',
  },
  // Edit
  {
    id: 'undo',
    group: 'Edit',
    title: 'Undo',
    shortcut: 'mod+z',
    text: 'undo',
    run: undo,
    enabled: () => hist.value.past.length > 0,
    description: 'Take back the last change.',
    keywords: 'back revert',
  },
  {
    id: 'redo',
    group: 'Edit',
    title: 'Redo',
    shortcut: 'mod+shift+z',
    text: 'redo',
    run: redo,
    enabled: () => hist.value.future.length > 0,
    description: 'Do again the change you took back.',
    keywords: 'again forward',
  },
  {
    id: 'cut',
    group: 'Edit',
    title: 'Cut',
    shortcut: 'mod+x',
    text: 'cut',
    run: cut,
    enabled: canCopy,
    description: 'Copy the selected notes or clip, then delete them.',
  },
  {
    id: 'copy',
    group: 'Edit',
    title: 'Copy',
    shortcut: 'mod+c',
    text: 'copy',
    run: copy,
    enabled: canCopy,
    description: 'Copy the selected notes or clip.',
  },
  {
    id: 'paste',
    group: 'Edit',
    title: 'Paste',
    shortcut: 'mod+v',
    text: 'paste',
    run: () => paste(),
    enabled: () => !!clipboard.value && !!selected.value,
    description: 'Paste at the playhead, on the selected track.',
  },
  {
    id: 'duplicate',
    group: 'Edit',
    title: 'Duplicate',
    shortcut: 'mod+d',
    field: true,
    run: duplicate,
    enabled: canCopy,
    description: 'Put a copy of the selected notes or clip right after them.',
    keywords: 'dup clone repeat',
  },
  {
    id: 'delete',
    group: 'Edit',
    title: 'Delete',
    shortcut: 'backspace',
    alternates: ['delete'],
    run: deleteSelection,
    enabled: canDelete,
    description: 'Delete the selected notes, clip or chords.',
    keywords: 'remove erase',
  },
  {
    id: 'selectAll',
    group: 'Edit',
    title: 'Select All',
    shortcut: 'mod+a',
    text: 'selectAll',
    run: () => {
      focus.value = 'roll';
      pickAll();
    },
    enabled: () => !!track(),
    description: 'Select every note in the piano roll.',
  },
  {
    id: 'deselect',
    group: 'Edit',
    title: 'Deselect All',
    shortcut: 'esc',
    run: () => {
      clearPicked();
      selectedClip.value = null;
    },
    description: 'Select no notes or clip.',
    keywords: 'none clear',
  },
  {
    id: 'split',
    group: 'Edit',
    title: 'Split at Playhead',
    shortcut: 'mod+t',
    field: true,
    run: () => splitClipsAt(beat.value, selectedClip.value?.track ?? null),
    description: 'Cut the clips under the playhead in two.',
    keywords: 'cut divide',
  },
  {
    id: 'join',
    group: 'Edit',
    title: 'Join with Next Clip',
    shortcut: 'mod+j',
    field: true,
    run: clipCommand(joinWithNext),
    enabled: () => !!selectedClip.value && !!nextClip(selectedClip.value.track, selectedClip.value.clip),
    description: 'Make the selected clip and the one after it one clip.',
    keywords: 'merge glue combine',
  },
  {
    id: 'quantize',
    group: 'Edit',
    title: 'Quantize',
    shortcut: 'q',
    enabled: onNotesOrClip,
    run: () => (inRoll() ? quantizePicked() : clipCommand(quantizeClip)()),
    description: 'Move the selected notes, or the clip’s, onto the grid.',
    keywords: 'snap align timing',
  },
  {
    id: 'up',
    group: 'Edit',
    title: 'Transpose Up',
    shortcut: 'up',
    repeats: true,
    run: () => transposePicked(1),
    enabled: inRoll,
    description: 'Move the selected notes up a semitone.',
    keywords: 'pitch higher',
  },
  {
    id: 'down',
    group: 'Edit',
    title: 'Transpose Down',
    shortcut: 'down',
    repeats: true,
    run: () => transposePicked(-1),
    enabled: inRoll,
    description: 'Move the selected notes down a semitone.',
    keywords: 'pitch lower',
  },
  {
    id: 'octaveUp',
    group: 'Edit',
    title: 'Octave Up',
    shortcut: 'shift+up',
    repeats: true,
    run: () => transposePicked(12),
    enabled: inRoll,
    description: 'Move the selected notes up an octave.',
    keywords: 'transpose pitch',
  },
  {
    id: 'octaveDown',
    group: 'Edit',
    title: 'Octave Down',
    shortcut: 'shift+down',
    repeats: true,
    run: () => transposePicked(-12),
    enabled: inRoll,
    description: 'Move the selected notes down an octave.',
    keywords: 'transpose pitch',
  },
  {
    id: 'nudgeLeft',
    group: 'Edit',
    title: 'Nudge Left',
    shortcut: 'left',
    repeats: true,
    enabled: onNotesOrClip,
    run: onSelection(
      () => nudgePicked(-settings.value.grid),
      (t, c) => nudgeClip(t, c, -barAt(project.value.meters, beat.value).beatsPerBar),
    ),
    description: 'Move the selected notes back a grid step, or the clip a bar.',
    keywords: 'earlier move',
  },
  {
    id: 'nudgeRight',
    group: 'Edit',
    title: 'Nudge Right',
    shortcut: 'right',
    repeats: true,
    enabled: onNotesOrClip,
    run: onSelection(
      () => nudgePicked(settings.value.grid),
      (t, c) => nudgeClip(t, c, barAt(project.value.meters, beat.value).beatsPerBar),
    ),
    description: 'Move the selected notes on a grid step, or the clip a bar.',
    keywords: 'later move',
  },
  {
    id: 'humanize',
    group: 'Edit',
    title: 'Humanize',
    enabled: onNotesOrClip,
    run: onSelection(humanizePicked, humanizeClip),
    description: 'Loosen the timing and velocity of the selected notes a little.',
    keywords: 'random feel groove',
  },
  {
    id: 'doubleSpeed',
    group: 'Edit',
    title: 'Double Speed',
    enabled: onNotesOrClip,
    run: onSelection(
      () => scalePicked(0.5),
      (t, c) => scaleClip(t, c, 0.5),
    ),
    description: 'Make the selected notes twice as fast.',
    keywords: 'faster shorter scale',
  },
  {
    id: 'halfSpeed',
    group: 'Edit',
    title: 'Half Speed',
    enabled: onNotesOrClip,
    run: onSelection(
      () => scalePicked(2),
      (t, c) => scaleClip(t, c, 2),
    ),
    description: 'Make the selected notes half as fast.',
    keywords: 'slower longer scale',
  },
  {
    id: 'reverse',
    group: 'Edit',
    title: 'Reverse',
    enabled: onNotesOrClip,
    run: onSelection(reversePicked, reverseClip),
    description: 'Play the selected notes backwards.',
    keywords: 'backwards flip retrograde',
  },
  {
    id: 'muteClip',
    group: 'Edit',
    title: 'Mute Clip',
    shortcut: 'm',
    enabled: () => !!selectedClip.value,
    checked: clipMuted,
    run: clipCommand(toggleClipMute),
    description: 'Silence the selected clip, or play it again.',
    keywords: 'silence unmute',
  },
  {
    id: 'makePattern',
    group: 'Edit',
    title: 'Make Pattern',
    shortcut: 'mod+p',
    field: true,
    run: clipCommand(makePatternOf),
    enabled: () => !!selectedClip.value && !patternOf(selectedClip.value.track, selectedClip.value.clip),
    description: 'Make the selected clip a pattern, so its copies stay linked.',
    keywords: 'link loop',
  },
  {
    id: 'makeUnique',
    group: 'Edit',
    title: 'Make Unique',
    run: clipCommand(makeUniqueOf),
    enabled: () => !!selectedClip.value && !!patternOf(selectedClip.value.track, selectedClip.value.clip),
    description: 'Unlink the selected clip from its pattern.',
    keywords: 'unlink detach',
  },
  {
    id: 'insertBars',
    group: 'Edit',
    title: 'Insert Bars at Playhead…',
    run: () => changeBars(true),
    description: 'Add empty bars at the playhead; everything after moves on.',
    keywords: 'add time space',
  },
  {
    id: 'deleteBars',
    group: 'Edit',
    title: 'Delete Bars at Playhead…',
    run: () => changeBars(false),
    description: 'Take bars out at the playhead; everything after moves back.',
    keywords: 'remove time',
  },
  // Track
  {
    id: 'newTrack',
    group: 'Track',
    title: 'New Track',
    shortcut: 'mod+alt+n',
    field: true,
    run: () => addNewTrack({ after: selected.value }),
    description: 'Add an instrument track below the selected one.',
    keywords: 'add create instrument',
  },
  {
    id: 'duplicateTrack',
    group: 'Track',
    title: 'Duplicate Track',
    shortcut: 'mod+shift+d',
    field: true,
    run: () => duplicateTheTrack(selected.value),
    enabled: () => !!track(),
    description: 'Add a copy of the selected track, with its clips.',
    keywords: 'copy clone dup',
  },
  {
    id: 'renameTrack',
    group: 'Track',
    title: 'Rename Track…',
    run: () => renameTrack(selected.value),
    enabled: () => !!track(),
    description: 'Give the selected track a new name.',
    keywords: 'name',
  },
  {
    id: 'instrument',
    group: 'Track',
    title: 'Choose Instrument…',
    run: () => chooseInstrument(selected.value),
    enabled: () => !!track(),
    description: 'Pick the sound the selected track plays.',
    keywords: 'sound preset patch program',
  },
  {
    id: 'deleteTrack',
    group: 'Track',
    title: 'Delete Track',
    shortcut: 'mod+backspace',
    field: true,
    run: () => deleteTrack(selected.value),
    enabled: () => !!track(),
    description: 'Delete the selected track and its clips.',
    keywords: 'remove',
  },
  {
    id: 'mute',
    group: 'Track',
    title: 'Mute',
    run: () => toggleMute(selected.value),
    checked: () => !!track()?.mixer.mute,
    enabled: () => !!track(),
    description: 'Silence the selected track, or play it again.',
    keywords: 'silence unmute',
  },
  {
    id: 'solo',
    group: 'Track',
    title: 'Solo',
    run: () => toggleSolo(selected.value),
    checked: () => !!track()?.mixer.solo,
    enabled: () => !!track(),
    description: 'Play only the selected track; soloing another track turns this one off.',
    keywords: 'alone isolate',
  },
  {
    id: 'showAutomation',
    group: 'Track',
    title: 'Show Automation',
    shortcut: 'a',
    run: () => toggleAutomation(selected.value),
    checked: () => !!selected.value && !!shownLanes.value[selected.value],
    enabled: () => !!track(),
    description:
      "Show or hide the selected track's automation lane, to draw its volume, pan, tone or sends over time.",
    keywords: 'automation envelope fade sweep keyframe lane',
  },
  {
    id: 'trackUp',
    group: 'Track',
    title: 'Move Track Up',
    shortcut: 'mod+alt+up',
    field: true,
    run: () => moveTrackBy(selected.value, -1),
    enabled: () => !!track() && project.value.tracks[0] !== track(),
    description: 'Move the selected track up the list.',
    keywords: 'reorder',
  },
  {
    id: 'trackDown',
    group: 'Track',
    title: 'Move Track Down',
    shortcut: 'mod+alt+down',
    field: true,
    run: () => moveTrackBy(selected.value, 1),
    enabled: () => !!track() && project.value.tracks.at(-1) !== track(),
    description: 'Move the selected track down the list.',
    keywords: 'reorder',
  },
  // Transport
  {
    id: 'play',
    group: 'Transport',
    title: 'Play or Stop',
    shortcut: 'space',
    run: toggle,
    description: 'Start or stop playing from the playhead.',
    keywords: 'pause start',
  },
  {
    id: 'record',
    group: 'Transport',
    title: 'Record',
    shortcut: 'r',
    run: record,
    checked: () => !!recording.value,
    description: 'Record a melody on the selected track.',
    keywords: 'take capture',
  },
  {
    id: 'start',
    group: 'Transport',
    title: 'Go to Start',
    shortcut: 'enter',
    run: () => seek(project.value.loop && playing.value ? project.value.loop.from : 0),
    description: 'Move the playhead to the start (of the loop, while it plays).',
    keywords: 'beginning home rewind',
  },
  {
    id: 'end',
    group: 'Transport',
    title: 'Go to End',
    shortcut: 'end',
    run: () => seek(projectEnd(project.value)),
    description: 'Move the playhead to the end of the project.',
  },
  {
    id: 'prevBar',
    group: 'Transport',
    title: 'Back a Bar',
    shortcut: ',',
    repeats: true,
    run: () => stepBar(-1),
    description: 'Move the playhead back a bar.',
    keywords: 'rewind previous',
  },
  {
    id: 'nextBar',
    group: 'Transport',
    title: 'Forward a Bar',
    shortcut: '.',
    repeats: true,
    run: () => stepBar(1),
    description: 'Move the playhead on a bar.',
    keywords: 'next skip',
  },
  {
    id: 'prevMarker',
    group: 'Transport',
    title: 'Previous Marker',
    shortcut: 'alt+,',
    run: () => stepMarker(-1),
    enabled: () => project.value.markers.length > 0,
    description: 'Move the playhead to the marker before it.',
    keywords: 'section back',
  },
  {
    id: 'nextMarker',
    group: 'Transport',
    title: 'Next Marker',
    shortcut: 'alt+.',
    run: () => stepMarker(1),
    enabled: () => project.value.markers.length > 0,
    description: 'Move the playhead to the next marker.',
    keywords: 'section forward',
  },
  {
    id: 'loop',
    group: 'Transport',
    title: 'Loop',
    shortcut: 'c',
    run: () => loopOver(project.value.loop ? null : selectionRange()),
    checked: () => !!project.value.loop,
    description: 'Loop the selection, or the section at the playhead; again turns it off.',
    keywords: 'cycle repeat',
  },
  {
    id: 'loopSelection',
    group: 'Transport',
    title: 'Loop Selection',
    shortcut: 'mod+u',
    run: () => loopOver(selectionRange()),
    description: 'Move the loop to the selection.',
    keywords: 'cycle repeat',
  },
  {
    id: 'metronome',
    group: 'Transport',
    title: 'Metronome',
    run: () => setSettings({ metronome: !settings.value.metronome }),
    checked: () => settings.value.metronome,
    description: 'Click on every beat while playing.',
    keywords: 'click tick beat',
  },
  {
    id: 'click',
    group: 'Transport',
    title: 'Click While Recording',
    run: () => setSettings({ click: !settings.value.click }),
    checked: () => settings.value.click,
    description: 'Click on every beat while recording.',
    keywords: 'metronome count',
  },
  {
    id: 'addMarker',
    group: 'Transport',
    title: 'Add Marker at Playhead…',
    run: () => addMarkerAt(),
    description: 'Name the place the playhead is at.',
    keywords: 'section label',
  },
  {
    id: 'tempo',
    group: 'Transport',
    title: 'Tempo…',
    run: askTempo,
    description: 'Set the project’s tempo.',
    keywords: 'bpm speed',
  },
  {
    id: 'meter',
    group: 'Transport',
    title: 'Meter…',
    run: askMeter,
    description: 'Set the project’s meter.',
    keywords: 'time signature',
  },
  // View
  {
    id: 'browser',
    group: 'View',
    title: 'Browser',
    shortcut: 'b',
    run: () => setSettings({ browserOpen: !settings.value.browserOpen }),
    checked: () => settings.value.browserOpen,
    description: 'Show or hide the browser of instruments, kits, projects and takes.',
    keywords: 'sidebar panel library',
  },
  {
    id: 'roll',
    group: 'View',
    title: 'Piano Roll',
    shortcut: 'mod+1',
    radio: true,
    run: () => setSettings({ editorTab: 'roll' }),
    checked: () => settings.value.editorTab === 'roll',
    description: 'Show the piano roll in the editor.',
    keywords: 'notes midi',
  },
  {
    id: 'mixer',
    group: 'View',
    title: 'Mixer',
    shortcut: 'mod+2',
    radio: true,
    run: () => setSettings({ editorTab: 'mixer' }),
    checked: () => settings.value.editorTab === 'mixer',
    description: 'Show the mixer in the editor.',
    keywords: 'volume pan faders',
  },
  {
    id: 'stepGrid',
    group: 'View',
    title: 'Step Grid',
    shortcut: 'mod+3',
    radio: true,
    run: () => setSettings({ editorTab: 'grid' }),
    checked: () => settings.value.editorTab === 'grid',
    description: 'Show the drum step grid in the editor.',
    keywords: 'drums beats sequencer',
  },
  {
    id: 'sound',
    group: 'View',
    title: 'Sound',
    shortcut: 'mod+4',
    radio: true,
    run: () => setSettings({ editorTab: 'sound' }),
    checked: () => settings.value.editorTab === 'sound',
    description: "Show the selected track's synth settings in the editor.",
    keywords: 'synth oscillator filter envelope lfo',
  },
  {
    id: 'zoomIn',
    group: 'View',
    title: 'Zoom In',
    shortcut: 'mod+=',
    alternates: ['mod++'],
    run: () => zoomBy(ZOOM),
    description: 'Show less time, larger.',
    keywords: 'bigger magnify',
  },
  {
    id: 'zoomOut',
    group: 'View',
    title: 'Zoom Out',
    shortcut: 'mod+-',
    run: () => zoomBy(1 / ZOOM),
    description: 'Show more time, smaller.',
    keywords: 'smaller',
  },
  {
    id: 'fit',
    group: 'View',
    title: 'Zoom to Fit',
    shortcut: 'mod+0',
    run: () => {
      arrangeZoom.value = 0;
    },
    description: 'Fit the whole project in the arrangement.',
    keywords: 'all reset',
  },
  {
    id: 'follow',
    group: 'View',
    title: 'Follow Playhead',
    run: () => setSettings({ follow: !settings.value.follow }),
    checked: () => settings.value.follow,
    description: 'Scroll with the playhead while playing.',
    keywords: 'scroll track',
  },
  {
    id: 'ghosts',
    group: 'View',
    title: 'Show Other Tracks’ Notes',
    run: () => setSettings({ ghosts: !settings.value.ghosts }),
    checked: () => settings.value.ghosts,
    description: 'Show the other tracks’ notes faintly in the piano roll.',
    keywords: 'ghost notes',
  },
  {
    id: 'themeSystem',
    group: 'View',
    title: 'System',
    radio: true,
    run: () => setSettings({ theme: 'system' }),
    checked: () => settings.value.theme === 'system',
    description: 'Follow the system’s light or dark look.',
    keywords: 'theme appearance auto',
  },
  {
    id: 'themeLight',
    group: 'View',
    title: 'Light',
    radio: true,
    run: () => setSettings({ theme: 'light' }),
    checked: () => settings.value.theme === 'light',
    description: 'Use the light look.',
    keywords: 'theme appearance',
  },
  {
    id: 'themeDark',
    group: 'View',
    title: 'Dark',
    radio: true,
    run: () => setSettings({ theme: 'dark' }),
    checked: () => settings.value.theme === 'dark',
    description: 'Use the dark look.',
    keywords: 'theme appearance night',
  },
  {
    id: 'commandMenu',
    group: 'View',
    title: 'Command Menu…',
    shortcut: 'mod+k',
    hidden: true,
    global: true,
    run: () => toggleOverlay('commands'),
    description: 'Find any command by name and run it.',
    keywords: 'palette search',
  },
  // Help
  {
    id: 'shortcuts',
    group: 'Help',
    title: 'Keyboard Shortcuts',
    shortcut: 'mod+/',
    global: true,
    run: () => toggleOverlay('shortcuts'),
    description: 'List every command with its shortcut.',
    keywords: 'keys hotkeys help',
  },
  {
    id: 'readme',
    group: 'Help',
    title: 'Read Me',
    run: () => appMenu.open('README.md'),
    description: 'Open the guide to Chordinal.',
    keywords: 'help docs manual',
  },
]);

/** while a dialog is open the commands wait; ⌘K and ⌘/ may still swap their own window for the other */
catalog.gate = (c) => !busy() || (!!c.global && busyWith() === 'overlay');

/** a command as a menu item; `extra` changes its label, or runs it with arguments */
export const item = (id: string, extra: { label?: string; run?: () => unknown } = {}): CommandMenuItem =>
  catalog.menuItem(id, extra);

/** the snap grids, as radio items */
export const snapItems = (): MenuItem[] =>
  GRIDS.map(([g, name]) => ({
    label: name,
    radio: true,
    checked: settings.value.grid === g,
    run: () => setSettings({ grid: g }),
  }));
