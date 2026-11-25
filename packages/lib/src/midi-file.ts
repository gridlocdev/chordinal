// Standard MIDI Files: writes one (format 1) from tracks of notes timed in beats, so a score opens in any DAW, and reads
// one (format 0 or 1) back into tracks of notes. A note tuned off its key (cents) is written as pitch bend on its channel,
// and read back from it; a note's bend (a curve over the note) as pitch bend that moves while it sounds, on a channel to
// itself. A track's bend range is 2 semitones, or wider when its notes bend further (a fall of an octave), set on each
// channel by RPN 0; reading, a channel's range comes from its RPN 0, else 2 semitones. Pure.
import { bendAt } from './bend.ts';
import type { BendPoint } from './bend.ts';

const PPQ = 480; // ticks per beat
const BEND_STEP = PPQ / 32; // how often a bend that moves over a note is written, in ticks
const BEND_CENTER = 8192;
const BEND_RANGE = 200; // cents either way: the General MIDI default of 2 semitones, set on each channel that bends
const MAX_BEND_RANGE = 2400; // the widest range written: 24 semitones, as far as a note's bend goes

// the text codecs every JavaScript runtime has; the engine's typecheck leaves out the DOM and Node types that hold them
declare const TextEncoder: new () => { encode(text: string): Uint8Array };
declare const TextDecoder: new () => { decode(bytes: Uint8Array): string };

/**
 * cents: tuned this far off the key, written as pitch bend on its channel; bend: a curve over the note on top of that
 * (BendPoint), written as pitch bend that moves while the note sounds; together at most ±2400 cents
 */
export interface MidiNote {
  key: number;
  beat: number;
  beats: number;
  vel: number;
  cents?: number;
  bend?: BendPoint[];
}
/**
 * channels: more channels the track may use, so notes tuned differently at once (a just-tuned chord) can each bend on
 * a channel of their own; without a free one, a note shares the nearest bend
 */
export interface MidiTrack {
  name: string;
  channel: number;
  program: number;
  notes: MidiNote[];
  channels?: number[];
}
export interface MidiTempo {
  beat: number;
  bpm: number;
}
export interface MidiMeter {
  beat: number;
  num: number;
  den: number;
}

/** a song to write; tempos and meters, when given, replace the single tempo and beatsPerBar with changes at those beats */
export interface MidiSong {
  tempo: number;
  beatsPerBar: number;
  title?: string;
  tempos?: MidiTempo[];
  meters?: MidiMeter[];
  tracks: MidiTrack[];
}

/** a MIDI file read back */
export interface MidiFile {
  title: string;
  tempos: MidiTempo[];
  meters: MidiMeter[];
  tracks: MidiTrack[];
}

interface MidiEvent {
  tick: number;
  order: number;
  bytes: number[];
}

export function writeMidi(song: MidiSong): Uint8Array {
  const tempos = song.tempos ?? [{ beat: 0, bpm: song.tempo }];
  const meters = song.meters ?? [{ beat: 0, num: song.beatsPerBar, den: 4 }];
  const conductor: MidiEvent[] = [
    { tick: 0, order: 0, bytes: meta(0, 0x03, text(song.title ?? '')).bytes },
    ...tempos.map((t) => ({
      tick: Math.round(t.beat * PPQ),
      order: 1,
      bytes: meta(0, 0x51, [...u24(Math.round(60e6 / t.bpm))]).bytes,
    })),
    ...meters.map((m) => ({
      tick: Math.round(m.beat * PPQ),
      order: 1,
      bytes: meta(0, 0x58, [m.num, Math.log2(m.den), 24, 8]).bytes,
    })),
  ].sort((a, b) => a.tick - b.tick || a.order - b.order);
  const chunks = [trackChunk(conductor)];
  for (const t of song.tracks) {
    const ch = t.channel & 15;
    const events: MidiEvent[] = [
      { tick: 0, order: 0, bytes: meta(0, 0x03, text(t.name)).bytes },
      { tick: 0, order: 0, bytes: [0xc0 | ch, t.program & 127] },
    ];
    const tuned = t.notes.some(isTuned);
    const channelOf = tuned ? bendChannels(t, events) : () => ch;
    // a tuned track's notes in start order, as its channels are handed out
    for (const n of tuned ? [...t.notes].sort((a, b) => a.beat - b.beat) : t.notes) {
      const on = Math.round(n.beat * PPQ),
        off = Math.max(on + 1, Math.round((n.beat + n.beats) * PPQ));
      const c = channelOf(n, on, off);
      events.push({ tick: on, order: 2, bytes: [0x90 | c, n.key & 127, Math.max(1, Math.min(127, n.vel))] });
      events.push({ tick: off, order: 1, bytes: [0x80 | c, n.key & 127, 0] });
    }
    // note-offs before note-ons at the same tick, so repeated notes don't cut each other off
    events.sort((a, b) => a.tick - b.tick || a.order - b.order);
    chunks.push(trackChunk(events));
  }
  const header = [...ascii('MThd'), ...u32(6), 0, 1, ...u16(chunks.length), ...u16(PPQ)];
  return new Uint8Array([...header, ...chunks.flat()]);
}

/**
 * The channels no track plays on, shared out among the tracks with tuned notes, so each can spread a chord tuned
 * several ways over channels of its own (MidiTrack.channels).
 */
export function shareSpareChannels(tracks: Pick<MidiTrack, 'channel' | 'notes' | 'channels'>[]): void {
  const used = new Set(tracks.map((t) => t.channel));
  const spare = [...Array(16).keys()].filter((c) => c !== 9 && !used.has(c));
  const tuned = tracks.filter((t) => t.channel !== 9 && t.notes.some(isTuned));
  tuned.forEach((t, i) => {
    t.channels = spare.filter((_c, k) => k % tuned.length === i);
  });
}

const isTuned = (n: MidiNote): boolean => !!n.cents || !!n.bend?.length;

/** a note's cents as a 14-bit pitch bend, over a bend range of `range` cents either way */
const bendValue = (cents: number, range: number): number =>
  Math.max(0, Math.min(16383, Math.round(BEND_CENTER + (cents / range) * BEND_CENTER)));

/** the bend range a track needs: 2 semitones, or whole semitones enough for its widest tuning and bend, up to 24 */
function bendRange(notes: MidiNote[]): number {
  let widest = 0;
  for (const n of notes) {
    const cents = n.cents ?? 0;
    widest = Math.max(widest, Math.abs(cents), ...(n.bend ?? []).map((p) => Math.abs(cents + p.cents)));
  }
  return Math.min(MAX_BEND_RANGE, Math.max(BEND_RANGE, Math.ceil(widest / 100) * 100));
}

/**
 * For a track with tuned notes: sets the bend range and program on each of its channels, and returns a function that
 * picks each note's channel (notes in start order) and writes the bend before it. A note goes to a channel already
 * bent to its tuning, else to one with nothing sounding (bent to it there), else to the channel bent nearest it. A
 * note with a bend curve takes a channel with nothing sounding and keeps it to itself while the bend moves; with none
 * free it shares the nearest and plays its first bend only.
 */
function bendChannels(t: MidiTrack, events: MidiEvent[]): (n: MidiNote, on: number, off: number) => number {
  const pool = [...new Set([t.channel, ...(t.channels ?? [])].map((c) => c & 15))];
  const range = bendRange(t.notes);
  // until: the last note-off on the channel; bentUntil: the end of a note bending there, which no other note joins
  const state = pool.map((c) => ({ c, bend: BEND_CENTER, until: 0, bentUntil: 0 }));
  for (const c of pool) {
    if (c !== (t.channel & 15)) events.push({ tick: 0, order: 0, bytes: [0xc0 | c, t.program & 127] });
    // RPN 0, pitch bend sensitivity: the track's range in semitones
    for (const [cc, v] of [
      [101, 0],
      [100, 0],
      [6, range / 100],
      [38, 0],
      [101, 127],
      [100, 127],
    ])
      events.push({ tick: 0, order: 0, bytes: [0xb0 | c, cc!, v!] });
  }
  const bendTo = (s: (typeof state)[number], value: number, tick: number) => {
    events.push({ tick, order: 1.5, bytes: [0xe0 | s.c, value & 127, value >> 7] });
    s.bend = value;
  };
  return (n, on, off) => {
    const curve = n.bend?.length ? n.bend : null;
    const cents = n.cents ?? 0;
    const want = bendValue(cents + (curve ? bendAt(curve, 0) : 0), range);
    const s =
      (curve ? undefined : state.find((x) => x.bend === want && x.bentUntil <= on)) ??
      state.find((x) => x.until <= on) ??
      state.reduce((a, b) => (Math.abs(b.bend - want) < Math.abs(a.bend - want) ? b : a));
    const free = s.until <= on;
    if (s.bend !== want && free) bendTo(s, want, on);
    if (curve && free) {
      for (let tick = on + BEND_STEP; tick < off; tick += BEND_STEP) {
        const value = bendValue(cents + bendAt(curve, (tick - on) / PPQ), range);
        if (value !== s.bend) bendTo(s, value, tick);
      }
      s.bentUntil = off;
    }
    s.until = Math.max(s.until, off);
    return s.c;
  };
}

function trackChunk(events: MidiEvent[]): number[] {
  const data: number[] = [];
  let last = 0;
  for (const e of events) {
    data.push(...varLen(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  data.push(0, 0xff, 0x2f, 0); // end of track
  return [...ascii('MTrk'), ...u32(data.length), ...data];
}

const meta = (tick: number, type: number, payload: number[]) => ({
  tick,
  bytes: [0xff, type, ...varLen(payload.length), ...payload],
});
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0) & 127);
const text = (s: string) => [...new TextEncoder().encode(s)];
const u16 = (n: number) => [(n >> 8) & 255, n & 255];
const u24 = (n: number) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
const u32 = (n: number) => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];

/** MIDI variable-length quantity: 7 bits per byte, high bit set on all but the last */
export function varLen(n: number): number[] {
  const out = [n & 127];
  while ((n >>= 7) > 0) out.unshift((n & 127) | 128);
  return out;
}

/** one channel of a track chunk being read: notes, the program, and the notes held (a stack for each key) */
/** a note sounding as a file is read: its start tick, velocity, the bend it started on and how the bend moved since */
interface Held {
  tick: number;
  vel: number;
  cents: number;
  bend: BendPoint[];
}
interface ChannelState {
  notes: MidiNote[];
  program: number | null;
  held: Map<number, Held[]>;
  bend: number;
  /** the bend range in cents either way, from RPN 0 (2 semitones until set); rpn: the parameter CC 101 and 100 chose */
  range: number;
  rpn: [number, number];
}

/**
 * Reads a Standard MIDI File (format 0 or 1). Each MIDI channel of each track chunk becomes a track of its own; a note
 * still held at the end of its chunk ends there. Times are in beats.
 */
export function readMidi(bytes: Uint8Array | ArrayBuffer | ArrayLike<number>): MidiFile {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // a byte past the end reads as undefined in plain JS; as 0 here, which the bit maths made of it anyway
  const at8 = (i: number) => b[i] ?? 0;
  const str = (at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));
  const u32At = (at: number) =>
    ((at8(at) << 24) >>> 0) + (at8(at + 1) << 16) + (at8(at + 2) << 8) + at8(at + 3);
  if (b.length < 14 || str(0, 4) !== 'MThd') throw new Error('not a MIDI file');
  const format = (at8(8) << 8) | at8(9),
    division = (at8(12) << 8) | at8(13);
  if (format > 1) throw new Error(`MIDI format ${format} isn't supported`);
  if (division & 0x8000) throw new Error("MIDI files timed in SMPTE frames aren't supported");
  const ppq = division || PPQ;
  const decoder = new TextDecoder();
  let title = '';
  const tempos: MidiTempo[] = [],
    meters: MidiMeter[] = [],
    tracks: MidiTrack[] = [];

  let at = 8 + u32At(4),
    chunk = 0;
  while (at + 8 <= b.length) {
    const id = str(at, 4),
      len = u32At(at + 4),
      end = Math.min(b.length, at + 8 + len);
    let i = at + 8;
    at = end;
    if (id !== 'MTrk') continue;
    let tick = 0,
      status = 0,
      name = '';
    const channels = new Map<number, ChannelState>();
    const chan = (c: number): ChannelState => {
      let state = channels.get(c);
      if (!state)
        channels.set(
          c,
          (state = {
            notes: [],
            program: null,
            held: new Map(),
            bend: 0,
            range: BEND_RANGE,
            rpn: [127, 127],
          }),
        );
      return state;
    };
    const read = () => {
      let n = 0,
        x;
      do {
        x = at8(i++);
        n = (n << 7) | (x & 127);
      } while (x & 128 && i < end);
      return n;
    };
    const off = (c: number, key: number, t: number) => {
      const stack = chan(c).held.get(key);
      const on = stack?.shift();
      if (on)
        chan(c).notes.push({
          key,
          beat: on.tick / ppq,
          beats: Math.max(1, t - on.tick) / ppq,
          vel: on.vel,
          ...(on.cents && { cents: on.cents }),
          ...(on.bend.length && { bend: on.bend }),
        });
    };
    while (i < end) {
      tick += read();
      let s = at8(i);
      if (s & 0x80) i++;
      else s = status; // running status
      if (s === 0xff) {
        const type = at8(i++),
          n = read(),
          data = b.subarray(i, i + n);
        i += n;
        if (type === 0x2f) break;
        if (type === 0x03 && !name) name = decoder.decode(data).trim();
        else if (type === 0x51 && n === 3)
          tempos.push({ beat: tick / ppq, bpm: 60e6 / ((data[0]! << 16) | (data[1]! << 8) | data[2]!) });
        else if (type === 0x58 && n >= 2)
          meters.push({ beat: tick / ppq, num: data[0]!, den: 2 ** data[1]! });
        continue;
      }
      if (s === 0xf0 || s === 0xf7) {
        i += read();
        continue;
      }
      if (s < 0x80) throw new Error('bad MIDI data');
      status = s;
      const kind = s & 0xf0,
        c = s & 15;
      const d1 = at8(i++),
        d2 = kind === 0xc0 || kind === 0xd0 ? 0 : at8(i++);
      if (kind === 0x90 && d2 > 0) {
        const held = chan(c).held;
        let stack = held.get(d1);
        if (!stack) held.set(d1, (stack = []));
        stack.push({ tick, vel: d2, cents: chan(c).bend, bend: [] });
      } else if (kind === 0x80 || kind === 0x90) off(c, d1, tick);
      else if (kind === 0xe0) {
        const state = chan(c);
        state.bend = Math.round((((d2 << 7) | d1) - BEND_CENTER) * (state.range / BEND_CENTER) * 10) / 10;
        // a bend while notes sound moves them: a point on each one's curve, over the bend it started on
        for (const stack of state.held.values())
          for (const h of stack)
            h.bend.push({ beat: (tick - h.tick) / ppq, cents: Math.round((state.bend - h.cents) * 10) / 10 });
      } else if (kind === 0xb0) {
        // RPN 0 sets the bend range: CC 101 and 100 choose the parameter, CC 6 its semitones and CC 38 its cents
        const state = chan(c);
        if (d1 === 101) state.rpn[0] = d2;
        else if (d1 === 100) state.rpn[1] = d2;
        else if (state.rpn[0] === 0 && state.rpn[1] === 0 && (d1 === 6 || d1 === 38))
          state.range =
            d1 === 6 ? Math.max(1, d2) * 100 + (state.range % 100) : Math.floor(state.range / 100) * 100 + d2;
      } else if (kind === 0xc0 && chan(c).program === null) chan(c).program = d1;
    }
    for (const [c, ch] of channels)
      for (const [key, stack] of ch.held) while (stack.length) off(c, key, tick);
    if (chunk === 0 && format === 1 && ![...channels.values()].some((c) => c.notes.length)) title = name;
    const used = [...channels].filter(([, ch]) => ch.notes.length);
    for (const [c, ch] of used)
      tracks.push({
        name: used.length > 1 || !name ? (name ? `${name} ${c + 1}` : '') : name,
        channel: c,
        program: ch.program ?? 0,
        notes: ch.notes.sort((x, y) => x.beat - y.beat || x.key - y.key),
      });
    chunk++;
  }
  const firsts = <E extends { beat: number }>(list: E[]) =>
    list
      .sort((x, y) => x.beat - y.beat)
      .filter((e, k, all) => {
        const next = all[k + 1];
        return next === undefined || next.beat - e.beat > 1e-9;
      });
  return { title, tempos: firsts(tempos), meters: firsts(meters), tracks };
}
