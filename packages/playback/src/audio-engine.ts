// The Web Audio context, master volume and mastering chain. Browsers start audio suspended until a user gesture,
// so the first key press or click anywhere resumes it.
//
// master volume → a little air (high shelf) → glue compressor → peak limiter → output
// The limiter is a DynamicsCompressor, not a true brickwall, so there's no makeup gain: songs peak around −6 dB,
// which leaves room for anything played on top.
let ctx: AudioContext | OfflineAudioContext | null = null;
let master: GainNode | null = null;
let meter: AnalyserNode | null = null;

const AIR = { frequency: 8000, gain: 1.5 };
const GLUE = { threshold: -18, ratio: 2.5, knee: 6, attack: 0.03, release: 0.25 };
const LIMITER = { threshold: -2, ratio: 20, knee: 0, attack: 0.002, release: 0.08 };
const OUTPUT_GAIN = 0.95;

/** the master gain, once `context` has made it */
function masterGain(): GainNode {
  if (!master) throw new Error('no audio context yet');
  return master;
}

export const audioEngine = {
  get context(): AudioContext | OfflineAudioContext {
    return (ctx ??= create());
  },
  get output(): GainNode {
    void this.context;
    return masterGain();
  },
  get volume(): number {
    return master?.gain.value ?? 1;
  },
  set volume(v: number) {
    this.output.gain.value = v;
  },
  /** how loud the output is now: its peak over the last few milliseconds, 0..1 */
  get level(): number {
    return meter ? peak(meter) : 0;
  },
  /** the render under way, if any: live sound waits for it, since `context` is the offline one meanwhile */
  rendering: null as Promise<AudioBuffer> | null,

  /**
   * Renders sound offline, faster than it would play. While it renders, `context` and `output` are an offline
   * context and its own mastering chain, so whatever `start` sets playing goes into it. `start` returns a function
   * called every `step` seconds of the render, to schedule the next stretch, as a ticker would live.
   */
  render(seconds: number, start: () => () => void, step = 0.1): Promise<AudioBuffer> {
    if (this.rendering) return Promise.reject(new Error('already rendering'));
    const done = this.renderNow(seconds, start, step);
    this.rendering = done;
    const clear = () => {
      if (this.rendering === done) this.rendering = null;
    };
    done.then(clear, clear);
    return done;
  },

  async renderNow(seconds: number, start: () => () => void, step: number): Promise<AudioBuffer> {
    const liveCtx = this.context,
      liveMaster = master,
      liveMeter = meter;
    const rate = liveCtx.sampleRate;
    const off = new OfflineAudioContext({
      numberOfChannels: 2,
      length: Math.ceil(seconds * rate),
      sampleRate: rate,
    });
    ctx = off;
    chain(off).gain.value = 1;
    try {
      let failed: unknown = null;
      const tick = start();
      for (const t of renderPauses(seconds, rate, step))
        off
          .suspend(t)
          .then(() => {
            try {
              tick();
            } finally {
              void off.resume();
            }
          })
          .catch((e: unknown) => {
            failed ??= e;
          });
      const buffer = await off.startRendering();
      if (failed) throw failed;
      return buffer;
    } finally {
      ctx = liveCtx;
      master = liveMaster;
      meter = liveMeter;
    }
  },
};

/** the times an offline render of `seconds` pauses to schedule more, about every `step`: each on its own 128-sample
 * block (the only place a pause can fall), and before the render's last block, since a pause there is refused */
export function renderPauses(seconds: number, rate: number, step: number): number[] {
  const length = Math.ceil(seconds * rate),
    every = Math.max(128, Math.round((step * rate) / 128) * 128);
  const out: number[] = [];
  for (let f = every; f < length - 128; f += every) out.push(f / rate);
  return out;
}

const scratch = new WeakMap<AnalyserNode, Float32Array<ArrayBuffer>>(); // analyser → its buffer, so a meter read every frame allocates nothing

/** the peak of what an analyser hears now */
export function peak(analyser: AnalyserNode): number {
  let data = scratch.get(analyser);
  if (!data) scratch.set(analyser, (data = new Float32Array(analyser.fftSize)));
  analyser.getFloatTimeDomainData(data);
  let max = 0;
  for (const v of data) max = Math.max(max, Math.abs(v));
  return max;
}

/** master volume → mastering → the context's speakers, and a meter on the way out; returns the master gain */
function chain(c: BaseAudioContext): GainNode {
  const m = new GainNode(c);
  const a = new AnalyserNode(c, { fftSize: 1024 });
  master = m;
  meter = a;
  const out = m
    .connect(new BiquadFilterNode(c, { type: 'highshelf', ...AIR }))
    .connect(new DynamicsCompressorNode(c, GLUE))
    .connect(new DynamicsCompressorNode(c, LIMITER))
    .connect(new GainNode(c, { gain: OUTPUT_GAIN }));
  out.connect(c.destination);
  out.connect(a);
  return m;
}

function create(): AudioContext {
  // 'interactive', not 'playback': the keyboard needs low latency, and songs are scheduled ahead anyway
  const c = new AudioContext({ latencyHint: 'interactive' });
  chain(c);
  const resume = () => {
    if (c.state !== 'running') void c.resume();
  };
  for (const type of ['keydown', 'pointerdown']) addEventListener(type, resume, { capture: true });
  return c;
}
