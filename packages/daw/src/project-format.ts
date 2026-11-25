// The project file: project.json in a project's folder. JSON, two-space indented so changes diff well, except that each
// note is one compact line, [beat, beats, key, vel] with its marks as a fifth item when it has any, so a song is a
// few hundred kilobytes rather than megabytes. Pure.
//
// Version 1 has every clip's notes in the clip. Version 2 adds patterns (PRD §7): their notes, length, step, swing and
// track are written once in `patterns`, placed or not (Chordinal PRD §18.8), and a pattern clip is just
// { id, start, pattern, mute? }. A project with no patterns is written as version 1, so older versions of the app
// still open it. Version 3 adds audio tracks (PRD §16): a project with one is written as version 3, which older
// versions refuse rather than play without its audio.
import type { Clip, Note, Pattern, Project, Track } from './project.ts';

export const FORMAT = 'music-generator-project';
export const VERSION = 1;
export const PATTERN_VERSION = 2;
export const AUDIO_VERSION = 3;

/** a note as written: [beat, beats, key, vel], and its marks when it has any */
type NoteRow = [number, number, number, number, Record<string, unknown>?];

/** a pattern as written: the notes, length, step and swing its clips share, and its track, null once that track is
 * deleted; a file from before Chordinal PRD §18 has no track */
type WrittenPattern = Omit<Pattern, 'notes' | 'track'> & { track?: string | null; notes: NoteRow[] };

/** a clip as written; a pattern clip has no notes or length of its own, as reading gives it its pattern's */
type WrittenClip = Omit<Clip, 'notes'> & { notes: NoteRow[] };
type WrittenTrack = Omit<Track, 'clips'> & { clips: WrittenClip[] };

/** a project as written, once its format and version are taken off; the settings the app fills in may be missing */
type WrittenProject = Omit<
  Project,
  'tracks' | 'patterns' | 'key' | 'markers' | 'loop' | 'groove' | 'chords'
> &
  Partial<Pick<Project, 'key' | 'markers' | 'loop' | 'groove' | 'chords'>> & { tracks: WrittenTrack[] };

/** the order a project's settings are written in, before its patterns and tracks; any others follow */
const ORDER = ['title', 'length', 'tempoMap', 'meters', 'key', 'markers', 'loop', 'groove', 'chords'];
const round = (x: number) => Math.round(x * 1e4) / 1e4;

export function writeProject(project: Project): string {
  const rows: string[] = [];
  const placeholders = (notes: Note[]) =>
    notes.map((n) => {
      const { beat, beats, key, vel, ...marks } = n;
      const row: (number | Record<string, unknown>)[] = [round(beat), round(beats), key, vel];
      if (Object.keys(marks).length) row.push(marks);
      rows.push(JSON.stringify(row));
      return `\u0000${rows.length - 1}`;
    });
  const { patterns = [], ...rest } = project;
  // a fixed order, whatever order the project's keys are in, so opening and saving a project changes nothing
  const { tracks: _tracks, ...settings } = rest;
  const values = new Map<string, unknown>(Object.entries(settings));
  const ordered = Object.fromEntries(
    [...ORDER.filter((k) => values.has(k)), ...[...values.keys()].filter((k) => !ORDER.includes(k))].map(
      (k) => [k, values.get(k)],
    ),
  );
  const body = {
    format: FORMAT,
    version: project.tracks.some((t) => t.kind === 'audio')
      ? AUDIO_VERSION
      : patterns.length
        ? PATTERN_VERSION
        : VERSION,
    ...ordered,
    ...(patterns.length && {
      patterns: patterns.map((x) => ({
        id: x.id,
        name: x.name,
        track: x.track ?? null,
        ...(x.drums && { drums: true }),
        beats: x.beats,
        ...(x.step !== undefined && { step: x.step }),
        ...(x.swing !== undefined && { swing: x.swing }),
        notes: placeholders(x.notes),
      })),
    }),
    tracks: project.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) =>
        c.pattern
          ? { id: c.id, start: c.start, pattern: c.pattern, ...(c.mute && { mute: true }) }
          : { ...c, notes: placeholders(c.notes) },
      ),
    })),
  };
  return JSON.stringify(body, null, 2).replace(/"\\u0000(\d+)"/g, (_, i) => rows[Number(i)] ?? '') + '\n';
}

const readNotes = (list: NoteRow[]): Note[] =>
  list.map((row) => ({ beat: row[0], beats: row[1], key: row[2], vel: row[3], ...row[4] }));

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isList = (x: unknown): x is unknown[] => Array.isArray(x);
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

/** a field of a value read from the file, as `x?.[key]` reads it */
const field = (x: unknown, key: string): unknown => (isRecord(x) ? x[key] : undefined);

/** what is wrong with a note row as written, or null */
function badRow(row: unknown): string | null {
  if (!isList(row) || row.length < 4) return 'is not [beat, beats, key, vel]';
  const [beat, beats, key, vel, marks] = row;
  if (!isNum(beat) || beat < 0) return 'has no beat of 0 or more';
  if (!isNum(beats) || beats <= 0) return 'has no length above 0';
  if (typeof key !== 'number' || !Number.isInteger(key) || key < 0 || key > 127)
    return 'has no key from 0 to 127';
  if (!isNum(vel) || vel < 0 || vel > 127) return 'has no velocity from 0 to 127';
  if (marks !== undefined && (typeof marks !== 'object' || marks === null || isList(marks)))
    return 'has marks that are not an object';
  return null;
}

/** what is wrong with an audio clip as written, or null */
function badAudioClip(c: unknown): string | null {
  if (typeof field(c, 'file') !== 'string' || !field(c, 'file')) return 'has no file';
  for (const key of ['start', 'offset', 'seconds', 'gain', 'fadeIn', 'fadeOut']) {
    const x = field(c, key);
    if (!isNum(x) || x < 0) return `has no ${key} of 0 or more`;
  }
  return null;
}

/** the first problem in a list of note rows, or null */
function badRows(notes: unknown[]): { k: number; bad: string } | null {
  for (const [k, row] of notes.entries()) {
    const bad = badRow(row);
    if (bad) return { k, bad };
  }
  return null;
}

/** the first thing in a read project (before its notes are unpacked) that the app can't play, or null */
function problemIn(project: Record<string, unknown>, patterns: unknown): string | null {
  const { title, length, tempoMap, meters, tracks } = project;
  if (typeof title !== 'string') return 'title is not text';
  if (!isNum(length) || length <= 0) return 'length is not above 0';
  if (!isList(tempoMap) || !tempoMap.length || field(tempoMap[0], 'beat') !== 0)
    return 'tempo map does not start at beat 0';
  for (const [i, s] of tempoMap.entries()) {
    const beat = field(s, 'beat'),
      bpm = field(s, 'bpm'),
      to = field(s, 'to');
    if (!isNum(beat) || !isNum(bpm) || bpm <= 0 || (to !== undefined && (!isNum(to) || to <= 0)))
      return `tempo change ${i + 1} has no tempo above 0`;
  }
  if (!isList(meters) || !meters.length) return 'meters are missing';
  for (const [i, m] of meters.entries())
    if (!isNum(field(m, 'beat')) || !/^\d+\/\d+$/.test(String(field(m, 'sig') ?? '')))
      return `meter ${i + 1} is not like 4/4`;
  if (!isList(patterns)) return 'patterns are not a list';
  for (const x of patterns) {
    const id = field(x, 'id'),
      beats = field(x, 'beats'),
      notes = field(x, 'notes');
    if (typeof id !== 'string' || !isNum(beats) || beats <= 0 || !isList(notes))
      return `pattern ${String(id ?? '?')} has no id, length or notes`;
    const first = badRows(notes);
    if (first) return `pattern ${id}, note ${first.k + 1} ${first.bad}`;
  }
  if (!isList(tracks)) return 'tracks are not a list';
  const ids = new Set<string>();
  for (const [i, t] of tracks.entries()) {
    const name = `track ${i + 1}`,
      id = field(t, 'id'),
      clips = field(t, 'clips');
    if (typeof id !== 'string' || ids.has(id)) return `${name} has no id of its own`;
    ids.add(id);
    if (!isList(clips)) return `${name} has no list of clips`;
    for (const c of clips) {
      const cid = field(c, 'id'),
        start = field(c, 'start'),
        beats = field(c, 'beats'),
        notes = field(c, 'notes');
      if (typeof cid !== 'string' || ids.has(cid)) return `${name} has a clip with no id of its own`;
      ids.add(cid);
      if (!isNum(start) || start < 0) return `${name}, clip ${cid} has no start of 0 or more`;
      if (field(c, 'pattern') !== undefined) continue;
      if (!isNum(beats) || beats <= 0) return `${name}, clip ${cid} has no length above 0`;
      if (!isList(notes)) return `${name}, clip ${cid} has no list of notes`;
      const first = badRows(notes);
      if (first) return `${name}, clip ${cid}, note ${first.k + 1} ${first.bad}`;
    }
    const kind = field(t, 'kind'),
      audio = field(t, 'audio');
    if (kind !== undefined && kind !== 'audio') return `${name} is of a kind this app doesn't know`;
    if (audio === undefined) continue;
    if (kind !== 'audio' || !isList(audio)) return `${name} has audio clips but is not an audio track`;
    for (const c of audio) {
      const cid = field(c, 'id');
      if (typeof cid !== 'string' || ids.has(cid)) return `${name} has an audio clip with no id of its own`;
      ids.add(cid);
      const bad = badAudioClip(c);
      if (bad) return `${name}, audio clip ${cid} ${bad}`;
    }
  }
  return null;
}

export function readProject(text: string): Project {
  const data: unknown = JSON.parse(text);
  if (!isRecord(data) || data.format !== FORMAT) throw new Error('not a Chordinal project');
  if (data.version !== VERSION && data.version !== PATTERN_VERSION && data.version !== AUDIO_VERSION)
    throw new Error(
      `project version ${String(data.version)}; this app reads versions ${VERSION} to ${AUDIO_VERSION}`,
    );
  const { format, version, patterns: written = [], ...project } = data;
  for (const key of ['title', 'length', 'tempoMap', 'meters', 'tracks'])
    if (project[key] === undefined) throw new Error(`the project has no ${key}`);
  const problem = problemIn(project, written);
  if (problem) throw new Error(`the project's ${problem}`);
  // problemIn has checked all the app relies on to play it; the rest is read as written
  const file = project as WrittenProject,
    list = written as WrittenPattern[];
  // Chordinal PRD §18.8: a pattern on a track the file doesn't have is one whose track was deleted, and one from a
  // file from before patterns had tracks is on the track of its first clip
  const trackIds = new Set(file.tracks.map((t) => t.id));
  const firstTrack = (id: string) => file.tracks.find((t) => t.clips.some((c) => c.pattern === id))?.id;
  const patterns = new Map(
    list.map((written): [string, Pattern] => {
      const { track, ...x } = written,
        on = track === undefined ? firstTrack(x.id) : track;
      return [x.id, { ...x, ...(on && trackIds.has(on) && { track: on }), notes: readNotes(x.notes) }];
    }),
  );
  const tracks = file.tracks.map((t): Track => ({
    ...t,
    clips: t.clips.map((c): Clip => {
      if (!c.pattern) return { ...c, notes: readNotes(c.notes) };
      const x = patterns.get(c.pattern);
      if (!x) throw new Error(`clip ${c.id} plays pattern ${c.pattern}, which the project doesn't have`);
      // PRD §7.5: in memory every pattern clip holds its pattern's notes, length, step and swing
      return {
        ...c,
        beats: x.beats,
        notes: x.notes,
        ...(x.step !== undefined && { step: x.step }),
        ...(x.swing !== undefined && { swing: x.swing }),
      };
    }),
  }));
  return {
    key: null,
    markers: [],
    loop: null,
    groove: {},
    chords: [],
    ...file,
    tracks,
    ...(patterns.size ? { patterns: [...patterns.values()] } : {}),
  };
}
