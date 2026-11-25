// Audio tracks in the app (Chordinal PRD §16): a new one, audio files dropped on one's lane (or below the tracks, for
// a new one) as clips, their files kept in the project's audio/ folder, and what the selected clip's commands do.
import { SAMPLE_FILE } from '@chordinal/audio';
import {
  addAudioClip,
  addTrack,
  audioClipEnd,
  findAudioClip,
  isAudioTrack,
  makeAudioTrack,
  removeAudioClip,
  updateAudioClip,
} from '@chordinal/daw';
import type { AudioClip, Loop, Project } from '@chordinal/daw';
import { dbToGain } from '@chordinal/playback';
import { project, selected, selectedAudio, notify } from './store.ts';
import { edit } from './document.ts';
import { errorText } from './errors.ts';
import { audioFiles } from './audio-files.ts';

/** project p with a new audio track below track `after` (or last), and its id */
function withAudioTrack(p: Project, after: string | null, name = ''): { p: Project; id: string } {
  const t = makeAudioTrack(p, name ? { name } : {});
  const at = after ? p.tracks.findIndex((x) => x.id === after) + 1 : p.tracks.length;
  return { p: addTrack(p, t, at || p.tracks.length), id: t.id };
}

/** a new audio track below the selected one (or last), selected */
export function addAudioTrack(): void {
  let id = '';
  edit((p) => {
    const made = withAudioTrack(p, selected.value);
    id = made.id;
    return made.p;
  });
  selected.value = id;
}

/** a dropped beat: snapped to the beat, or where it is with Shift (PRD §16.5) */
export const dropBeat = (b: number, free: boolean): number => Math.max(0, free ? b : Math.round(b));

/**
 * puts audio files on an audio track, one after another from beat `at`, each as long as its file; with no track,
 * on a new audio track named after the first file
 */
export async function dropAudioClips(trackId: string | null, files: File[], at: number): Promise<void> {
  const audio = files.filter((f) => SAMPLE_FILE.test(f.name));
  if (!audio.length) {
    notify('Drop a WAV, AIFF or MP3 file to put it on an audio track', 'error');
    return;
  }
  if (trackId && !isAudioTrack(project.value.tracks.find((t) => t.id === trackId) ?? {})) return;
  let track = trackId,
    start = at;
  for (const file of audio) {
    notify(`Reading ${file.name}…`, 'busy');
    try {
      const stored = await audioFiles.keep(file.name, new Uint8Array(await file.arrayBuffer()));
      const buffer = await audioFiles.read(stored);
      if (!buffer) throw new Error("it can't be read as audio");
      const clip = { start, file: stored, seconds: buffer.duration };
      edit((p) => {
        const made = track
          ? { p, id: track }
          : withAudioTrack(p, selected.value, file.name.replace(SAMPLE_FILE, ''));
        track = made.id;
        return addAudioClip(made.p, made.id, clip);
      });
      start = audioClipEnd(project.value.tempoMap, clip);
      selected.value = track;
      notify('');
    } catch (e) {
      notify(`${file.name}: ${errorText(e)}`, 'error');
    }
  }
}

/** the selected audio clip, while it's there */
export function selectedAudioClip(): { track: string; clip: AudioClip } | null {
  const sel = selectedAudio.value,
    clip = sel && findAudioClip(project.value, sel.track, sel.clip);
  return sel && clip ? { track: sel.track, clip } : null;
}

export function deleteAudioClip(trackId: string, clipId: string): void {
  edit((p) => removeAudioClip(p, trackId, clipId));
  if (selectedAudio.value?.clip === clipId) selectedAudio.value = null;
}

export const toggleAudioMute = (trackId: string, clipId: string): void =>
  edit((p) => updateAudioClip(p, trackId, clipId, (c) => ({ ...c, mute: !c.mute })));

/** the gains a clip's right-click menu offers, in dB */
export const AUDIO_GAINS_DB = [-12, -6, -3, 0, 3, 6, 12];

/** a clip's gain in dB, rounded to a tenth */
export const audioGainDb = (c: AudioClip): number =>
  c.gain > 0 ? Math.round(200 * Math.log10(c.gain)) / 10 : -Infinity;

export const setAudioGain = (trackId: string, clipId: string, db: number): void =>
  edit((p) => updateAudioClip(p, trackId, clipId, { gain: dbToGain(db) }));

/** a clip moved later (or earlier) by some beats, not before the start */
export const nudgeAudioClip = (trackId: string, clipId: string, by: number): void =>
  edit(
    (p) => updateAudioClip(p, trackId, clipId, (c) => ({ ...c, start: Math.max(0, c.start + by) })),
    `nudge ${clipId}`,
  );

/** the stretch an audio clip plays over */
export const audioClipRange = (trackId: string, clipId: string): Loop | null => {
  const c = findAudioClip(project.value, trackId, clipId);
  return c ? { from: c.start, to: audioClipEnd(project.value.tempoMap, c) } : null;
};
