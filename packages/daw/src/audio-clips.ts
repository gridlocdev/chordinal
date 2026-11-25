// Audio tracks and their clips (Chordinal PRD §16): a clip plays part of one audio file from a beat, at the file's own
// speed, so a tempo change moves where it starts but not how fast it plays. Pure.
import { makeTrack, newId, updateTrack } from './project.ts';
import type { AudioClip, Project, Track, TrackOptions } from './project.ts';

/** a clip's place in its file and how it sounds, as given when it's made; the rest start plain */
export type AudioClipOptions = Pick<AudioClip, 'start' | 'file' | 'seconds'> &
  Partial<Pick<AudioClip, 'offset' | 'gain' | 'fadeIn' | 'fadeOut'>>;

/** an audio track: it plays audio clips, not notes (PRD §16.1) */
export const isAudioTrack = (t: Pick<Track, 'kind'>): boolean => t.kind === 'audio';

/** a track's audio clips; none for a MIDI track */
export const audioClipsOf = (t: Pick<Track, 'audio'>): AudioClip[] => t.audio ?? [];

/** a new, empty audio track */
export function makeAudioTrack(project: Project, opts: Omit<TrackOptions, 'instrument'> = {}): Track {
  return { ...makeTrack(project, { name: 'Audio', ...opts }), kind: 'audio', audio: [] };
}

/** a clip's values stay at 0 or more, and its fades fit in it without overlapping */
function kept(c: AudioClip): AudioClip {
  const seconds = Math.max(0, c.seconds);
  const fadeIn = Math.max(0, Math.min(seconds, c.fadeIn));
  return {
    ...c,
    start: Math.max(0, c.start),
    offset: Math.max(0, c.offset),
    seconds,
    gain: Math.max(0, c.gain),
    fadeIn,
    fadeOut: Math.max(0, Math.min(seconds - fadeIn, c.fadeOut)),
  };
}

/** puts a clip on an audio track, in start order, with an id of its own; a MIDI track is left as it is */
export function addAudioClip(p: Project, trackId: string, opts: AudioClipOptions): Project {
  const clip = kept({ offset: 0, gain: 1, fadeIn: 0, fadeOut: 0, ...opts, id: newId(p, 'a') });
  return updateTrack(p, trackId, (t) =>
    isAudioTrack(t) ? { ...t, audio: [...audioClipsOf(t), clip].sort((a, b) => a.start - b.start) } : t,
  );
}

/** every audio file the project's clips play, once each */
export const audioFiles = (p: Project): string[] => [
  ...new Set(p.tracks.flatMap((t) => audioClipsOf(t).map((c) => c.file))),
];
