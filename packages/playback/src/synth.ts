// Plays a synth's settings (Chordinal PRD §13) through Web Audio as an Instrument, as a SoundFont preset plays:
//   oscillators 1 and 2 + noise → filter (its envelope, velocity and the LFO move the cutoff) → amp envelope
//   → LFO tremolo → the instrument's output
// A voice's two oscillators share one pitch source, so a note's pitch moves (tuning, bend, vibrato, scoop, fall) and
// the pitch LFO move them together. Mono plays one voice and slides it between held keys.
import { envelopeLevel, sweepCents, ENV_TIME_CONSTANTS } from '@chordinal/lib';
import { synthSettings, type SynthEnvelope, type SynthSettings, type SynthWave } from '@chordinal/audio';
import { audioEngine } from './audio-engine.ts';
import { startPitchMoves } from './pitch-moves.ts';
import {
  FAST_RELEASE,
  MIN_ATTACK,
  MIN_RELEASE,
  holdAt,
  type Instrument,
  type NoteOptions,
} from './soundfont.ts';

/** notes a synth sounds at once; the oldest is cut short past this */
export const SYNTH_VOICES = 16;
/** the level of one oscillator at full velocity and level, leaving room for chords */
const VOICE_GAIN = 0.3;

const WAVE_TYPES: Record<SynthWave, OscillatorType> = {
  saw: 'sawtooth',
  square: 'square',
  triangle: 'triangle',
  sine: 'sine',
};

const hz = (key: number) => 440 * 2 ** ((key - 69) / 12);
const dahds = (e: SynthEnvelope) => ({ delay: 0, hold: 0, ...e });

// a second of white noise per context, looped by every voice that uses it
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseIn(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseBuffers.get(ctx);
  if (!buf) {
    buf = new AudioBuffer({ length: ctx.sampleRate, sampleRate: ctx.sampleRate, numberOfChannels: 1 });
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buf);
  }
  return buf;
}

/** one sounding note of a synth */
interface SynthVoice {
  key: number;
  start: number;
  /** true once cut short */
  stopping: boolean;
  /** true once its release has begun or been scheduled */
  released: boolean;
  release(fast?: boolean, when?: number): void;
  /** slides the oscillators to `key` over `seconds` from `when` (0 jumps), without starting the envelopes again */
  slideTo(key: number, when: number, seconds: number): void;
  /** winds the pitch down to `rate` of itself, like a tape slowing to a stop, then cuts the voice */
  slow(when: number, seconds: number, rate: number): void;
}

function startVoice(
  p: SynthSettings,
  key: number,
  velocity: number,
  output: GainNode,
  when: number,
  moves: NoteOptions,
  onEnded: (v: SynthVoice) => void,
): SynthVoice {
  const ctx = output.context;
  const t = Math.max(ctx.currentTime, when);
  const nyquist = ctx.sampleRate / 2;
  const v = Math.min(127, Math.max(1, velocity)) / 127;
  const sources: AudioScheduledSourceNode[] = [];
  const nodes: AudioNode[] = [];
  const keep = <N extends AudioNode>(n: N): N => {
    nodes.push(n);
    return n;
  };

  // the pitch every oscillator follows, in cents: the note's pitch moves and the pitch LFO add into it
  const pitch = new ConstantSourceNode(ctx, { offset: 0 });
  sources.push(pitch);
  const mix = keep(new GainNode(ctx, { gain: 1 }));
  const oscs: { osc: OscillatorNode; ratio: number }[] = [];
  for (const o of [p.osc1, p.osc2]) {
    if (o.level <= 0) continue;
    const ratio = 2 ** o.octave;
    const osc = new OscillatorNode(ctx, {
      type: WAVE_TYPES[o.wave],
      frequency: hz(key) * ratio,
      detune: o.detune,
    });
    pitch.connect(osc.detune);
    osc.connect(keep(new GainNode(ctx, { gain: o.level }))).connect(mix);
    oscs.push({ osc, ratio });
    sources.push(osc);
  }
  if (p.noise > 0) {
    const noise = new AudioBufferSourceNode(ctx, { buffer: noiseIn(ctx), loop: true });
    noise.connect(keep(new GainNode(ctx, { gain: p.noise }))).connect(mix);
    sources.push(noise);
  }

  // the filter's envelope moves the cutoff by up to `cents`, less for a softer note as the velocity amount says
  const f = p.filter;
  const sweep = { ...dahds(f.env), cents: f.amount * (1 - p.velocity * (1 - v)) };
  const cutoff = (cents: number) => Math.min(Math.max(f.cutoff * 2 ** (cents / 1200), 20), nyquist);
  const filter = keep(new BiquadFilterNode(ctx, { type: f.type, Q: f.resonance, frequency: cutoff(0) }));
  const fq = filter.frequency;
  const top = t + Math.max(f.env.attack, MIN_ATTACK);
  fq.setValueAtTime(cutoff(0), t);
  if (sweep.cents) {
    fq.exponentialRampToValueAtTime(cutoff(sweep.cents), top);
    fq.exponentialRampToValueAtTime(cutoff(sweep.cents * f.env.sustain), top + Math.max(f.env.decay, 0.001));
  }
  mix.connect(filter);

  // the amp envelope: a linear attack, then an exponential fall to the sustain level, as SoundFont voices do
  const env = keep(new GainNode(ctx, { gain: 0 }));
  const peak = VOICE_GAIN * v * v;
  const amp = dahds(p.amp);
  const attackEnd = t + Math.max(amp.attack, MIN_ATTACK);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(peak, attackEnd);
  env.gain.setTargetAtTime(peak * amp.sustain, attackEnd, Math.max(amp.decay, 0.001) / ENV_TIME_CONSTANTS);
  filter.connect(env);

  // the LFO: cents on the pitch or the cutoff, or a share of the level for the volume
  let last: AudioNode = env;
  const l = p.lfo;
  if (l.depth > 0) {
    const lfo = new OscillatorNode(ctx, { type: WAVE_TYPES[l.wave], frequency: l.rate });
    sources.push(lfo);
    const depth = keep(new GainNode(ctx, { gain: l.target === 'volume' ? l.depth / 2 : l.depth }));
    lfo.connect(depth);
    if (l.target === 'pitch') depth.connect(pitch.offset);
    else if (l.target === 'filter') depth.connect(filter.detune);
    else {
      const tremolo = keep(new GainNode(ctx, { gain: 1 - l.depth / 2 }));
      depth.connect(tremolo.gain);
      last = last.connect(tremolo);
    }
  }
  last.connect(output);

  for (const s of sources) s.start(t);
  const stopPitchMoves = startPitchMoves(ctx, pitch.offset, t, moves);

  let releasedAt = -1,
    releaseLevel = 0,
    releaseTime = 0;
  const level = (now: number) =>
    releasedAt < 0 || now < releasedAt
      ? envelopeLevel(amp, peak, now - t, MIN_ATTACK)
      : releaseLevel * Math.exp((-(now - releasedAt) * ENV_TIME_CONSTANTS) / releaseTime);
  let heldKey = key; // the key the oscillators are on, or sliding to

  let slideEnd = 0; // when the last slide reaches heldKey

  // holds the oscillators' frequency at `at`, for a ramp to start there: the key they reached, or, mid-slide, where
  // the slide has got to (where the browser can hold it; Firefox can't, and jumps to the key it was sliding to)
  const holdFrequencies = (at: number) => {
    for (const { osc, ratio } of oscs) {
      const f = osc.frequency;
      holdAt(f, at);
      if (at >= slideEnd || typeof f.cancelAndHoldAtTime !== 'function')
        f.setValueAtTime(hz(heldKey) * ratio, at);
    }
  };

  const voice: SynthVoice = {
    key,
    start: t,
    stopping: false,
    released: false,
    release(fast = false, when = 0) {
      if (voice.stopping || (voice.released && !fast)) return;
      voice.released = true;
      // cut short before it has started (a song stopped with notes scheduled ahead): it never sounds
      if (fast && when <= ctx.currentTime && t > ctx.currentTime) {
        voice.stopping = true;
        for (const s of sources) s.stop();
        return;
      }
      const now = Math.max(ctx.currentTime, when, t);
      releaseLevel = level(now);
      releasedAt = now;
      releaseTime = fast ? FAST_RELEASE : Math.max(amp.release, MIN_RELEASE);
      voice.stopping = fast;
      holdAt(env.gain, now);
      env.gain.setValueAtTime(releaseLevel, now);
      env.gain.setTargetAtTime(0, now, releaseTime / ENV_TIME_CONSTANTS);
      // the cutoff falls back over the filter envelope's own release
      if (sweep.cents && !fast) {
        holdAt(fq, now);
        fq.setValueAtTime(cutoff(sweepCents(sweep, now - t, MIN_ATTACK)), now);
        fq.exponentialRampToValueAtTime(cutoff(0), now + Math.max(f.env.release, MIN_RELEASE));
      }
      for (const s of sources) s.stop(now + releaseTime + 0.05);
    },
    slideTo(to, when, seconds) {
      const at = Math.max(ctx.currentTime, when, t);
      holdFrequencies(at);
      for (const { osc, ratio } of oscs)
        if (seconds > 0) osc.frequency.exponentialRampToValueAtTime(hz(to) * ratio, at + seconds);
        else osc.frequency.setValueAtTime(hz(to) * ratio, at);
      heldKey = voice.key = to;
      slideEnd = at + seconds;
    },
    slow(when, seconds, rate) {
      const at = Math.max(ctx.currentTime, when);
      holdFrequencies(at);
      slideEnd = Infinity; // it never reaches a key again
      for (const { osc, ratio } of oscs)
        osc.frequency.exponentialRampToValueAtTime(hz(heldKey) * ratio * rate, at + seconds);
      voice.release(true, at + seconds);
    },
  };
  // the pitch source runs as long as the voice: it ends when the oscillators and the noise do
  pitch.onended = () => {
    voice.stopping = true;
    stopPitchMoves();
    for (const n of [...sources, ...nodes]) n.disconnect();
    onEnded(voice);
  };
  return voice;
}

/**
 * A synth playing `settings` (any shape: synthSettings() makes it whole), as an Instrument. `destination` is where its output
 * goes, e.g. a mixer channel; the master output by default. Its voices are its own, so it never steals a SoundFont
 * preset's notes or they its.
 */
export function createSynth(settings: unknown, destination: AudioNode = audioEngine.output): Instrument {
  const p = synthSettings(settings);
  const ctx = destination.context;
  const output = ctx.createGain();
  output.connect(destination);
  const voices: SynthVoice[] = []; // oldest first, until they end
  const held = new Map<number, SynthVoice>(); // key → the voice it started (poly)
  const sustained = new Set<SynthVoice>(); // poly voices whose key is up but the pedal holds them
  const keys: number[] = []; // mono: the keys held down, the last one sounding
  let mono: SynthVoice | null = null; // mono: the one voice
  let pedal = false;
  const ended = (v: SynthVoice) => {
    const i = voices.indexOf(v);
    if (i >= 0) voices.splice(i, 1);
    if (mono === v) mono = null;
  };
  const sounding = () => voices.filter((v) => !v.stopping);

  const start = (key: number, velocity: number, when: number, opts: NoteOptions) => {
    const v = startVoice(p, key, velocity, output, when, opts, ended);
    voices.push(v);
    let over = sounding().length - SYNTH_VOICES;
    for (const old of voices) {
      if (over <= 0) break;
      if (!old.stopping && old !== v) {
        old.release(true, when);
        over--;
      }
    }
    return v;
  };

  const instrument: Instrument = {
    noteOn(key, velocity = 100, when = 0, opts = {}) {
      if (opts.mono) {
        for (const v of voices) if (v.start <= Math.max(ctx.currentTime, when)) v.release(true, when);
        held.clear();
        sustained.clear();
        keys.length = 0;
      }
      if (p.mono) {
        const i = keys.indexOf(key);
        if (i >= 0) keys.splice(i, 1);
        // a key still held: slide the one voice over, legato
        if (mono && !mono.released && keys.length) mono.slideTo(key, when, p.glide);
        else {
          mono?.release(true, when);
          mono = start(key, velocity, when, opts);
        }
        keys.push(key);
        return;
      }
      instrument.noteOff(key, true, when);
      held.set(key, start(key, velocity, when, opts));
    },
    // fast = cut it short (retriggering the same key), ignoring the pedal
    noteOff(key, fast = false, when = 0) {
      if (p.mono) {
        const i = keys.indexOf(key);
        if (i < 0) return;
        const sounded = i === keys.length - 1;
        keys.splice(i, 1);
        if (!sounded || !mono) return;
        // back to the last key still held, or let go
        const back = keys.at(-1);
        if (back !== undefined) mono.slideTo(back, when, p.glide);
        else if (!pedal || fast) mono.release(fast, when);
        return;
      }
      const v = held.get(key);
      if (!v) return;
      held.delete(key);
      if (pedal && !fast) sustained.add(v);
      else v.release(fast, when);
    },
    // legato from the player: the note on fromKey slides to toKey instead of a new note starting
    glide(fromKey, toKey, when, seconds) {
      if (fromKey === toKey) return false;
      if (p.mono) {
        if (!mono || mono.released || keys.at(-1) !== fromKey) return false;
        keys[keys.length - 1] = toKey;
        mono.slideTo(toKey, when, seconds);
        return true;
      }
      const v = held.get(fromKey);
      if (!v) return false;
      held.delete(fromKey);
      instrument.noteOff(toKey, true, when);
      v.slideTo(toKey, when, seconds);
      held.set(toKey, v);
      return true;
    },
    tapeStop(when, seconds, rate = 0.05) {
      for (const v of voices) if (v.start < when && !v.stopping) v.slow(when, seconds, rate);
    },
    output,
    setSustain(on) {
      pedal = on;
      if (on) return;
      for (const v of sustained) v.release();
      sustained.clear();
      if (p.mono && mono && !keys.length) mono.release();
    },
    dispose() {
      held.clear();
      sustained.clear();
      keys.length = 0;
      for (const v of voices) v.release(true);
      setTimeout(() => output.disconnect(), (FAST_RELEASE + 0.1) * 1000);
    },
  };
  return instrument;
}
