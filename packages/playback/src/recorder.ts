// One take being recorded. A melody take has a count-in and a click on the game's AudioContext; its pitch is tracked
// as it comes in, the note being sung or played is shown at the playhead, and notes are firmed up about a beat behind it.
// A chord take is recorded freely, with no click: only which notes are heard matters.
import { mic } from './mic.ts';
import { audioEngine } from './audio-engine.ts';
import { trackPitch, finishFrames, type PitchFrame } from '@chordinal/lib';
import { readLive, type LiveReading, type TranscribedNote } from '@chordinal/lib';
import { RECORD, CLICK, LIVE } from '@chordinal/sketch';
import { beatsPerBar } from '@chordinal/daw';

export type TakeKind = 'melody' | 'chord';

/**
 * A take under way. origin: beat 0, the first bar line after the count-in, as heard, in seconds into the take;
 * frames: its pitch frames gated by the loudest so far, raw: the same ungated; tune: the running sum behind
 * `offset`, the tuning; live: the note at the playhead, until it's firmed up into `notes`.
 */
export interface Recording {
  kind: TakeKind;
  tempo: number;
  meter: string;
  click: boolean;
  rate: number;
  beatSec: number;
  bpb: number;
  countBeats: number;
  start: number;
  origin: number;
  buffer: Float32Array<ArrayBuffer>;
  length: number;
  frames: PitchFrame[];
  raw: PitchFrame[];
  nextFrame: number;
  peak: number;
  offset: number;
  tune: { x: number; y: number };
  seconds: number;
  playhead: number;
  countIn: number;
  nextBeat: number;
  notes: TranscribedNote[];
  gridOrigin: number | null;
  firmedAt: number;
  live: { key: number; from: number } | null;
  reading: LiveReading | null;
}

/** a finished take from the mic; a melody take's downbeat is its origin */
export interface MicTake {
  kind: TakeKind;
  source: 'mic';
  samples: Float32Array<ArrayBuffer>;
  rate: number;
  frames: PitchFrame[];
  tempo: number;
  meter: string;
  downbeat?: number;
}

/** the context's output latency in seconds, 0 when the browser doesn't say (or the context is offline) */
function outputLatency(): number {
  const ctx = audioEngine.context;
  return ('outputLatency' in ctx && ctx.outputLatency) || 0;
}

/** Starts a take a moment from now. The mic must be on, sending its blocks to takeBlock. */
export function startRecording({
  kind,
  tempo,
  meter,
  click,
}: {
  kind: TakeKind;
  tempo: number;
  meter: string;
  click: boolean;
}): Recording {
  const rate = mic.rate,
    bpb = beatsPerBar(meter),
    beatSec = 60 / tempo;
  const countBeats = kind === 'melody' ? RECORD.countInBars * bpb : 0;
  return {
    kind,
    tempo,
    meter,
    click: kind === 'melody' && click,
    rate,
    beatSec,
    bpb,
    countBeats,
    start: audioEngine.context.currentTime + 0.15,
    // beat 0 is the first bar line after the count-in, as heard: the click reaches the ear late, the sound the take
    origin: countBeats * beatSec + mic.latency,
    buffer: new Float32Array(rate * RECORD.maxSeconds),
    length: 0,
    frames: [],
    raw: [],
    nextFrame: 0,
    peak: 0,
    offset: 0,
    tune: { x: 0, y: 0 },
    seconds: 0,
    playhead: 0,
    countIn: countBeats,
    nextBeat: 0,
    notes: [],
    gridOrigin: null,
    firmedAt: 0,
    live: null,
    reading: null,
  };
}

/** the beat in a melody take, from its first bar line, of a key played at context time `time`: the player hears the
 * click `outputLatency` late and plays along to that */
export const keyBeat = (
  r: Pick<Recording, 'start' | 'beatSec' | 'countBeats'>,
  time: number,
  outputLatency = 0,
): number => (time - outputLatency - r.start) / r.beatSec - r.countBeats;

/** a block from the mic, kept from the moment the count-in starts */
export function takeBlock(r: Recording, samples: Float32Array, time: number): void {
  const skip = Math.max(0, Math.round((r.start - time) * r.rate));
  if (skip >= samples.length) return;
  const at = Math.max(0, Math.round((time - r.start) * r.rate));
  const n = Math.min(samples.length - skip, r.buffer.length - at);
  if (n > 0) r.buffer.set(samples.subarray(skip, skip + n), at);
  r.length = Math.max(r.length, at + n);
}

/** the click, the live pitch and the notes so far, once a frame; false once the take is as long as a take can be */
export function updateRecording(r: Recording): boolean {
  const ctx = audioEngine.context,
    now = ctx.currentTime;
  r.seconds = Math.max(0, now - r.start);
  // the playhead is where the click is as heard, not as scheduled, so it doesn't run ahead of the sound
  r.playhead = r.seconds - outputLatency() + mic.latency;
  r.countIn = Math.max(0, Math.ceil((r.start + r.countBeats * r.beatSec - now) / r.beatSec));
  while (r.kind === 'melody' && r.start + r.nextBeat * r.beatSec < now + RECORD.lookahead) {
    const i = r.nextBeat++;
    if (i < r.countBeats || r.click) tick(r.start + i * r.beatSec, i % r.bpb === 0);
  }

  // the pitch of the frames recorded since last time, gated by the take's loudest so far; kept ungated too, for the end
  const need = Math.round(r.rate * 0.02) + Math.ceil(r.rate / 300) + 2;
  if (r.length - Math.round(r.nextFrame * HOP * r.rate) >= need + HOP * r.rate) {
    const frames = newFrames(r);
    for (const f of frames) {
      r.raw.push({ ...f });
      r.peak = Math.max(r.peak, f.level);
      if (f.level < Math.max(LIVE.gate, r.peak * LIVE.gateOfPeak)) f.midi = null;
      r.frames.push(f);
      // the tuning offset as tuningOffset would give it for every frame so far, kept as a running sum
      if (f.midi !== null) {
        r.tune.x += Math.cos(2 * Math.PI * f.midi);
        r.tune.y += Math.sin(2 * Math.PI * f.midi);
      }
      r.offset = r.tune.x || r.tune.y ? Math.atan2(r.tune.y, r.tune.x) / (2 * Math.PI) : 0;
      follow(r, f);
    }
  }
  if (r.kind === 'melody' && r.seconds - r.firmedAt >= LIVE.firmEvery) firm(r);
  return r.length < r.buffer.length;
}

const HOP = 1 / 100; // seconds between pitch frames: trackPitch's default rate

/** the pitch frames (ungated) of the take recorded since the last ones, at their times in the take */
function newFrames(r: Recording): PitchFrame[] {
  const from = Math.round(r.nextFrame * HOP * r.rate);
  const frames = trackPitch(r.buffer.subarray(from, r.length), r.rate, { raw: true });
  for (const f of frames) f.time += from / r.rate;
  r.nextFrame += frames.length;
  return frames;
}

/** the semitone being heard now, and since when: a faint note at the playhead until it's firmed up */
function follow(r: Recording, f: PitchFrame): void {
  if (f.midi === null) {
    r.live = null;
    return;
  }
  const recent: number[] = [];
  for (let i = r.frames.length - 1; i >= 0 && recent.length < LIVE.follow; i--) {
    const midi = r.frames[i]!.midi;
    if (midi !== null) recent.push(midi);
  }
  recent.sort((a, b) => a - b);
  // f itself is the last frame, so there is always a middle one
  const middle = recent[recent.length >> 1] ?? f.midi;
  const key = Math.round(middle - r.offset);
  if (r.live?.key !== key) r.live = { key, from: f.time };
}

/**
 * The notes so far, up to a beat behind the playhead: a note still sounding, or whose last 8th the smoothing hasn't
 * passed yet, waits. Once enough notes are in, the click grid is fixed and each reading reads on from about the last
 * note, so the work stays the same however long the take. A ~ comes with its note, once it's held long enough to
 * measure. The take as kept is read again, whole, when it stops.
 */
function firm(r: Recording): void {
  r.firmedAt = r.seconds;
  const cut = r.playhead - r.beatSec * LIVE.behindBeats;
  if (cut <= r.origin) return;
  r.reading = readLive(r.reading, r.frames, {
    tempo: r.tempo,
    downbeat: r.origin,
    upTo: cut,
    offset: r.offset,
  });
  if (!r.reading) return;
  r.notes = r.reading.notes;
  r.gridOrigin = r.reading.grid.origin;
}

/** ends a take: it comes back, or null when it was too short to hold a note */
export function stopRecording(r: Recording): MicTake | null {
  const samples = r.buffer.slice(0, r.length);
  if (samples.length < r.rate * (r.origin + 0.5)) return null;
  // the frames tracked while recording, and the last few since, finished as one: no second pass over the whole take
  const frames = finishFrames([...r.raw, ...newFrames(r)]);
  const take: MicTake = {
    kind: r.kind,
    source: 'mic',
    samples,
    rate: r.rate,
    frames,
    tempo: r.tempo,
    meter: r.meter,
  };
  return r.kind === 'melody' ? { ...take, downbeat: r.origin } : take;
}

/** white noise, made once, for the click's ticks */
let noise: AudioBuffer | null = null;

/** a short tick of noise at a time on the game's AudioContext */
function tick(when: number, accent: boolean): void {
  const ctx = audioEngine.context;
  if (!noise || noise.sampleRate !== ctx.sampleRate) {
    noise = new AudioBuffer({
      length: Math.ceil(ctx.sampleRate * CLICK.seconds),
      sampleRate: ctx.sampleRate,
    });
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = new AudioBufferSourceNode(ctx, { buffer: noise });
  const filter = new BiquadFilterNode(ctx, {
    type: 'highpass',
    frequency: accent ? CLICK.accentHighpassHz : CLICK.highpassHz,
  });
  const gain = new GainNode(ctx, { gain: 0 });
  gain.gain.setValueAtTime(accent ? CLICK.accentGain : CLICK.gain, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + CLICK.seconds);
  src.connect(filter).connect(gain).connect(audioEngine.output);
  src.start(when);
  src.stop(when + CLICK.seconds);
}
