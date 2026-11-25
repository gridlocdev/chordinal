// A project: tracks of clips of notes, each track with an instrument, a channel strip, MIDI FX and automation, over a
// tempo map, meter changes, markers and the chords' names. Every edit is a pure function returning a new project (the old
// one is untouched), so undo is a list of earlier projects. Knows nothing of how a project was made.
import { beatToSeconds, secondsToBeat } from '@chordinal/lib';
import type { TempoSegment } from '@chordinal/lib';
import type { MeterChange } from './meter.ts';

/** beat is from the clip's start; extra fields are marks a MIDI FX may read (vibrato, ornament …) */
export interface Note {
  beat: number;
  beats: number;
  key: number;
  vel: number;
  [mark: string]: unknown;
}

/** a muted clip is kept but not played; a clip with a pattern shares its notes, length and step with every clip of
 * that pattern (PRD §3.2); step is the step grid's step in beats (PRD §4.4) */
export interface Clip {
  id: string;
  start: number;
  beats: number;
  notes: Note[];
  mute?: boolean;
  pattern?: string;
  step?: number;
}

/** a stretch of an audio file played from a beat (PRD §16.2): `offset` seconds into the file, for `seconds` seconds,
 * at `gain` (1 as recorded), faded in and out over `fadeIn` and `fadeOut` seconds */
export interface AudioClip {
  id: string;
  start: number;
  file: string;
  offset: number;
  seconds: number;
  gain: number;
  fadeIn: number;
  fadeOut: number;
  mute?: boolean;
}

export interface Pattern {
  id: string;
  name: string;
}

export interface Keyframe {
  beat: number;
  value: number;
  curve: 'set' | 'linear' | 'exp';
}

/** duck: dip by db on every note of those keys on another track (a kick), like a sidechain */
export interface Mixer {
  volumeDb: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  lowCut: number;
  sends: { reverb: number; delay: number };
  autoPan: { rate: number; depth: number } | null;
  duck: { from: string; keys: number[]; db: number } | null;
}

/** a MIDI FX on a track: its registered type and its settings */
export interface TrackFx {
  type: string;
  [param: string]: unknown;
}

/** an audio effect in a track's strip (an insert): its type (effects.ts), its id on the track, and the settings changed
 * from the effect's starting values; a bypassed one passes the sound through untouched */
export interface Insert {
  id: string;
  type: string;
  bypass?: boolean;
  params: Record<string, number>;
}

export type Automation = {
  /** a gain on top of the fader (1: as the fader sets it) */
  volume?: Keyframe[];
  /** −1..1, in place of the mixer's pan */
  pan?: Keyframe[];
  /** the tone filter's cutoff, Hz */
  tone?: Keyframe[];
  reverb?: Keyframe[];
  delay?: Keyframe[];
  /** an insert's setting: `<insert id>.<setting>` */
  [insertParam: `${string}.${string}`]: Keyframe[] | undefined;
};

/**
 * What a track plays: a SoundFont preset by its General MIDI bank and program, a synth or a sampler (PRD §13). A synth
 * or sampler track keeps a program too: what a MIDI export names, and what a build without them plays instead. `synth`
 * and `sample` are their settings as saved (`SynthSettings` and `SamplerSettings` in @chordinal/audio, which sits beside
 * this package): whatever plays or shows them reads them through `synthSettings` or `samplerSettings`, which fill in
 * what's missing. A track has one of them at most.
 */
export interface TrackInstrument {
  bank: number;
  program: number;
  synth?: object;
  sample?: object;
  /** a drum track's samples by key, each played in place of the kit's sound on its row: `{ "36": { name, file } }` */
  drumSamples?: object;
}

/** stepRows: the drum keys the step grid shows for the track (PRD §4.6) */
export interface Track {
  id: string;
  name: string;
  color: number[];
  instrument: TrackInstrument;
  mixer: Mixer;
  fx: TrackFx[];
  /** the audio effects in its strip, in the order the sound goes through them; missing when it has none */
  inserts?: Insert[];
  automation: Automation;
  clips: Clip[];
  stepRows?: number[];
  /** 'audio' for a track that plays audio clips rather than notes (PRD §16.1); missing for a MIDI track */
  kind?: 'audio';
  /** an audio track's clips, in start order; missing on a MIDI track */
  audio?: AudioClip[];
}

/** markers' meta is for MIDI FX */
export interface Marker {
  beat: number;
  name: string;
  meta?: Record<string, unknown>;
}

export interface Loop {
  from: number;
  to: number;
}

/** symbol: the chord's reading in the key, for one recorded */
export interface ChordSpan {
  beat: number;
  beats: number;
  name: string;
  tones: number[];
  symbol?: string;
}

/** patterns: missing means none, so projects made before patterns (and the composer's) stay as they were;
 * groove: settings a MIDI FX shares across tracks (swing, style) */
export interface Project {
  title: string;
  length: number;
  tempoMap: TempoSegment[];
  meters: MeterChange[];
  key: { tonic: number; mode: string } | null;
  markers: Marker[];
  loop: Loop | null;
  groove: Record<string, unknown>;
  chords: ChordSpan[];
  tracks: Track[];
  patterns?: Pattern[];
  /** the master's audio effects, after every track is mixed and before the mastering chain; missing when it has none */
  masterInserts?: Insert[];
}

export const TRACK_COLORS: number[][] = [
  [1, 0.78, 0.4],
  [0.45, 0.8, 1],
  [0.6, 0.85, 0.5],
  [0.98, 0.55, 0.62],
  [0.7, 0.62, 1],
  [1, 0.6, 0.35],
  [0.85, 0.85, 0.9],
];

const defaultMixer = (): Mixer => ({
  volumeDb: -6,
  pan: 0,
  mute: false,
  solo: false,
  lowCut: 20,
  sends: { reverb: 0.15, delay: 0 },
  autoPan: null,
  duck: null,
});

export function emptyProject({
  title = 'Untitled',
  bpm = 120,
  sig = '4/4',
  bars = 16,
}: { title?: string; bpm?: number; sig?: string; bars?: number } = {}): Project {
  const bpb = (Number(sig.split('/')[0]) * 4) / Number(sig.split('/')[1]);
  return {
    title,
    length: bars * bpb,
    tempoMap: [{ beat: 0, bpm }],
    meters: [{ beat: 0, sig }],
    key: null,
    markers: [],
    loop: null,
    groove: {},
    chords: [],
    tracks: [],
  };
}

/** an id not yet used in the project, like 't3' or 'c12' */
export function newId(project: Project, prefix: string): string {
  const used = new Set(
    project.tracks.flatMap((t) => [t.id, ...t.clips.map((c) => c.id), ...(t.audio ?? []).map((c) => c.id)]),
  );
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export interface TrackOptions {
  name?: string;
  instrument?: TrackInstrument;
  color?: number[] | null;
  mixer?: Partial<Mixer>;
}

export function makeTrack(
  project: Project,
  { name = 'Instrument', instrument = { bank: 0, program: 0 }, color = null, mixer = {} }: TrackOptions = {},
): Track {
  return {
    id: newId(project, 't'),
    name,
    // the index is taken modulo the list's length, so it is always in range
    color: color ?? TRACK_COLORS[project.tracks.length % TRACK_COLORS.length]!,
    instrument,
    mixer: { ...defaultMixer(), ...mixer },
    fx: [],
    automation: {},
    clips: [],
  };
}

/** a drum kit's bank, by General MIDI convention */
export const isDrums = (track: Pick<Track, 'instrument'>): boolean => track.instrument.bank >= 128;

/** the track's notes at their place in the project (clip start + beat), sorted; a note starting in a clip plays out its
 * full length, so a chord can ring into the next section */
export function trackNotes(track: Track): Note[] {
  const out: Note[] = [];
  for (const c of track.clips)
    if (!c.mute)
      for (const n of c.notes)
        if (n.beat < c.beats - 1e-9 && n.beat >= -1e-9) out.push({ ...n, beat: c.start + n.beat });
  return out.sort((a, b) => a.beat - b.beat || a.key - b.key);
}

/** where the project ends: its length, or past it when a clip runs on */
/** the beat an audio clip ends on: it plays for its seconds at the file's own speed, whatever the tempo (PRD §16.3) */
export const audioClipEnd = (map: TempoSegment[], c: Pick<AudioClip, 'start' | 'seconds'>): number =>
  secondsToBeat(map, beatToSeconds(map, c.start) + c.seconds);

export const projectEnd = (p: Project): number =>
  Math.max(
    p.length,
    ...p.tracks.flatMap((t) => [
      ...t.clips.map((c) => c.start + c.beats),
      ...(t.audio ?? []).map((c) => audioClipEnd(p.tempoMap, c)),
    ]),
  );

// ── edits ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** a change to a track or a clip: the fields to set, or a function from the old one to the new */
export type Patch<T> = Partial<T> | ((x: T) => T);

const patchOf = <T extends object>(x: T, patch: Patch<T>): T =>
  typeof patch === 'function' ? patch(x) : { ...x, ...patch };

/** whether a patch changed nothing: the same fields holding the same values */
function unchanged(a: object, b: object): boolean {
  if (a === b) return true;
  const fields = Object.entries(a),
    other = new Map(Object.entries(b));
  return fields.length === other.size && fields.every(([k, v]) => v === other.get(k));
}

/** changes a track: a patch object, or a function from the old track to the new; one that changes nothing gives back
 * the same project, so it's no undo step (PRD §6.1) */
export function updateTrack(p: Project, id: string, patch: Patch<Track>): Project {
  let changed = false;
  const tracks = p.tracks.map((t) => {
    if (t.id !== id) return t;
    const next = patchOf(t, patch);
    if (unchanged(t, next)) return t;
    changed = true;
    return next;
  });
  return changed ? { ...p, tracks } : p;
}

/** changes a track's mixer; one that changes nothing gives back the same project, so it's no undo step */
export function setMixer(p: Project, id: string, patch: Partial<Mixer>): Project {
  return updateTrack(p, id, (t) => {
    const mixer = { ...t.mixer, ...patch };
    return unchanged(t.mixer, mixer) ? t : { ...t, mixer };
  });
}

export function addTrack(p: Project, track: Track, index: number = p.tracks.length): Project {
  const tracks = [...p.tracks];
  tracks.splice(index, 0, track);
  return { ...p, tracks };
}

/** removes a track, and any ducking that listened to it */
export const removeTrack = (p: Project, id: string): Project => ({
  ...p,
  tracks: p.tracks
    .filter((t) => t.id !== id)
    .map((t) => (t.mixer.duck?.from === id ? { ...t, mixer: { ...t.mixer, duck: null } } : t)),
});

/** adds a clip; a pattern clip takes its pattern's notes, length and step from the clips already playing it, and one
 * of a pattern the project doesn't have is added as an ordinary clip (PRD §3.5) */
export function addClip(p: Project, trackId: string, clip: Clip): Project {
  if (p.tracks.find((t) => t.id === trackId)?.kind === 'audio') return p; // an audio track plays no notes (PRD §16.1)
  let added = clip;
  if (clip.pattern) {
    const sibling = p.tracks
      .flatMap((t) => t.clips)
      .find((c) => c.pattern === clip.pattern && c.id !== clip.id);
    added = !findPattern(p, clip.pattern) ? unlinked(clip) : sibling ? withShared(clip, sibling) : clip;
  }
  return updateTrack(p, trackId, (t) => ({
    ...t,
    clips: [...t.clips, added].sort((a, b) => a.start - b.start),
  }));
}

/** changes a clip; a change to a pattern clip's notes, length or step goes to every clip of its pattern (PRD §3.3) */
export function updateClip(p: Project, trackId: string, clipId: string, patch: Patch<Clip>): Project {
  const old = findClip(p, trackId, clipId);
  if (!old) return p;
  const next = patchOf(old, patch);
  if (unchanged(old, next)) return p; // no undo step (PRD §6.1)
  const out = updateTrack(p, trackId, (t) => ({
    ...t,
    clips: t.clips.map((c) => (c.id === clipId ? next : c)).sort((a, b) => a.start - b.start),
  }));
  if (!next.pattern || next.pattern !== old.pattern || LINKED.every((k) => next[k] === old[k])) return out;
  return spreadPattern(out, next);
}

// ── patterns ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** what every clip of a pattern shares (PRD §3.2) */
const LINKED = ['notes', 'beats', 'step'] as const;

/** a clip with these shared fields from another; a missing step stays missing */
function withShared(clip: Clip, from: Clip): Clip {
  const { step, ...rest } = clip;
  return {
    ...rest,
    notes: from.notes,
    beats: from.beats,
    ...(from.step !== undefined && { step: from.step }),
  };
}

/** every other clip of `source`'s pattern made to match it */
function spreadPattern(p: Project, source: Clip): Project {
  return {
    ...p,
    tracks: p.tracks.map((t) =>
      t.clips.some((c) => c.pattern === source.pattern && c.id !== source.id)
        ? {
            ...t,
            clips: t.clips.map((c) =>
              c.pattern === source.pattern && c.id !== source.id ? withShared(c, source) : c,
            ),
          }
        : t,
    ),
  };
}

/** a clip on its own again: no pattern */
export const unlinked = ({ pattern, ...clip }: Clip): Clip => clip;

export const patternsOf = (p: Project): Pattern[] => p.patterns ?? [];

export const findPattern = (p: Project, id: string): Pattern | null =>
  patternsOf(p).find((x) => x.id === id) ?? null;

/** the Web Crypto every runtime the app runs on has (the engine has no DOM or Node types) */
declare const crypto: { randomUUID(): string };

/** a new pattern id, unique across projects and never reused, so a clip copied from another project, or from before
 * an undo, can't join a pattern it was never part of (PRD §3.5) */
function newPatternId(p: Project): string {
  const used = new Set(patternsOf(p).map((x) => x.id));
  let id: string;
  do id = `p-${crypto.randomUUID().slice(0, 8)}`;
  while (used.has(id));
  return id;
}

/** the next free name for a pattern on a track: "Drums 1", "Drums 2" (PRD §3.4) */
export function nextPatternName(p: Project, base: string): string {
  const names = new Set(patternsOf(p).map((x) => x.name)),
    stem = base.trim();
  const name = (n: number) => `${stem} ${n}`.trim();
  let n = 1;
  while (names.has(name(n))) n++;
  return name(n);
}

/** an ordinary clip turned into the only clip of a new pattern (PRD §3.4); a pattern clip is left as it is. The name is
 * kept trimmed, as renamePattern keeps it, and an empty one becomes "Pattern 1" or the next free number. */
export function makePattern(p: Project, trackId: string, clipId: string, name: string): Project {
  const clip = findClip(p, trackId, clipId);
  if (!clip || clip.pattern) return p;
  const id = newPatternId(p),
    clean = name.trim() || nextPatternName(p, 'Pattern');
  return updateClip({ ...p, patterns: [...patternsOf(p), { id, name: clean }] }, trackId, clipId, {
    pattern: id,
  });
}

/** a pattern clip turned into an ordinary clip with the same notes (PRD §3.6) */
export function makeUnique(p: Project, trackId: string, clipId: string): Project {
  const clip = findClip(p, trackId, clipId);
  if (!clip?.pattern) return p;
  return updateClip(p, trackId, clipId, unlinked);
}

/** a new name for a pattern; an empty or unchanged name changes nothing (PRD §3.7) */
export function renamePattern(p: Project, id: string, name: string): Project {
  const pattern = findPattern(p, id),
    clean = name.trim();
  if (!pattern || !clean || clean === pattern.name) return p;
  return { ...p, patterns: patternsOf(p).map((x) => (x === pattern ? { ...x, name: clean } : x)) };
}

/** what's wrong with the project's patterns, for tests: clips of a pattern that disagree, clips of a missing pattern */
export function patternProblems(p: Project): string[] {
  const problems: string[] = [],
    first = new Map<string, Clip>();
  for (const t of p.tracks)
    for (const c of t.clips) {
      if (!c.pattern) continue;
      if (!findPattern(p, c.pattern)) problems.push(`clip ${c.id} plays a missing pattern ${c.pattern}`);
      const f = first.get(c.pattern);
      if (!f) {
        first.set(c.pattern, c);
        continue;
      }
      for (const k of LINKED)
        if (JSON.stringify(f[k]) !== JSON.stringify(c[k]))
          problems.push(`clips ${f.id} and ${c.id} of ${c.pattern} differ in ${k}`);
    }
  return problems;
}

export const removeClip = (p: Project, trackId: string, clipId: string): Project =>
  updateTrack(p, trackId, (t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) }));

export const findClip = (p: Project, trackId: string, clipId: string): Clip | null =>
  p.tracks.find((t) => t.id === trackId)?.clips.find((c) => c.id === clipId) ?? null;

/** moves a clip to another start and maybe another track; with copy, leaves the original where it was */
export function moveClip(
  p: Project,
  fromTrack: string,
  clipId: string,
  toTrack: string,
  start: number,
  copy = false,
): Project {
  const clip = findClip(p, fromTrack, clipId);
  if (!clip || p.tracks.find((t) => t.id === toTrack)?.kind === 'audio') return p;
  const out = copy ? p : removeClip(p, fromTrack, clipId);
  return addClip(out, toTrack, { ...clip, id: copy ? newId(p, 'c') : clip.id, start: Math.max(0, start) });
}

/** cuts the clips under a beat in two there, audio clips too: every track's, or one track's */
export function splitAt(p: Project, beat: number, trackId: string | null = null): Project {
  let out = p;
  for (const t of p.tracks) {
    if (trackId && t.id !== trackId) continue;
    for (const c of t.clips) {
      if (beat <= c.start + 1e-9 || beat >= c.start + c.beats - 1e-9) continue;
      const cut = beat - c.start;
      // PRD §3.8: the pieces of a cut pattern clip are ordinary clips
      const left = {
        ...unlinked(c),
        beats: cut,
        notes: c.notes
          .filter((n) => n.beat < cut - 1e-9)
          .map((n) => ({ ...n, beats: Math.min(n.beats, cut - n.beat) })),
      };
      const right = {
        ...unlinked(c),
        id: newId(out, 'c'),
        start: beat,
        beats: c.beats - cut,
        notes: c.notes
          .filter((n) => n.beat >= cut - 1e-9)
          .map((n) => ({ ...n, beat: Math.max(0, n.beat - cut) })), // a note on the cut starts at 0, not at -1e-16
      };
      out = addClip(
        updateClip(out, t.id, c.id, () => left),
        t.id,
        right,
      );
    }
    for (const c of t.audio ?? []) {
      const cut = beatToSeconds(p.tempoMap, beat) - beatToSeconds(p.tempoMap, c.start);
      if (beat <= c.start + 1e-9 || cut >= c.seconds - 1e-6) continue;
      // PRD §16.6: the left piece keeps the fade in, the right one the fade out, each within its length
      const left = { ...c, seconds: cut, fadeIn: Math.min(c.fadeIn, cut), fadeOut: 0 };
      const right = {
        ...c,
        id: newId(out, 'a'),
        start: beat,
        offset: c.offset + cut,
        seconds: c.seconds - cut,
        fadeIn: 0,
        fadeOut: Math.min(c.fadeOut, c.seconds - cut),
      };
      out = updateTrack(out, t.id, (x) => ({
        ...x,
        audio: [...(x.audio ?? []).filter((a) => a.id !== c.id), left, right].sort(
          (a, b) => a.start - b.start,
        ),
      }));
    }
  }
  return out;
}

/** moves a track up (by < 0) or down the list */
export function moveTrack(p: Project, id: string, by: number): Project {
  const i = p.tracks.findIndex((t) => t.id === id),
    j = i + by;
  if (i < 0 || j < 0 || j >= p.tracks.length) return p;
  const tracks = [...p.tracks];
  tracks.splice(j, 0, ...tracks.splice(i, 1));
  return { ...p, tracks };
}

/** a copy of a track below it, with new ids for it and its clips */
export function duplicateTrack(p: Project, id: string): Project {
  const i = p.tracks.findIndex((t) => t.id === id);
  const t = p.tracks[i];
  if (!t) return p;
  const copy = {
    ...t,
    id: newId(p, 't'),
    name: `${t.name} copy`,
    clips: [],
    ...(t.audio && { audio: [] }),
    mixer: { ...t.mixer, solo: false },
  };
  let out = addTrack(p, copy, i + 1);
  for (const c of t.clips) out = addClip(out, copy.id, { ...c, id: newId(out, 'c') });
  for (const c of t.audio ?? []) {
    const id = newId(out, 'a');
    out = updateTrack(out, copy.id, (x) => ({ ...x, audio: [...(x.audio ?? []), { ...c, id }] }));
  }
  return out;
}

/** joins clips of a track into one spanning them all, at the first's id */
export function joinClips(p: Project, trackId: string, clipIds: string[]): Project {
  const t = p.tracks.find((x) => x.id === trackId);
  const clips = t ? t.clips.filter((c) => clipIds.includes(c.id)) : [];
  if (clips.length < 2) return p;
  const start = Math.min(...clips.map((c) => c.start)),
    end = Math.max(...clips.map((c) => c.start + c.beats));
  const notes = clips
    .flatMap((c) =>
      c.notes.filter((n) => n.beat < c.beats).map((n) => ({ ...n, beat: n.beat + c.start - start })),
    )
    .sort((a, b) => a.beat - b.beat || a.key - b.key);
  const first = clips.reduce((a, b) => (b.start < a.start ? b : a));
  return updateTrack(p, trackId, (x) => ({
    ...x,
    clips: x.clips
      .filter((c) => c === first || !clipIds.includes(c.id))
      .map((c) => (c === first ? { ...unlinked(c), start, beats: end - start, notes } : c)),
  }));
}
