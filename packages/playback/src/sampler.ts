// Plays a sampler's settings (Chordinal PRD §14) through Web Audio as an Instrument, as a SoundFont preset plays: its
// audio file, sped up or slowed down from its root key to each note's, from its start offset, through the amp
// envelope. One-shot plays the sample through whatever the key does (only a cut stops it early); sustain-loop loops it
// from the start offset to its end while the key or the pedal holds it, then lets it go over the release.
import { envelopeLevel, ENV_TIME_CONSTANTS } from '@chordinal/lib';
import { samplerSettings } from '@chordinal/audio';
import { audioEngine } from './audio-engine.ts';
import { startPitchMoves } from './pitch-moves.ts';
import { FAST_RELEASE, MIN_ATTACK, MIN_RELEASE, holdAt, type Instrument } from './soundfont.ts';

/** notes a sampler sounds at once; the oldest is cut short past this */
export const SAMPLER_VOICES = 32;
/** the level of a note at full velocity, leaving room for chords */
const VOICE_GAIN = 0.5;

/** one sounding note of a sampler */
interface SamplerVoice {
  key: number;
  start: number;
  stopping: boolean;
  released: boolean;
  release(fast?: boolean, when?: number): void;
  slideTo(key: number, when: number, seconds: number): void;
  slow(when: number, seconds: number, rate: number): void;
}

/**
 * A sampler playing `buffer` with `settings` (any shape: samplerSettings() makes it whole), as an Instrument.
 * `destination` is where its output goes, e.g. a mixer channel; the master output by default. With no buffer (its file
 * is missing) it plays nothing.
 */
export function createSampler(
  settings: unknown,
  buffer: AudioBuffer | null,
  destination: AudioNode = audioEngine.output,
): Instrument {
  const p = samplerSettings(settings);
  const ctx = destination.context;
  const output = ctx.createGain();
  output.connect(destination);
  const voices: SamplerVoice[] = []; // oldest first, until they end
  const held = new Map<number, SamplerVoice>(); // key → the voice it started
  const sustained = new Set<SamplerVoice>(); // voices whose key is up but the pedal holds them
  let pedal = false;
  const amp = { delay: 0, hold: 0, ...p.amp };
  const rateOf = (key: number) => 2 ** ((key - p.root) / 12);

  const startVoice = (key: number, velocity: number, when: number, moves: object): SamplerVoice | null => {
    if (!buffer) return null;
    const t = Math.max(ctx.currentTime, when);
    const v = Math.min(127, Math.max(1, velocity)) / 127;
    const offset = p.start * buffer.duration;
    const src = new AudioBufferSourceNode(ctx, { buffer, playbackRate: rateOf(key) });
    if (p.mode === 'loop') {
      src.loop = true;
      src.loopStart = offset;
      src.loopEnd = buffer.duration;
    }
    const env = new GainNode(ctx, { gain: 0 });
    const peak = VOICE_GAIN * v * v;
    const attackEnd = t + Math.max(amp.attack, MIN_ATTACK);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, attackEnd);
    env.gain.setTargetAtTime(peak * amp.sustain, attackEnd, Math.max(amp.decay, 0.001) / ENV_TIME_CONSTANTS);
    src.connect(env).connect(output);
    src.start(t, offset);
    const stopPitchMoves = startPitchMoves(ctx, src.detune, t, moves);

    let releasedAt = -1,
      releaseLevel = 0,
      releaseTime = 0;
    const level = (now: number) =>
      releasedAt < 0 || now < releasedAt
        ? envelopeLevel(amp, peak, now - t, MIN_ATTACK)
        : releaseLevel * Math.exp((-(now - releasedAt) * ENV_TIME_CONSTANTS) / releaseTime);
    let heldKey = key;

    const voice: SamplerVoice = {
      key,
      start: t,
      stopping: false,
      released: false,
      release(fast = false, when = 0) {
        if (voice.stopping || (voice.released && !fast)) return;
        voice.released = true;
        if (fast && when <= ctx.currentTime && t > ctx.currentTime) {
          voice.stopping = true;
          src.stop();
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
        src.stop(now + releaseTime + 0.05);
      },
      slideTo(to, when, seconds) {
        const at = Math.max(ctx.currentTime, when, t);
        const r = src.playbackRate;
        holdAt(r, at);
        r.setValueAtTime(rateOf(heldKey), at);
        if (seconds > 0) r.exponentialRampToValueAtTime(rateOf(to), at + seconds);
        else r.setValueAtTime(rateOf(to), at);
        heldKey = voice.key = to;
      },
      slow(when, seconds, rate) {
        const at = Math.max(ctx.currentTime, when);
        const r = src.playbackRate;
        holdAt(r, at);
        r.setValueAtTime(rateOf(heldKey), at);
        r.exponentialRampToValueAtTime(rateOf(heldKey) * rate, at + seconds);
        voice.release(true, at + seconds);
      },
    };
    src.onended = () => {
      voice.stopping = true;
      stopPitchMoves();
      src.disconnect();
      env.disconnect();
      const i = voices.indexOf(voice);
      if (i >= 0) voices.splice(i, 1);
      if (held.get(voice.key) === voice) held.delete(voice.key);
      sustained.delete(voice);
    };
    return voice;
  };

  const instrument: Instrument = {
    noteOn(key, velocity = 100, when = 0, opts = {}) {
      if (opts.mono) {
        for (const v of voices) if (v.start <= Math.max(ctx.currentTime, when)) v.release(true, when);
        held.clear();
        sustained.clear();
      }
      instrument.noteOff(key, true, when);
      const v = startVoice(key, velocity, when, opts);
      if (!v) return;
      voices.push(v);
      held.set(key, v);
      let over = voices.filter((x) => !x.stopping).length - SAMPLER_VOICES;
      for (const old of voices) {
        if (over <= 0) break;
        if (!old.stopping && old !== v) {
          old.release(true, when);
          over--;
        }
      }
    },
    // fast = cut it short (retriggering the same key), ignoring the pedal; a one-shot otherwise plays on
    noteOff(key, fast = false, when = 0) {
      const v = held.get(key);
      if (!v) return;
      held.delete(key);
      if (fast) v.release(true, when);
      else if (p.mode === 'oneshot') return;
      else if (pedal) sustained.add(v);
      else v.release(false, when);
    },
    glide(fromKey, toKey, when, seconds) {
      if (fromKey === toKey) return false;
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
    },
    dispose() {
      held.clear();
      sustained.clear();
      for (const v of voices) v.release(true);
      setTimeout(() => output.disconnect(), (FAST_RELEASE + 0.1) * 1000);
    },
  };
  return instrument;
}
