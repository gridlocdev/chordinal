// The microphone, raw: no echo cancelling, noise suppression or gain riding, which smear a voice's or instrument's pitch and level.
// Samples arrive in blocks on the game's AudioContext, stamped with its time, so a take can be lined up with a click
// scheduled on the same context. Nothing is sent anywhere; the page keeps the samples.
import { audioEngine } from './audio-engine.ts';

/** what the mic worklet posts for each block: its samples and the context frame of the first */
interface MicBlock {
  samples: Float32Array;
  frame: number;
}

let open: { stream: MediaStream; source: MediaStreamAudioSourceNode; tap: AudioWorkletNode } | null = null; // while the mic is on

export const mic = {
  get on(): boolean {
    return !!open;
  },
  get rate(): number {
    return audioEngine.context.sampleRate;
  },
  /** the mic's sound, while it's on, for monitoring */
  get node(): AudioNode | null {
    return open?.source ?? null;
  },
  /**
   * Opens the mic (the browser asks once) and calls onBlock for every block of samples. time: the context time of
   * the block's first sample. While it's on already, its blocks go to onBlock from now on.
   */
  async start(onBlock: (samples: Float32Array, time: number) => void): Promise<void> {
    const ctx = audioEngine.context;
    if (open) {
      open.tap.port.onmessage = ({ data }: MessageEvent<MicBlock>) =>
        onBlock(data.samples, data.frame / ctx.sampleRate);
      return;
    }
    if (ctx.state !== 'running') await ctx.resume();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    // by its path in the checkout: the app's bundle doesn't carry the worklet, which runs on the audio thread
    await ctx.audioWorklet.addModule('mic-worklet.js');
    // a live stream needs the live context; an offline render has none to give
    if (!('createMediaStreamSource' in ctx))
      throw new TypeError('the mic needs the live audio context, not an offline render');
    const source = ctx.createMediaStreamSource(stream);
    const tap = new AudioWorkletNode(ctx, 'mic-tap', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
      channelCountMode: 'explicit',
    });
    tap.port.onmessage = ({ data }: MessageEvent<MicBlock>) =>
      onBlock(data.samples, data.frame / ctx.sampleRate);
    source.connect(tap);
    open = { stream, source, tap };
  },
  stop(): void {
    if (!open) return;
    open.source.disconnect();
    open.tap.port.onmessage = null;
    for (const t of open.stream.getTracks()) t.stop();
    open = null;
  },
  /** the delay between a sound scheduled on the context and its echo arriving back in a take, as far as the browser knows */
  get latency(): number {
    return outputLatency() + baseLatency();
  },
  /** an audio file (any format the browser plays) as mono samples at the context's rate */
  async decode(bytes: ArrayBuffer): Promise<{ samples: Float32Array; rate: number }> {
    const buffer = await audioEngine.context.decodeAudioData(bytes);
    const out = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const ch = buffer.getChannelData(c);
      for (let i = 0; i < out.length; i++) out[i]! += ch[i]! / buffer.numberOfChannels;
    }
    return { samples: out, rate: buffer.sampleRate };
  },
};

/** the context's output latency in seconds, 0 when the browser doesn't say (or the context is offline) */
function outputLatency(): number {
  const ctx = audioEngine.context;
  return ('outputLatency' in ctx && ctx.outputLatency) || 0;
}

/** the context's base latency in seconds, 0 when the browser doesn't say (or the context is offline) */
function baseLatency(): number {
  const ctx = audioEngine.context;
  return ('baseLatency' in ctx && ctx.baseLatency) || 0;
}
