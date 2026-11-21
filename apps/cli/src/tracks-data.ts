// The tracks-data file `chordinal render --data` writes for a game: `export const TRACKS = {...}`, one entry per
// rendered track keyed by its id, with where its beats, loop and bar lines fall in its file. Entries for tracks not
// rendered this time are kept from the file as it was. Pure.
import type { Span } from './soundtrack.ts';

/** what a render found out about a track's file */
export interface TrackInfo {
  title: string;
  tempo: number;
  beatsPerBar: number;
  offset: number;
  end: number | null;
  seconds: number;
  frames: number;
  rate: number;
  loop: Span | null;
  bars: number[] | null;
}

/** one entry in the file */
export interface TrackEntry extends Omit<TrackInfo, 'bars'> {
  file: string;
  bars?: number[];
  [extra: string]: unknown;
}

/** a track of the soundtrack, as the writer needs it: its id, and the fields of its entry in the songs file that the game reads */
export interface DataTrack {
  id: string;
  extra: Record<string, unknown>;
}

const HEADER = `// The soundtrack: one entry per track, keyed by its id. Written by \`chordinal render\`; don't edit by hand.
// Times are seconds into the file. offset is where the first beat falls, so beats sit at offset + n * 60 / tempo,
// and end is where the last bar ends (a one-shot's reverb rings on after it; null for a looping track). loop is the
// part a looping track repeats, start and end on bar lines; null plays once. frames at rate is the file's exact
// length, for checking a decoder trimmed the mp3's encoder delay. bars, when the meter changes, lists every bar line
// (seconds into the file) up to the loop's end. Any other field is copied from the track's entry in the songs file.
`;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const span = (v: unknown): Span | null => {
  if (!isRecord(v)) return null;
  const start = num(v.start),
    end = num(v.end);
  return start === null || end === null ? null : { start, end };
};

/** an entry of an earlier file read back, or null when it isn't one */
function infoOf(v: unknown): TrackInfo | null {
  if (!isRecord(v)) return null;
  const title = v.title,
    tempo = num(v.tempo),
    beatsPerBar = num(v.beatsPerBar),
    offset = num(v.offset),
    seconds = num(v.seconds),
    frames = num(v.frames),
    rate = num(v.rate) ?? num(v.sampleRate);
  if (
    typeof title !== 'string' ||
    tempo === null ||
    beatsPerBar === null ||
    offset === null ||
    seconds === null ||
    frames === null ||
    rate === null
  )
    return null;
  const bars = Array.isArray(v.bars) ? v.bars.filter((x): x is number => typeof x === 'number') : null;
  return {
    title,
    tempo,
    beatsPerBar,
    offset,
    end: num(v.end),
    seconds,
    frames,
    rate,
    loop: span(v.loop),
    bars,
  };
}

/** the entries of an earlier tracks-data file, by id; an empty map when it has none */
export function readTracksData(text: string): Map<string, TrackInfo> {
  const found = new Map<string, TrackInfo>();
  const m = /export const TRACKS = (\{[\s\S]*\});/.exec(text);
  if (!m?.[1]) return found;
  let parsed: unknown;
  try {
    parsed = JSON.parse(m[1]);
  } catch {
    return found;
  }
  if (!isRecord(parsed)) return found;
  for (const [id, entry] of Object.entries(parsed)) {
    const info = infoOf(entry);
    if (info) found.set(id, info);
  }
  return found;
}

/**
 * The file's text: an entry for each track in `tracks` (the songs file's order) that was rendered now (`fresh`) or
 * before (`old`), its `file` from `fileOf`, and its extra fields copied in. Tracks no longer in the songs file drop out.
 */
export function writeTracksData(
  tracks: readonly DataTrack[],
  fresh: ReadonlyMap<string, TrackInfo>,
  old: ReadonlyMap<string, TrackInfo>,
  fileOf: (id: string) => string,
): string {
  const all: Record<string, TrackEntry> = {};
  for (const t of tracks) {
    const info = fresh.get(t.id) ?? old.get(t.id);
    if (!info) continue;
    all[t.id] = {
      file: fileOf(t.id),
      title: info.title,
      tempo: info.tempo,
      beatsPerBar: info.beatsPerBar,
      offset: info.offset,
      end: info.end,
      seconds: +info.seconds.toFixed(4),
      frames: info.frames,
      rate: info.rate,
      loop: info.loop,
      ...(info.bars && { bars: info.bars }),
      ...t.extra,
    };
  }
  return `${HEADER}export const TRACKS = ${JSON.stringify(all, null, 4)};\n`;
}
