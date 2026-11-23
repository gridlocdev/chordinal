// A project's mixer: one channel strip per track, and a shared reverb and tempo-synced delay that every strip sends into,
// so the parts sound like they're in one room. Everything sums on a mix bus with headroom, then goes through the
// mastering chain in platform/audio-engine.js.
//
// strip: input → low cut → tone (low-pass, for sweeps) → inserts → user → fader → volume → pan (auto-pan LFO) → mix bus
//                                                                                         ├→ reverb send → reverb → low cut → mix bus
//                                                                                         └→ delay send → delay ⟲ (darker each repeat) → mix bus
// The inserts are the track's effects (effects.ts), in order; with none the tone filter feeds the user gain. The user
// gain is the mixer's fader, mute and solo, which nothing else touches, after the effects so a compressor hears the
// part as played; the fader after it is what ducking moves, and the volume after that is what a volume automation lane
// moves. Each strip has a meter after its pan. The delay time wobbles slowly (a modulated delay), so the echoes shimmer a little.
import { audioEngine } from './audio-engine.ts';
import { buildEffect, type Effect, type EffectParamTarget } from './effects.ts';
import { reverbImpulse } from '@chordinal/lib';
import { tempoSteps, type TempoSegment } from '@chordinal/lib';
import type { Insert } from '@chordinal/daw';

export const dbToGain = (db: number): number => 10 ** (db / 20);

const MIX_BUS_DB = -3; // headroom before the master chain
const REVERB = { seconds: 2.2, decay: 3, lowCut: 250 }; // lowCut keeps the low end out of the reverb
const DELAY = { beats: 0.75, feedback: 0.35, tone: 3500, wobble: { rate: 0.3, seconds: 0.003 } }; // a dotted eighth; tone darkens the repeats
const OPEN_TONE = 20000; // Hz; the tone filter's resting cutoff, until automation moves it

const MAX_DELAY = 4; // seconds the delay line holds
const delaySeconds = (bpm: number) => Math.min(MAX_DELAY, (DELAY.beats * 60) / bpm);

/** a change of the delay's time: from `beat`, `seconds` */
export interface DelayTime {
  beat: number;
  seconds: number;
}

/** the delay's time through a tempo map: where it changes, in beats, and to what (a change per beat through a ramp) */
export const delayTimes = (map: TempoSegment[]): DelayTime[] =>
  tempoSteps(map).map(({ beat, bpm }) => ({ beat, seconds: delaySeconds(bpm) }));

let impulse: AudioBuffer | null = null; // built once; every project's reverb shares it

const PAN_POINTS = 1025;
/**
 * The pan law: the gains on the left and right channels at `pan` (-1..1). Constant power, so a centred mono part (the
 * same on both sides) is as loud panned anywhere: 1 and 1 in the middle, √2 and 0 hard left. Each side only scales its
 * own channel, never adds the other into it.
 */
export function panGains(pan: number): [number, number] {
  const angle = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
  return [Math.SQRT2 * Math.cos(angle), Math.SQRT2 * Math.sin(angle)];
}
/** the pan law as two wave-shaper curves over -1..1, for the left and right gains */
export const panCurves = (): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] => {
  const left = new Float32Array(PAN_POINTS),
    right = new Float32Array(PAN_POINTS);
  for (let i = 0; i < PAN_POINTS; i++) [left[i], right[i]] = panGains((i / (PAN_POINTS - 1)) * 2 - 1);
  return [left, right];
};
let curves: [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] | null = null;

/** a strip's settings; reverb and delay are send levels, 0..1 */
export interface StripOptions {
  volumeDb?: number;
  pan?: number;
  lowCut?: number;
  reverb?: number;
  delay?: number;
  autoPan?: { rate: number; depth: number } | null;
  inserts?: Insert[];
}

/** a stereo pan: `pan` is an AudioParam (-1..1) that automation and the auto-pan LFO move */
export interface Panner {
  input: ChannelSplitterNode;
  output: ChannelMergerNode;
  pan: AudioParam;
}

/** one track's channel strip */
export interface Strip {
  input: GainNode;
  user: GainNode;
  lowCut: BiquadFilterNode;
  tone: BiquadFilterNode;
  fader: GainNode;
  /** the volume automation lane's gain, 1 with none */
  volume: GainNode;
  panner: Panner;
  pan: number;
  reverbSend: GainNode;
  delaySend: GainNode;
  level: number;
  /** the level after the pan, for the strip's meter */
  meter: AnalyserNode;
  /** the effects playing, by their insert's id (a bypassed insert has none) */
  effects: Map<string, Effect>;
  /** the effects to play now, in order: kept where an insert stays, built where it's new, and rewired */
  setInserts(inserts: Insert[]): void;
  /** what an automation lane moves, by its id: the strip's own lanes, and `<insert id>.<setting>` for each effect */
  params(): Map<string, EffectParamTarget>;
}

export interface ProjectMixer {
  channel(strip?: StripOptions): Strip;
  delayAt(seconds: number, at: number): void;
  /** the tempo from `at`: the shared delay's time and every effect timed to it */
  tempoAt(bpm: number, at: number): void;
  dispose(fade?: number): void;
}

export function createMixer({ tempo }: { tempo: number }): ProjectMixer {
  const ctx = audioEngine.context;
  if (!impulse || impulse.sampleRate !== ctx.sampleRate) {
    const channels = reverbImpulse(ctx.sampleRate, REVERB);
    const buffer = new AudioBuffer({
      length: channels[0].length,
      numberOfChannels: 2,
      sampleRate: ctx.sampleRate,
    });
    channels.forEach((d, i) => buffer.getChannelData(i).set(d));
    impulse = buffer;
  }
  const nodes: AudioNode[] = [],
    sources: AudioScheduledSourceNode[] = []; // sources: the LFOs and the pan controls, stopped on dispose
  const node = <N extends AudioNode>(n: N): N => (nodes.push(n), n);
  // a slow sine into a parameter, on top of its own value
  const lfo = (param: AudioParam, rate: number, depth: number) => {
    const osc = node(new OscillatorNode(ctx, { frequency: rate }));
    osc.connect(node(new GainNode(ctx, { gain: depth }))).connect(param);
    osc.start();
    sources.push(osc);
  };

  // a stereo pan by panGains: `pan` is an AudioParam (-1..1) that automation and the auto-pan LFO move
  const shapes = (curves ??= panCurves());
  const pan2 = (value: number): Panner => {
    const input = node(new ChannelSplitterNode(ctx, { numberOfOutputs: 2 }));
    const output = node(new ChannelMergerNode(ctx, { numberOfInputs: 2 }));
    const control = node(new ConstantSourceNode(ctx, { offset: value }));
    for (const side of [0, 1] as const) {
      const gain = node(new GainNode(ctx, { gain: 0 }));
      control.connect(node(new WaveShaperNode(ctx, { curve: shapes[side] }))).connect(gain.gain);
      input.connect(gain, side).connect(output, 0, side);
    }
    control.start();
    sources.push(control);
    return { input, output, pan: control.offset };
  };

  let bpm = tempo;
  const strips: Strip[] = [];

  const bus = node(new GainNode(ctx, { gain: dbToGain(MIX_BUS_DB) }));
  bus.connect(audioEngine.output);

  const reverbIn = node(new GainNode(ctx));
  reverbIn
    .connect(node(new ConvolverNode(ctx, { buffer: impulse })))
    .connect(node(new BiquadFilterNode(ctx, { type: 'highpass', frequency: REVERB.lowCut })))
    .connect(bus);

  const delayIn = node(new GainNode(ctx));
  const delay = node(new DelayNode(ctx, { delayTime: delaySeconds(tempo), maxDelayTime: MAX_DELAY }));
  const dark = node(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: DELAY.tone }));
  delayIn
    .connect(delay)
    .connect(dark)
    .connect(node(new GainNode(ctx, { gain: DELAY.feedback })))
    .connect(delay);
  dark.connect(bus);
  lfo(delay.delayTime, DELAY.wobble.rate, DELAY.wobble.seconds);

  return {
    channel({
      volumeDb = -6,
      pan = 0,
      lowCut = 20,
      reverb = 0,
      delay: delaySend = 0,
      autoPan = null,
      inserts = [],
    }: StripOptions = {}): Strip {
      // always stereo: a strip whose voices are all centred (unpanned, mono) would otherwise run mono, and the
      // pan would only find a left channel
      const input = node(new GainNode(ctx, { channelCount: 2, channelCountMode: 'explicit' }));
      const user = node(new GainNode(ctx));
      const tone = node(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: OPEN_TONE, Q: 0 }));
      const level = dbToGain(volumeDb);
      const fader = node(new GainNode(ctx, { gain: level }));
      const volume = node(new GainNode(ctx));
      const panner = pan2(pan);
      const reverbSend = node(new GainNode(ctx, { gain: reverb }));
      const delaySendGain = node(new GainNode(ctx, { gain: delaySend }));
      const lowCutFilter = node(new BiquadFilterNode(ctx, { type: 'highpass', frequency: lowCut }));
      const meter = node(new AnalyserNode(ctx, { fftSize: 512 }));
      input.connect(lowCutFilter).connect(tone);
      user.connect(fader).connect(volume).connect(panner.input);
      panner.output.connect(bus);
      panner.output.connect(meter);
      panner.output.connect(reverbSend).connect(reverbIn);
      panner.output.connect(delaySendGain).connect(delayIn);
      if (autoPan) lfo(panner.pan, autoPan.rate, autoPan.depth);

      const effects = new Map<string, Effect>();
      let order: string[] | null = null; // the effects' ids as wired, null before the first wiring
      const setInserts = (list: Insert[]) => {
        const playing = list.filter((x) => !x.bypass);
        const ids = playing.map((x) => `${x.id}:${x.type}`);
        if (order && ids.join() === order.join()) return;
        order = ids;
        const keep = new Set(ids);
        for (const [id, e] of effects)
          if (!keep.has(id)) {
            e.dispose();
            effects.delete(id);
          }
        tone.disconnect();
        for (const e of effects.values()) e.output.disconnect();
        let last: AudioNode = tone;
        for (const x of playing) {
          const id = `${x.id}:${x.type}`;
          let e = effects.get(id);
          if (!e) {
            const built = buildEffect(ctx, x, bpm);
            if (!built) continue;
            e = built;
            effects.set(id, e);
          }
          last.connect(e.input);
          last = e.output;
        }
        last.connect(user);
      };
      setInserts(inserts);

      const strip: Strip = {
        input,
        user,
        lowCut: lowCutFilter,
        tone,
        fader,
        volume,
        panner,
        pan,
        reverbSend,
        delaySend: delaySendGain,
        level,
        meter,
        effects,
        setInserts,
        params() {
          const map = new Map<string, EffectParamTarget>([
            ['volume', { param: volume.gain }],
            ['pan', { param: panner.pan }],
            ['tone', { param: tone.frequency }],
            ['reverb', { param: reverbSend.gain }],
            ['delay', { param: delaySendGain.gain }],
          ]);
          for (const [key, e] of effects) {
            const id = key.slice(0, key.lastIndexOf(':'));
            for (const [name, target] of Object.entries(e.params)) map.set(`${id}.${name}`, target);
          }
          return map;
        },
      };
      strips.push(strip);
      return strip;
    },
    tempoAt(next: number, at: number): void {
      bpm = next;
      this.delayAt(delaySeconds(next), at);
      for (const s of strips) for (const e of s.effects.values()) e.tempo(next, at);
    },
    /** the delay's time, `seconds`, from `at` (a quick glide, so the echoes don't jump), dropping later changes */
    delayAt(seconds: number, at: number): void {
      delay.delayTime.cancelScheduledValues(at);
      delay.delayTime.setTargetAtTime(seconds, at, 0.02);
    },
    // a quick fade so nothing clicks, then everything is disconnected, tails included
    dispose(fade = 0.08): void {
      const now = ctx.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(bus.gain.value, now);
      bus.gain.linearRampToValueAtTime(0, now + fade);
      setTimeout(
        () => {
          for (const o of sources) o.stop();
          for (const n of nodes) n.disconnect();
          for (const s of strips) for (const e of s.effects.values()) e.dispose();
        },
        fade * 1000 + 50,
      );
    },
  };
}
