// Audio tracks and their clips (Chordinal PRD §16): a clip plays part of one audio file from a beat, at the file's own
// speed, so a tempo change moves where it starts but not how fast it plays. Pure.
import { beatToSeconds, secondsToBeat } from '@chordinal/lib';
import { audioClipEnd, makeTrack, newId, updateTrack } from './project.ts';
import type { AudioClip, Project, Track, TrackOptions } from './project.ts';

/** a clip's place in its file and how it sounds, as given when it's made; the rest start plain */
export type AudioClipOptions = Pick<AudioClip, 'start' | 'file' | 'seconds'> &
  Partial<Pick<AudioClip, 'offset' | 'gain' | 'fadeIn' | 'fadeOut' | 'mute'>>;

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

/** the shortest a clip is trimmed to, in seconds */
export const MIN_AUDIO_SECONDS = 0.01;

const audioTrack = (p: Project, id: string): Track | undefined =>
  p.tracks.find((t) => t.id === id && isAudioTrack(t));

export const findAudioClip = (p: Project, trackId: string, clipId: string): AudioClip | null =>
  audioClipsOf(audioTrack(p, trackId) ?? {}).find((c) => c.id === clipId) ?? null;

/** the clip on an audio track under a beat, the last one starting there if they overlap */
export const audioClipAt = (p: Project, t: Track, beat: number): AudioClip | undefined =>
  audioClipsOf(t).findLast((c) => beat >= c.start && beat < audioClipEnd(p.tempoMap, c));

/** a clip changed, its values kept in range and the track's clips in start order; an edit that changes nothing
 * gives the same project */
export function updateAudioClip(
  p: Project,
  trackId: string,
  clipId: string,
  patch: Partial<Omit<AudioClip, 'id'>> | ((c: AudioClip) => AudioClip),
): Project {
  const c = findAudioClip(p, trackId, clipId);
  if (!c) return p;
  const next = kept(typeof patch === 'function' ? patch(c) : { ...c, ...patch });
  const keys = Object.keys({ ...c, ...next }) as (keyof AudioClip)[];
  if (keys.every((k) => c[k] === next[k])) return p;
  return updateTrack(p, trackId, (t) => ({
    ...t,
    audio: audioClipsOf(t)
      .map((x) => (x.id === clipId ? { ...next, id: clipId } : x))
      .sort((a, b) => a.start - b.start),
  }));
}

export const removeAudioClip = (p: Project, trackId: string, clipId: string): Project =>
  findAudioClip(p, trackId, clipId)
    ? updateTrack(p, trackId, (t) => ({ ...t, audio: audioClipsOf(t).filter((c) => c.id !== clipId) }))
    : p;

/** a clip moved to another beat and maybe another audio track; with copy, the original stays where it was */
export function moveAudioClip(
  p: Project,
  fromTrack: string,
  clipId: string,
  toTrack: string,
  start: number,
  copy = false,
): Project {
  const c = findAudioClip(p, fromTrack, clipId);
  if (!c || !audioTrack(p, toTrack)) return p;
  if (!copy && toTrack === fromTrack) return updateAudioClip(p, fromTrack, clipId, { start });
  const clip = kept({ ...c, id: copy ? newId(p, 'a') : c.id, start });
  return updateTrack(copy ? p : removeAudioClip(p, fromTrack, clipId), toTrack, (t) => ({
    ...t,
    audio: [...audioClipsOf(t), clip].sort((a, b) => a.start - b.start),
  }));
}

/**
 * a clip's edge dragged to a beat (PRD §16.6): its start trims the beginning, its end the end, never past the
 * file's ends (`fileSeconds`, when known) and never shorter than MIN_AUDIO_SECONDS. What's left plays where it
 * played before.
 */
export function trimAudioClip(
  p: Project,
  trackId: string,
  clipId: string,
  edge: 'start' | 'end',
  beat: number,
  fileSeconds = Infinity,
): Project {
  const c = findAudioClip(p, trackId, clipId);
  if (!c) return p;
  const map = p.tempoMap,
    at = beatToSeconds(map, c.start);
  if (edge === 'end') {
    const seconds = Math.max(
      MIN_AUDIO_SECONDS,
      Math.min(fileSeconds - c.offset, beatToSeconds(map, Math.max(0, beat)) - at),
    );
    return updateAudioClip(p, trackId, clipId, { seconds });
  }
  const end = at + c.seconds;
  const from = Math.max(
    at - c.offset,
    Math.min(end - MIN_AUDIO_SECONDS, beatToSeconds(map, Math.max(0, beat))),
  );
  const by = from - at;
  return updateAudioClip(p, trackId, clipId, {
    start: secondsToBeat(map, from),
    offset: c.offset + by,
    seconds: c.seconds - by,
    fadeIn: Math.max(0, c.fadeIn - by),
  });
}

/** every audio file the project's clips play, once each */
export const audioFiles = (p: Project): string[] => [
  ...new Set(p.tracks.flatMap((t) => audioClipsOf(t).map((c) => c.file))),
];
