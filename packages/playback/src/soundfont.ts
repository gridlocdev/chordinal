// Plays SoundFont presets through Web Audio: loads and caches .sf2 files, then turns notes into voices
// (sample → optional low-pass, swept by the modulation envelope → volume envelope → optional pan → instrument output).
import { parseSf2, regionsFor, type Sf2Font, type Sf2Preset } from '@chordinal/lib';
import { voiceParams, voiceLevel, sweepCents, ENV_TIME_CONSTANTS, type VoiceParams } from '@chordinal/lib';
import { buildChipFont } from '@chordinal/lib';
import type { PitchMoves } from '@chordinal/daw';
import { audioEngine } from './audio-engine.ts';
import { startPitchMoves } from './pitch-moves.ts';
import { CHIP_URL, CHIP_BANK, CHIP_KIT_BANK, CHIP_INSTRUMENTS, CHIP_KITS } from '@chordinal/audio';

const MAX_VOICES = 96; // oldest voices are cut beyond this, released or not
const MIN_RELEASE = 0.03; // seconds; shorter releases click
const MIN_ATTACK = 0.002; // seconds; an instant attack clicks
const FAST_RELEASE = 0.01; // seconds; for stolen, retriggered and choked voices
const BUFFER_BUDGET = 256e6; // bytes of decoded Float32 samples kept across all fonts

const FONT_BUDGET = 400e6; // bytes of loaded .sf2 samples kept across all fonts; the least recently asked for go first

/** a loaded font and the url it came from, which keys its decoded samples */
export type LoadedFont = Sf2Font & { url: string };

type Progress = (loaded: number, total: number) => void;

interface FontLoad {
  promise: Promise<LoadedFont>;
  listeners: Set<Progress>;
  bytes: number | undefined;
}

/** one sounding note's sample */
export interface Voice {
  output: GainNode;
  start: number;
  exclusiveClass: number;
  /** true once cut short; a voice in a normal release can still be cut short */
  stopping: boolean;
  release(fast?: boolean, when?: number): void;
  bend(semitones: number, when: number, seconds: number): void;
  slow(when: number, seconds: number, rate: number): void;
}

/**
 * A note's options: its pitch moves; program: this note on another program of the preset's bank, e.g. a chip lead
 * changing pulse width; mono: cut every voice this instrument is still sounding, release tails too, as a chip
 * channel plays one note at a time
 */
export type NoteOptions = PitchMoves & { program?: number; mono?: boolean };

/** one playable instrument: a preset from a loaded font, with its own output and sustain pedal */
export interface Instrument {
  preset: Sf2Preset;
  noteOn(key: number, velocity?: number, when?: number, opts?: NoteOptions): void;
  noteOff(key: number, fast?: boolean, when?: number): void;
  glide(fromKey: number, toKey: number, when: number, seconds: number): boolean;
  tapeStop(when: number, seconds: number, rate?: number): void;
  output: GainNode;
  setSustain(on: boolean): void;
  dispose(): void;
}

const fonts = new Map<string, FontLoad>(); // url → its load, least recently asked for first
// every sounding voice, oldest first, per audio context: an export's offline context keeps its own, so its voices
// neither steal the live ones nor stay listed after the render (where a note still sounding never ends)
const voiceLists = new WeakMap<BaseAudioContext, Voice[]>();
export const voicesIn = (ctx: BaseAudioContext): Voice[] => {
  let list = voiceLists.get(ctx);
  if (!list) voiceLists.set(ctx, (list = []));
  return list;
};

/**
 * Downloads and parses a .sf2 file once; later calls share the same load and all get progress. CHIP_URL is the
 * chip instruments, built in memory the first time they're asked for.
 */
export function loadSoundFont(url: string, onProgress?: Progress): Promise<LoadedFont> {
  let load = fonts.get(url);
  if (load) {
    // re-insert as most recently asked for
    fonts.delete(url);
    fonts.set(url, load);
  } else {
    const listeners = new Set<Progress>();
    const promise: Promise<LoadedFont> =
      url === CHIP_URL
        ? Promise.resolve().then(() => ({
            url,
            ...buildChipFont({
              bank: CHIP_BANK,
              kitBank: CHIP_KIT_BANK,
              instruments: CHIP_INSTRUMENTS,
              kits: CHIP_KITS,
            }),
          }))
        : download(url, (loaded, total) => {
            for (const fn of listeners) fn(loaded, total);
          }).then((buffer) => ({ url, ...parseSf2(buffer) }));
    // a failed load can be retried
    void promise.catch(() => fonts.delete(url)).finally(() => listeners.clear());
    const entry: FontLoad = { promise, listeners, bytes: undefined };
    fonts.set(url, (load = entry));
    promise.then(
      (font) => {
        entry.bytes = font.sampleData.byteLength;
        trimFonts(fonts, FONT_BUDGET, url);
      },
      () => {},
    );
  }
  if (onProgress) load.listeners.add(onProgress);
  return load.promise;
}

/**
 * drops the least recently asked for loaded fonts from `cache` until their samples fit `budget` bytes, never `keep`.
 * An instrument made from a dropped font keeps it until it goes; asking for it again downloads it again.
 */
export function trimFonts(
  cache: Map<string, { bytes?: number | undefined }>,
  budget: number,
  keep?: string,
): void {
  let total = 0;
  for (const e of cache.values()) total += e.bytes ?? 0;
  for (const [url, e] of cache) {
    if (total <= budget) break;
    if (url === keep || e.bytes === undefined) continue;
    cache.delete(url);
    total -= e.bytes;
  }
}

async function download(url: string, onProgress?: Progress): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  // content-length is the compressed size when the server compresses, so it's only a first guess
  const total = Number(res.headers.get('content-length')) || 0;
  let bytes = new Uint8Array(total || 1 << 24);
  let loaded = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (loaded + value.length > bytes.length) {
      const grown = new Uint8Array(Math.max(bytes.length * 2, loaded + value.length));
      grown.set(bytes.subarray(0, loaded));
      bytes = grown;
    }
    bytes.set(value, loaded);
    loaded += value.length;
    if (total) onProgress?.(Math.min(loaded, total), total);
  }
  return loaded === bytes.length ? bytes.buffer : bytes.buffer.slice(0, loaded);
}

export function findPreset<P extends { bank: number; program: number }>(
  font: { presets: P[] },
  bank: number,
  program: number,
): P | null {
  return font.presets.find((p) => p.bank === bank && p.program === program) ?? null;
}

/**
 * One playable instrument: a preset from a loaded font, with its own output and sustain pedal. `destination` is
 * where its output goes, e.g. a mixer channel; the master output by default.
 */
export function createInstrument(
  font: LoadedFont,
  preset: Sf2Preset,
  destination: AudioNode = audioEngine.output,
): Instrument {
  const ctx = destination.context;
  const active = voicesIn(ctx);
  const output = ctx.createGain();
  output.connect(destination);
  const held = new Map<number, Voice[]>(); // key → voices started by that key
  const sustained = new Set<Voice>(); // voices whose key is up but the pedal holds them
  let pedal = false;

  const instrument: Instrument = {
    preset,
    // when: an AudioContext time to start at, for notes scheduled ahead (a song); omitted = now
    noteOn(key, velocity = 100, when = 0, opts = {}) {
      instrument.noteOff(key, true, when);
      if (opts.mono) {
        const at = Math.max(ctx.currentTime, when);
        for (const v of active) if (v.output === output && v.start <= at) v.release(true, at);
        held.clear();
        sustained.clear();
      }
      const p = opts.program === undefined ? preset : (findPreset(font, preset.bank, opts.program) ?? preset);
      const voices = regionsFor(p, key, velocity).map((r) =>
        startVoice(font, voiceParams(r, key, velocity), output, when, opts),
      );
      // a new voice in an exclusive class chokes the others in it (open/closed hi-hat)
      for (const v of voices)
        if (v.exclusiveClass)
          for (const other of active)
            if (
              other.output === output &&
              other.exclusiveClass === v.exclusiveClass &&
              !voices.includes(other)
            )
              other.release(true, when);
      held.set(key, voices);
    },
    // fast = cut it short (retriggering the same key), ignoring the pedal
    noteOff(key, fast = false, when = 0) {
      for (const v of held.get(key) ?? []) {
        if (pedal && !fast) sustained.add(v);
        else v.release(fast, when);
      }
      held.delete(key);
    },
    /**
     * Legato: the voices holding `fromKey` slide to `toKey` over `seconds` instead of a new note re-attacking.
     * The sample stays the one picked for fromKey, so this suits steps and small leaps. Returns false when fromKey
     * isn't sounding (play a normal note instead).
     */
    glide(fromKey, toKey, when, seconds) {
      const voices = held.get(fromKey);
      if (!voices?.length || fromKey === toKey) return false;
      held.delete(fromKey);
      instrument.noteOff(toKey, true, when);
      for (const v of voices) v.bend(toKey - fromKey, when, seconds);
      held.set(toKey, voices);
      return true;
    },
    /**
     * A tape stop: every voice already sounding at `when` slows in pitch and speed to `rate` of itself over
     * `seconds`, then stops. Notes that start later are untouched.
     */
    tapeStop(when, seconds, rate = 0.05) {
      for (const v of active)
        if (v.output === output && v.start < when && !v.stopping) v.slow(when, seconds, rate);
    },
    /** this instrument's own gain node, e.g. to set a part's level in a mix */
    output,
    setSustain(on) {
      pedal = on;
      if (on) return;
      for (const v of sustained) v.release();
      sustained.clear();
    },
    // stop everything, including release tails, and detach; the instrument can't be used afterwards
    dispose() {
      held.clear();
      sustained.clear();
      for (const v of active) if (v.output === output) v.release(true);
      setTimeout(() => output.disconnect(), (FAST_RELEASE + 0.1) * 1000);
    },
  };
  return instrument;
}

function startVoice(
  font: LoadedFont,
  p: VoiceParams,
  output: GainNode,
  when = 0,
  moves: PitchMoves = {},
): Voice {
  const ctx = output.context; // the instrument's own context: not the engine's, which is offline during a render
  const active = voicesIn(ctx);
  const t = Math.max(ctx.currentTime, when);
  const source = ctx.createBufferSource();
  const buffer = sampleBuffer(font, p.start, p.end, p.sampleRate);
  source.buffer = buffer;
  const rate = buffer.sampleRate;
  // the buffer's rate differs from the sample's only when that was out of range (see sampleBuffer)
  source.playbackRate.value = p.playbackRate * (p.sampleRate > 0 ? p.sampleRate / rate : 1);
  if ((p.loopMode === 1 || p.loopMode === 3) && p.loopEnd > p.loopStart) {
    source.loop = true;
    source.loopStart = (p.loopStart - p.start) / rate;
    source.loopEnd = (p.loopEnd - p.start) / rate;
  }

  let node: AudioNode = source;
  // the cutoff, `cents` above the filter's own; ramps in Hz are exponential, so they run evenly in cents
  const spec = p.filter,
    sweep = spec?.sweep;
  let filter: BiquadFilterNode | null = null;
  let cutoff = (cents: number) => cents;
  if (spec) {
    cutoff = (cents) => Math.min(spec.hz * 2 ** (cents / 1200), ctx.sampleRate / 2);
    filter = ctx.createBiquadFilter();
    filter.Q.value = spec.q;
    const f = filter.frequency;
    f.setValueAtTime(cutoff(0), t);
    if (sweep) {
      // DAHDS of the modulation envelope; R happens in release()
      const from = t + sweep.delay,
        top = from + Math.max(sweep.attack, MIN_ATTACK);
      f.setValueAtTime(cutoff(0), from);
      f.exponentialRampToValueAtTime(cutoff(sweep.cents), top);
      f.setValueAtTime(cutoff(sweep.cents), top + sweep.hold);
      f.exponentialRampToValueAtTime(
        cutoff(sweep.cents * sweep.sustain),
        top + sweep.hold + Math.max(sweep.decay, 0.001),
      );
    }
    node = node.connect(filter);
  }

  // DAHDS of the volume envelope; R happens in release()
  const env = ctx.createGain();
  const { delay, attack, hold, decay, sustain } = p.env;
  const peak = p.gain;
  const attackEnd = t + delay + Math.max(attack, MIN_ATTACK);
  env.gain.setValueAtTime(0, t);
  env.gain.setValueAtTime(0, t + delay);
  env.gain.linearRampToValueAtTime(peak, attackEnd);
  env.gain.setValueAtTime(peak, attackEnd + hold);
  env.gain.setTargetAtTime(peak * sustain, attackEnd + hold, Math.max(decay, 0.001) / ENV_TIME_CONSTANTS);
  node = node.connect(env);

  if (p.pan) {
    const pan = ctx.createStereoPanner();
    pan.pan.value = p.pan;
    node = node.connect(pan);
  }
  node.connect(output);
  source.start(t);

  const stopPitchMoves = startPitchMoves(ctx, source.detune, t, moves);
  let bent = 0; // semitones glided away from the note's own key

  // where the release starts, so a later fast release can pick up from the level the voice has reached by then;
  // a release scheduled ahead hasn't begun yet, so stealing the voice before it picks up from the envelope
  let releasedAt = -1,
    releaseLevel = 0,
    releaseTime = 0;
  const level = (now: number) =>
    voiceLevel(
      p.env,
      peak,
      now - t,
      releasedAt < 0 ? null : { at: releasedAt - t, level: releaseLevel, seconds: releaseTime },
      MIN_ATTACK,
    );

  const voice: Voice = {
    output,
    start: t,
    exclusiveClass: p.exclusiveClass,
    stopping: false,
    // when: an AudioContext time to release at (never before the note starts); omitted = now
    release(fast = false, when = 0) {
      if (voice.stopping || (releasedAt >= 0 && !fast)) return;
      // cut short before it has started (a song stopped with notes scheduled ahead): it never sounds
      if (fast && when <= ctx.currentTime && t > ctx.currentTime) {
        voice.stopping = true;
        source.stop();
        return;
      }
      const now = Math.max(ctx.currentTime, when, t);
      releaseLevel = level(now);
      releasedAt = now;
      releaseTime = fast ? FAST_RELEASE : Math.max(p.env.release, MIN_RELEASE);
      voice.stopping = fast;
      // hold keeps a release scheduled mid-attack from cancelling the attack ramp back to silence
      holdAt(env.gain, now);
      env.gain.setValueAtTime(releaseLevel, now);
      env.gain.setTargetAtTime(0, now, releaseTime / ENV_TIME_CONSTANTS);
      // the cutoff falls back over the modulation envelope's own release; a voice cut short is gone too soon to hear it
      if (sweep && filter && !fast) {
        const f = filter.frequency;
        holdAt(f, now);
        f.setValueAtTime(cutoff(sweepCents(sweep, now - t, MIN_ATTACK)), now);
        f.exponentialRampToValueAtTime(cutoff(0), now + Math.max(sweep.release, MIN_RELEASE));
      }
      // play the sample's tail after the loop
      if (p.loopMode === 3)
        setTimeout(
          () => {
            source.loop = false;
          },
          Math.max(0, now - ctx.currentTime) * 1000,
        );
      source.stop(now + releaseTime + 0.05);
    },
    // slides the pitch by `semitones` more, evenly in pitch (detune is in cents)
    bend(semitones, when, seconds) {
      const at = Math.max(ctx.currentTime, when, t);
      source.detune.setValueAtTime(bent * 100, at);
      bent += semitones;
      source.detune.linearRampToValueAtTime(bent * 100, at + seconds);
    },
    // winds the playback rate down to `rate` of itself, like a tape slowing to a stop, then cuts the voice
    slow(when, seconds, rate) {
      const at = Math.max(ctx.currentTime, when);
      const r = source.playbackRate.value;
      source.playbackRate.setValueAtTime(r, at);
      source.playbackRate.exponentialRampToValueAtTime(r * rate, at + seconds);
      voice.release(true, at + seconds);
    },
  };
  source.onended = () => {
    voice.stopping = true;
    env.disconnect();
    stopPitchMoves();
    const i = active.indexOf(voice);
    if (i >= 0) active.splice(i, 1);
  };
  active.push(voice);

  // steal the oldest voices past the limit; voices already being cut short don't count
  let over = active.filter((v) => !v.stopping).length - MAX_VOICES;
  for (const v of active) {
    if (over <= 0) break;
    if (!v.stopping && v !== voice) {
      v.release(true);
      over--;
    }
  }
  return voice;
}

/** cancels a param's later changes at `at`, holding its value there where the browser can (Firefox can't) */
function holdAt(param: AudioParam, at: number): void {
  // Firefox has no cancelAndHoldAtTime, though the DOM types say every browser does
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(at);
  else param.cancelScheduledValues(at);
}

// Decoded samples, least recently used first, shared by all fonts and trimmed to BUFFER_BUDGET.
// Voices keep their own reference, so dropping an entry never cuts a sounding note.
const buffers = new Map<string, AudioBuffer>();
let bufferBytes = 0;

function sampleBuffer(font: LoadedFont, start: number, end: number, sampleRate: number): AudioBuffer {
  const id = `${font.url}:${start}:${end}:${sampleRate}`;
  let buf = buffers.get(id);
  if (buf) {
    buffers.delete(id); // re-insert as most recently used
    buffers.set(id, buf);
    return buf;
  }
  const frames = font.sampleData.subarray(start, Math.max(start + 1, end));
  // AudioBuffer accepts 8–96 kHz everywhere; a sample outside that is stored at 44.1k and sped up to match
  const rate = sampleRate >= 8000 && sampleRate <= 96000 ? sampleRate : 44100;
  buf = new AudioBuffer({ length: frames.length, sampleRate: rate, numberOfChannels: 1 });
  const out = buf.getChannelData(0);
  for (let i = 0; i < frames.length; i++) out[i] = frames[i]! / 32768;
  buffers.set(id, buf);
  bufferBytes += frames.length * 4;
  for (const [oldId, old] of buffers) {
    if (bufferBytes <= BUFFER_BUDGET || oldId === id) break;
    buffers.delete(oldId);
    bufferBytes -= old.length * 4;
  }
  return buf;
}
