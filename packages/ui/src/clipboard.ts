// Cut, copy, paste and duplicate, for the selection in the part last clicked: the picked notes in the piano roll, or
// the selected clip or audio clip in the arrangement. The clipboard is the app's own; it holds a clip, an audio clip,
// or notes timed from the first.
import { signal } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { barAt } from '@chordinal/daw';
import {
  addClip,
  updateClip,
  findClip,
  newId,
  addAudioClip,
  audioClipEnd,
  isAudioTrack,
} from '@chordinal/daw';
import type { AudioClip, Clip, Note } from '@chordinal/daw';
import {
  project,
  selected,
  selectedClip,
  selectedAudio,
  selectedTrack,
  beat,
  settings,
  picked,
  notify,
} from './store.ts';
import { edit } from './document.ts';
import { focus } from './focus.ts';
import { pickedNotes, deletePicked, noteId, hasPicks } from './notes.ts';
import { deleteClip } from './tracks.ts';
import { deleteAudioClip, selectedAudioClip } from './audio-tracks.ts';

/** what the clipboard holds: a clip, or notes timed from the first and the beats they span */
export type ClipboardContent =
  | { kind: 'clip'; clip: Clip }
  | { kind: 'audio'; track: string; clip: AudioClip }
  | { kind: 'notes'; notes: Note[]; beats: number };

/** { kind: 'clip', clip } or { kind: 'notes', notes, beats } */
export const clipboard: Signal<ClipboardContent | null> = signal(null);

const noteMode = () => focus.value === 'roll' && hasPicks();

export const canCopy = (): boolean =>
  noteMode() || (focus.value !== 'roll' && (!!selectedClip.value || !!selectedAudioClip()));

function copied(): ClipboardContent | null {
  if (noteMode()) {
    const list = pickedNotes();
    const first = Math.min(...list.map((o) => o.at)),
      end = Math.max(...list.map((o) => o.at + o.n.beats));
    return { kind: 'notes', notes: list.map((o) => ({ ...o.n, beat: o.at - first })), beats: end - first };
  }
  const audio = selectedAudioClip();
  if (audio) return { kind: 'audio', ...audio };
  const sel = selectedClip.value,
    clip = sel && findClip(project.value, sel.track, sel.clip);
  return clip ? { kind: 'clip', clip } : null;
}

export function copy(): boolean {
  const c = copied();
  if (c) clipboard.value = c;
  return !!c;
}

export function cut(): boolean {
  if (!copy()) return false;
  const c = clipboard.value;
  if (c?.kind === 'notes') return deletePicked();
  if (c?.kind === 'audio') {
    deleteAudioClip(c.track, c.clip.id);
    return true;
  }
  const sel = selectedClip.value;
  if (sel) deleteClip(sel.track, sel.clip);
  return true;
}

/** the clipboard at a beat (the playhead's, by default) on a track (the selected one) */
export function paste(at: number = beat.value, trackId: string | null = selected.value): boolean {
  const c = clipboard.value;
  if (!c || !trackId) return false;
  const audioTrack = isAudioTrack(project.value.tracks.find((t) => t.id === trackId) ?? {});
  if (c.kind !== 'audio' && audioTrack) {
    notify('Paste notes or a clip on a MIDI track; an audio track plays audio clips', 'error');
    return false;
  }
  if (c.kind === 'clip') {
    placeClip(c.clip, trackId, at);
    return true;
  }
  if (c.kind === 'audio') return placeAudio(c.clip, trackId, at);
  placeNotes(c.notes, c.beats, trackId, at);
  return true;
}

export function duplicate(): boolean {
  const c = copied();
  if (!c) return false;
  if (c.kind === 'clip') {
    const sel = selectedClip.value;
    if (sel) placeClip(c.clip, sel.track, c.clip.start + c.clip.beats);
    return true;
  }
  if (c.kind === 'audio') return placeAudio(c.clip, c.track, audioClipEnd(project.value.tempoMap, c.clip));
  // the notes again right after themselves, a whole number of grid steps on
  const grid = settings.value.grid,
    first = Math.min(...pickedNotes().map((o) => o.at));
  const track = selectedTrack.value;
  if (track) placeNotes(c.notes, c.beats, track.id, first + Math.ceil(c.beats / grid - 1e-6) * grid);
  return true;
}

function placeClip(clip: Clip, trackId: string, start: number): void {
  let id = '';
  edit((p) => {
    id = newId(p, 'c');
    return addClip(p, trackId, { ...clip, id, start: Math.max(0, start) });
  });
  selected.value = trackId;
  selectedClip.value = { track: trackId, clip: id };
}

/** an audio clip on an audio track at a beat, as a copy; a MIDI track takes none (PRD §16.1) */
function placeAudio(clip: AudioClip, trackId: string, start: number): boolean {
  const p = project.value,
    t = p.tracks.find((x) => x.id === trackId);
  if (!t || !isAudioTrack(t)) {
    notify('Paste an audio clip on an audio track', 'error');
    return false;
  }
  let id = '';
  edit((q) => {
    id = newId(q, 'a');
    return addAudioClip(q, trackId, { ...clip, start: Math.max(0, start) });
  });
  selected.value = trackId;
  selectedAudio.value = { track: trackId, clip: id };
  return true;
}

/** notes into the clip under their start (grown to hold them), or a new clip of whole bars round them */
function placeNotes(notes: Note[], beats: number, trackId: string, at: number): void {
  const p = project.value,
    t = p.tracks.find((x) => x.id === trackId);
  if (!t) return;
  const end = at + beats;
  const clip = t.clips.findLast((c) => at >= c.start && at < c.start + c.beats);
  let id = clip?.id ?? '',
    from = 0;
  edit((q) => {
    if (clip) {
      from = clip.notes.length;
      return updateClip(q, trackId, clip.id, (c) => ({
        ...c,
        beats: Math.max(c.beats, end - c.start),
        notes: [...c.notes, ...notes.map((n) => ({ ...n, beat: n.beat + at - c.start }))],
      }));
    }
    const start = barAt(q.meters, at).start,
      last = barAt(q.meters, Math.max(at, end - 1e-6));
    id = newId(q, 'c');
    return addClip(q, trackId, {
      id,
      start,
      beats: last.start + last.beatsPerBar - start,
      notes: notes.map((n) => ({ ...n, beat: n.beat + at - start })),
    });
  });
  selected.value = trackId;
  focus.value = 'roll';
  selectedClip.value = { track: trackId, clip: id };
  picked.value = new Set(notes.map((_, i) => noteId(id, from + i)));
}
