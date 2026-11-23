// The sound of each track effect (packages/daw/src/effects.ts lists them and their settings), built from Web Audio
// nodes on whichever context is playing, so Play, an exported WAV and `chordinal render` hear the same thing.
//
// Each effect is { input, output, params, set, tempo, dispose }. `params` are the settings an automation lane can move:
// an AudioParam and how a setting's value becomes the param's (dB to a gain, say). `set` changes a setting now, while
// it plays. An effect with a Mix setting runs a dry and a wet path, crossfaded by one control so the mix can be
// automated: the wet gain follows it and the dry gain follows 1 − it.
//
// The Bitcrusher runs on the audio thread in an AudioWorklet, which a context loads once (prepareEffects) before it
// plays; on a context that hasn't, it passes the sound through untouched.
import { reverbImpulse } from '@chordinal/lib';
import { SYNC_BEATS, effectSpec, insertValues } from '@chordinal/daw';
import type { Insert } from '@chordinal/daw';

export const dbGain = (db: number): number => 10 ** (db / 20);

/** a setting an automation lane can move: the param, and how a setting's value becomes its value */
export interface EffectParamTarget {
  param: AudioParam;
  map?: (value: number) => number;
}

export interface Effect {
  input: AudioNode;
  output: AudioNode;
  params: Record<string, EffectParamTarget>;
  /** changes a setting now (a quick glide, so nothing clicks) */
  set(param: string, value: number): void;
  /** the tempo from `at`, for the effects timed to it */
  tempo(bpm: number, at: number): void;
  dispose(): void;
}

const GLIDE = 0.015; // seconds a setting glides to a new value

// ── the Bitcrusher's worklet ────────────────────────────────────────────────────────────────────────────────────────

const CRUSHER = 'chordinal-bitcrusher';
const CRUSHER_SOURCE = `
class Bitcrusher extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bits', defaultValue: 8, minValue: 1, maxValue: 16, automationRate: 'k-rate' },
      { name: 'downsample', defaultValue: 4, minValue: 1, maxValue: 32, automationRate: 'k-rate' },
    ];
  }
  constructor() { super(); this.held = []; this.count = 0; }
  process(inputs, outputs, parameters) {
    const input = inputs[0], output = outputs[0];
    if (!input || !input.length) return true;
    const levels = 2 ** (parameters.bits[0] - 1), every = parameters.downsample[0];
    for (let c = 0; c < output.length; c++) {
      const from = input[c] || input[0], to = output[c];
      let count = this.count, held = this.held[c] || 0;
      for (let i = 0; i < to.length; i++) {
        if (count <= 0) { held = Math.round(from[i] * levels) / levels; count += every; }
        count -= 1;
        to[i] = held;
      }
      this.held[c] = held;
      if (c === output.length - 1) this.count = count;
    }
    return true;
  }
}
registerProcessor('${CRUSHER}', Bitcrusher);
`;

const prepared = new WeakMap<BaseAudioContext, Promise<void>>();
const ready = new WeakSet<BaseAudioContext>();

/** loads the effects' worklets into a context, once; a context that can't load them still plays, without the crush */
export function prepareEffects(ctx: BaseAudioContext): Promise<void> {
  let done = prepared.get(ctx);
  if (!done) {
    const url = URL.createObjectURL(new Blob([CRUSHER_SOURCE], { type: 'text/javascript' }));
    done = (ctx.audioWorklet?.addModule(url) ?? Promise.reject(new Error('no AudioWorklet')))
      .then(() => void ready.add(ctx))
      .catch(() => {})
      .finally(() => URL.revokeObjectURL(url));
    prepared.set(ctx, done);
  }
  return done;
}

// ── building blocks ─────────────────────────────────────────────────────────────────────────────────────────────────

/** the nodes and sources an effect makes, so dispose can stop and disconnect them all */
function parts(ctx: BaseAudioContext) {
  const nodes: AudioNode[] = [],
    sources: AudioScheduledSourceNode[] = [];
  const node = <N extends AudioNode>(n: N): N => (nodes.push(n), n);
  /** a control value as a node's output: a constant that params can follow, and that automation moves */
  const control = (value: number): ConstantSourceNode => {
    const c = node(new ConstantSourceNode(ctx, { offset: value }));
    c.start();
    sources.push(c);
    return c;
  };
  const oscillator = (frequency: number, type: OscillatorType = 'sine'): OscillatorNode => {
    const o = node(new OscillatorNode(ctx, { frequency, type }));
    o.start();
    sources.push(o);
    return o;
  };
  /** `source` scaled by `by` into `param`, on top of the param's own value */
  const drive = (source: AudioNode, by: number, param: AudioParam) =>
    source.connect(node(new GainNode(ctx, { gain: by }))).connect(param);
  const dispose = () => {
    for (const s of sources) s.stop();
    for (const n of nodes) n.disconnect();
  };
  return { node, control, oscillator, drive, dispose };
}

/** sets a param now with a short glide */
const glide = (ctx: BaseAudioContext, param: AudioParam, value: number) => {
  param.cancelScheduledValues(ctx.currentTime);
  param.setTargetAtTime(value, ctx.currentTime, GLIDE);
};

// ── the effects ─────────────────────────────────────────────────────────────────────────────────────────────────────

type Values = Record<string, number>;
type Build = (ctx: BaseAudioContext, v: Values, bpm: number) => Effect;

/**
 * An effect from a wet path between `wetIn` and `wetOut`: the input splits into it and a dry path, and the Mix setting
 * crossfades the two. `extra` are the effect's other settings.
 */
function wetDry(
  ctx: BaseAudioContext,
  p: ReturnType<typeof parts>,
  mixValue: number,
  wetIn: AudioNode,
  wetOut: AudioNode,
  extra: Omit<Effect, 'input' | 'output' | 'dispose'>,
): Effect {
  const input = p.node(new GainNode(ctx)),
    output = p.node(new GainNode(ctx));
  const mix = p.control(mixValue);
  const wet = p.node(new GainNode(ctx, { gain: 0 })),
    dry = p.node(new GainNode(ctx, { gain: 1 }));
  mix.connect(wet.gain);
  p.drive(mix, -1, dry.gain);
  input.connect(dry).connect(output);
  input.connect(wetIn);
  wetOut.connect(wet).connect(output);
  return {
    input,
    output,
    params: { ...extra.params, mix: { param: mix.offset } },
    set(param, value) {
      if (param === 'mix') glide(ctx, mix.offset, value);
      else extra.set(param, value);
    },
    tempo: extra.tempo,
    dispose: p.dispose,
  };
}

/** an effect whose settings are each one param, set as they are or through `map` */
function direct(
  ctx: BaseAudioContext,
  p: ReturnType<typeof parts>,
  input: AudioNode,
  output: AudioNode,
  params: Record<string, EffectParamTarget>,
  set: (param: string, value: number) => boolean = () => false,
): Effect {
  return {
    input,
    output,
    params,
    set(param, value) {
      if (set(param, value)) return;
      const t = params[param];
      if (t) glide(ctx, t.param, t.map ? t.map(value) : value);
    },
    tempo() {},
    dispose: p.dispose,
  };
}

const syncSeconds = (index: number, bpm: number) => ((SYNC_BEATS[Math.round(index)] ?? 1) * 60) / bpm;

/** the drive curve: a soft clip, a tanh scaled so full scale stays full scale */
let driveCurve: Float32Array<ArrayBuffer> | null = null;
const softClip = () => {
  if (driveCurve) return driveCurve;
  const n = 2049,
    k = 2.5;
  driveCurve = new Float32Array(n);
  for (let i = 0; i < n; i++) driveCurve[i] = Math.tanh(k * ((i / (n - 1)) * 2 - 1)) / Math.tanh(k);
  return driveCurve;
};

const impulses = new Map<string, AudioBuffer>();
/** a reverb's impulse for a size and decay, built once per size, decay and sample rate */
function impulseFor(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const key = `${ctx.sampleRate}:${seconds.toFixed(2)}:${decay.toFixed(2)}`;
  let b = impulses.get(key);
  if (!b) {
    const channels = reverbImpulse(ctx.sampleRate, { seconds, decay });
    b = new AudioBuffer({ length: channels[0].length, numberOfChannels: 2, sampleRate: ctx.sampleRate });
    channels.forEach((d, i) => b!.getChannelData(i).set(d));
    // a 30 s impulse is about 11 MB, and a drag of the Size slider builds one per step, so keep only a few
    if (impulses.size > 4) impulses.delete(impulses.keys().next().value!);
    impulses.set(key, b);
  }
  return b;
}

const FILTER_TYPES: BiquadFilterType[] = ['lowpass', 'highpass', 'bandpass'];
/** a resonance in dB as the Q of a filter of that type: dB for low and high pass, a width for band pass */
const resonanceQ = (mode: number, db: number) => (mode === 2 ? 0.7 * dbGain(db) : db);

const BUILDERS: Record<string, Build> = {
  eq(ctx, v) {
    const p = parts(ctx);
    const low = p.node(new BiquadFilterNode(ctx, { type: 'lowshelf', frequency: v.lowFreq, gain: v.low }));
    const mid = p.node(
      new BiquadFilterNode(ctx, { type: 'peaking', frequency: v.midFreq, gain: v.mid, Q: v.q }),
    );
    const high = p.node(
      new BiquadFilterNode(ctx, { type: 'highshelf', frequency: v.highFreq, gain: v.high }),
    );
    low.connect(mid).connect(high);
    return direct(ctx, p, low, high, {
      low: { param: low.gain },
      lowFreq: { param: low.frequency },
      mid: { param: mid.gain },
      midFreq: { param: mid.frequency },
      q: { param: mid.Q },
      high: { param: high.gain },
      highFreq: { param: high.frequency },
    });
  },

  compressor(ctx, v) {
    const p = parts(ctx);
    const comp = p.node(
      new DynamicsCompressorNode(ctx, {
        threshold: v.threshold,
        ratio: v.ratio,
        attack: v.attack,
        release: v.release,
        knee: 6,
      }),
    );
    const makeup = p.node(new GainNode(ctx, { gain: dbGain(v.makeup!) }));
    comp.connect(makeup);
    return direct(ctx, p, comp, makeup, {
      threshold: { param: comp.threshold },
      ratio: { param: comp.ratio },
      attack: { param: comp.attack },
      release: { param: comp.release },
      makeup: { param: makeup.gain, map: dbGain },
    });
  },

  filter(ctx, v) {
    const p = parts(ctx);
    let mode = Math.round(v.mode!);
    const f = p.node(
      new BiquadFilterNode(ctx, {
        type: FILTER_TYPES[mode] ?? 'lowpass',
        frequency: v.cutoff,
        Q: resonanceQ(mode, v.resonance!),
      }),
    );
    let resonance = v.resonance!;
    const params: Record<string, EffectParamTarget> = {
      cutoff: { param: f.frequency },
      resonance: { param: f.Q, map: (x) => resonanceQ(mode, x) },
    };
    return direct(ctx, p, f, f, params, (param, value) => {
      if (param === 'resonance') resonance = value;
      if (param !== 'mode') return false;
      mode = Math.round(value);
      f.type = FILTER_TYPES[mode] ?? 'lowpass';
      glide(ctx, f.Q, resonanceQ(mode, resonance));
      return true;
    });
  },

  distortion(ctx, v) {
    const p = parts(ctx);
    const pre = p.node(new GainNode(ctx, { gain: dbGain(v.drive!) }));
    const shaper = p.node(new WaveShaperNode(ctx, { curve: softClip(), oversample: '4x' }));
    const tone = p.node(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: v.tone, Q: 0 }));
    const out = p.node(new GainNode(ctx, { gain: dbGain(v.output!) }));
    pre.connect(shaper).connect(tone).connect(out);
    const params: Record<string, EffectParamTarget> = {
      drive: { param: pre.gain, map: dbGain },
      tone: { param: tone.frequency },
      output: { param: out.gain, map: dbGain },
    };
    const inner = direct(ctx, p, pre, out, params);
    return wetDry(ctx, p, v.mix!, pre, out, inner);
  },

  chorus(ctx, v) {
    const p = parts(ctx);
    const into = p.node(new GainNode(ctx)),
      out = p.node(new GainNode(ctx));
    const rate = p.control(v.rate!),
      depth = p.control(v.depth!);
    // two voices, a little apart in time and rate, one to each side
    for (const [base, faster, side] of [
      [0.015, 1, -0.7],
      [0.024, 1.13, 0.7],
    ] as const) {
      const d = p.node(new DelayNode(ctx, { delayTime: base, maxDelayTime: 0.05 }));
      const lfo = p.oscillator(0);
      p.drive(rate, faster, lfo.frequency);
      const swing = p.node(new GainNode(ctx, { gain: 0 }));
      p.drive(depth, 0.006, swing.gain);
      lfo.connect(swing).connect(d.delayTime);
      into
        .connect(d)
        .connect(p.node(new StereoPannerNode(ctx, { pan: side })))
        .connect(out);
    }
    const params = { rate: { param: rate.offset }, depth: { param: depth.offset } };
    return wetDry(ctx, p, v.mix!, into, out, direct(ctx, p, into, out, params));
  },

  delay(ctx, v, bpm) {
    const p = parts(ctx);
    let time = v.time!,
      tempo = bpm;
    const d = p.node(new DelayNode(ctx, { delayTime: syncSeconds(time, bpm), maxDelayTime: 4 }));
    const tone = p.node(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: v.tone, Q: 0 }));
    const back = p.node(new GainNode(ctx, { gain: v.feedback }));
    d.connect(tone).connect(back).connect(d);
    const inner: Effect = {
      ...direct(
        ctx,
        p,
        d,
        tone,
        { feedback: { param: back.gain }, tone: { param: tone.frequency } },
        (param, value) => {
          if (param !== 'time') return false;
          time = value;
          glide(ctx, d.delayTime, syncSeconds(time, tempo));
          return true;
        },
      ),
      tempo(next, at) {
        tempo = next;
        d.delayTime.cancelScheduledValues(at);
        d.delayTime.setTargetAtTime(syncSeconds(time, next), at, 0.02);
      },
    };
    return wetDry(ctx, p, v.mix!, d, tone, inner);
  },

  reverb(ctx, v) {
    const p = parts(ctx);
    let size = v.size!,
      decay = v.decay!;
    const conv = p.node(new ConvolverNode(ctx, { buffer: impulseFor(ctx, size, decay) }));
    const tone = p.node(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: v.tone, Q: 0 }));
    conv.connect(tone);
    const inner = direct(ctx, p, conv, tone, { tone: { param: tone.frequency } }, (param, value) => {
      if (param !== 'size' && param !== 'decay') return false;
      if (param === 'size') size = value;
      else decay = value;
      conv.buffer = impulseFor(ctx, size, decay);
      return true;
    });
    return wetDry(ctx, p, v.mix!, conv, tone, inner);
  },

  phaser(ctx, v) {
    const p = parts(ctx);
    const into = p.node(new GainNode(ctx)),
      out = p.node(new GainNode(ctx));
    const lfo = p.oscillator(v.rate!);
    const depth = p.control(v.depth!);
    const swing = p.node(new GainNode(ctx, { gain: 0 }));
    p.drive(depth, 900, swing.gain);
    lfo.connect(swing);
    let last: AudioNode = into;
    for (const base of [300, 700, 1500, 3000]) {
      const a = p.node(new BiquadFilterNode(ctx, { type: 'allpass', frequency: base, Q: 0.7 }));
      swing.connect(p.node(new GainNode(ctx, { gain: base / 1000 }))).connect(a.frequency);
      last = last.connect(a);
    }
    last.connect(out);
    // feedback through a short delay, as a cycle needs one
    const back = p.node(new GainNode(ctx, { gain: v.feedback }));
    last
      .connect(back)
      .connect(p.node(new DelayNode(ctx, { delayTime: 0 })))
      .connect(into);
    const params = {
      rate: { param: lfo.frequency },
      depth: { param: depth.offset },
      feedback: { param: back.gain },
    };
    return wetDry(ctx, p, v.mix!, into, out, direct(ctx, p, into, out, params));
  },

  flanger(ctx, v) {
    const p = parts(ctx);
    const into = p.node(new GainNode(ctx));
    const d = p.node(new DelayNode(ctx, { delayTime: 0.004, maxDelayTime: 0.02 }));
    const lfo = p.oscillator(v.rate!);
    const depth = p.control(v.depth!);
    const swing = p.node(new GainNode(ctx, { gain: 0 }));
    p.drive(depth, 0.0035, swing.gain);
    lfo.connect(swing).connect(d.delayTime);
    const back = p.node(new GainNode(ctx, { gain: v.feedback }));
    into.connect(d);
    d.connect(back).connect(d);
    const params = {
      rate: { param: lfo.frequency },
      depth: { param: depth.offset },
      feedback: { param: back.gain },
    };
    return wetDry(ctx, p, v.mix!, into, d, direct(ctx, p, into, d, params));
  },

  tremolo(ctx, v, bpm) {
    const p = parts(ctx);
    let rate = v.rate!,
      tempo = bpm;
    const hz = (r: number, b: number) => 1 / syncSeconds(r, b);
    const lfo = p.oscillator(hz(rate, bpm), Math.round(v.shape!) === 1 ? 'square' : 'sine');
    const depth = p.control(v.depth!);
    // the gain swings between 1 − depth and 1: a rest of 1 − depth/2, and the wave times depth/2 on top
    const amp = p.node(new GainNode(ctx, { gain: 1 }));
    p.drive(depth, -0.5, amp.gain);
    const swing = p.node(new GainNode(ctx, { gain: 0 }));
    p.drive(depth, 0.5, swing.gain);
    lfo.connect(swing).connect(amp.gain);
    return {
      ...direct(ctx, p, amp, amp, { depth: { param: depth.offset } }, (param, value) => {
        if (param === 'shape') lfo.type = Math.round(value) === 1 ? 'square' : 'sine';
        else if (param === 'rate') {
          rate = value;
          glide(ctx, lfo.frequency, hz(rate, tempo));
        } else return false;
        return true;
      }),
      tempo(next, at) {
        tempo = next;
        lfo.frequency.cancelScheduledValues(at);
        lfo.frequency.setValueAtTime(hz(rate, next), at);
      },
    };
  },

  bitcrusher(ctx, v) {
    const p = parts(ctx);
    if (!ready.has(ctx)) {
      const through = p.node(new GainNode(ctx));
      return direct(ctx, p, through, through, {});
    }
    const crush = p.node(
      new AudioWorkletNode(ctx, CRUSHER, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        parameterData: { bits: v.bits!, downsample: v.downsample! },
      }),
    );
    const params = {
      bits: { param: crush.parameters.get('bits')! },
      downsample: { param: crush.parameters.get('downsample')! },
    };
    return wetDry(ctx, p, v.mix!, crush, crush, direct(ctx, p, crush, crush, params));
  },

  limiter(ctx, v) {
    const p = parts(ctx);
    const pre = p.node(new GainNode(ctx, { gain: dbGain(v.gain!) }));
    const lim = p.node(
      new DynamicsCompressorNode(ctx, {
        threshold: v.ceiling,
        ratio: 20,
        knee: 0,
        attack: 0.001,
        release: 0.1,
      }),
    );
    pre.connect(lim);
    return direct(ctx, p, pre, lim, {
      gain: { param: pre.gain, map: dbGain },
      ceiling: { param: lim.threshold },
    });
  },

  width(ctx, v) {
    const p = parts(ctx);
    const input = p.node(new GainNode(ctx, { channelCount: 2, channelCountMode: 'explicit' }));
    const split = p.node(new ChannelSplitterNode(ctx, { numberOfOutputs: 2 }));
    const merge = p.node(new ChannelMergerNode(ctx, { numberOfInputs: 2 }));
    input.connect(split);
    const width = p.control(v.width!);
    // each side keeps (1 + w)/2 of itself and takes (1 − w)/2 of the other: 1 leaves it as it is, 0 is mono
    for (const from of [0, 1])
      for (const to of [0, 1]) {
        const g = p.node(new GainNode(ctx, { gain: 0.5 }));
        p.drive(width, from === to ? 0.5 : -0.5, g.gain);
        split.connect(g, from).connect(merge, 0, to);
      }
    return direct(ctx, p, input, merge, { width: { param: width.offset } });
  },

  gain(ctx, v) {
    const p = parts(ctx);
    const g = p.node(new GainNode(ctx, { gain: dbGain(v.gain!) }));
    return direct(ctx, p, g, g, { gain: { param: g.gain, map: dbGain } });
  },
};

/** an insert's sound on a context, at a tempo; null for a type this build doesn't know */
export function buildEffect(ctx: BaseAudioContext, insert: Insert, bpm: number): Effect | null {
  const build = BUILDERS[insert.type];
  if (!build || !effectSpec(insert.type)) return null;
  return build(ctx, insertValues(insert), bpm);
}

/** a track's effects wired in order between two nodes, kept as its inserts change */
export interface EffectChain {
  /** the effects playing, by `<insert id>:<type>` (a bypassed insert has none) */
  effects: Map<string, Effect>;
  /** wires the inserts that aren't bypassed, in order: an effect that stays is kept, a new one is built */
  setInserts(list: Insert[]): void;
  /** the tempo from `at`, for the effects timed to it */
  tempo(bpm: number, at: number): void;
  dispose(): void;
}

/** a chain of effects from `from` to `to`; with none, `from` feeds `to` */
export function effectChain(ctx: BaseAudioContext, from: AudioNode, to: AudioNode, bpm: number): EffectChain {
  const effects = new Map<string, Effect>();
  let order: string[] | null = null; // the effects' ids as wired, null before the first wiring
  return {
    effects,
    setInserts(list) {
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
      from.disconnect();
      for (const e of effects.values()) e.output.disconnect();
      let last: AudioNode = from;
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
      last.connect(to);
    },
    tempo(next, at) {
      bpm = next;
      for (const e of effects.values()) e.tempo(next, at);
    },
    dispose() {
      from.disconnect();
      for (const e of effects.values()) e.dispose();
      effects.clear();
      order = null;
    },
  };
}
