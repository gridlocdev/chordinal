// The pitch moves a voice makes on top of its note. Each drives the sample's detune (cents), so they add up:
//   detune   the whole note off its key, under the rest: a microtone, a just-tuned chord tone
//   vibrato  a wobble that fades in after the note starts, as a player lets it in
//   scoop    start off pitch and slide onto it (the +1 trick; an octave riser; a chip zap from above)
//   arp      a tracker arpeggio: the pitch steps through a chord every few frames, one voice faking a chord
//   fall     the pitch drops away at the end of a note, as a chip lead's falls off a phrase
import type { PitchMoves } from '@chordinal/daw';

/**
 * Starts a voice's pitch moves at time `t`. `detune` is the voice's source's detune. Returns a function to call when
 * the voice has ended, to stop and detach what's still running.
 */
export function startPitchMoves(
  ctx: BaseAudioContext,
  detune: AudioParam,
  t: number,
  { detune: cents, vibrato, scoop, arp, fall }: PitchMoves = {},
): () => void {
  const running: (OscillatorNode | ConstantSourceNode)[] = [];
  // a source of its own, so a scoop or a slide that sets the detune itself still lands this far off the key
  if (typeof cents === 'number' && Number.isFinite(cents) && cents) {
    const base = new ConstantSourceNode(ctx, { offset: cents });
    base.connect(detune);
    base.start(t);
    running.push(base);
  }
  if (vibrato) {
    const lfo = new OscillatorNode(ctx, { frequency: vibrato.rate });
    const depth = new GainNode(ctx, { gain: 0 });
    depth.gain.setValueAtTime(0, t + vibrato.delay);
    depth.gain.linearRampToValueAtTime(vibrato.cents, t + vibrato.delay + vibrato.ramp);
    lfo.connect(depth).connect(detune);
    lfo.start(t);
    running.push(lfo);
  }
  if (scoop) {
    detune.setValueAtTime(scoop.cents, t);
    detune.linearRampToValueAtTime(0, t + scoop.seconds);
  }
  // arpeggio steps and falls: their own source, added to the detune, so a scoop or a slide on the same voice still
  // works; it stops by itself once they're over, so a voice that ends early only has to detach it
  const tracker = arp && arp.steps.length > 1 ? arp : null;
  let offset: ConstantSourceNode | null = null;
  if (tracker || fall) {
    offset = new ConstantSourceNode(ctx, { offset: 0 });
    const o = offset.offset;
    let end = t;
    if (tracker) {
      const every = Math.max(tracker.seconds, 0.005);
      end = t + tracker.until;
      for (let i = 0; t + i * every < end; i++)
        o.setValueAtTime(tracker.steps[i % tracker.steps.length]! * 100, t + i * every);
    }
    if (fall) {
      o.setValueAtTime(0, t + fall.at);
      o.linearRampToValueAtTime(fall.cents, t + fall.at + fall.seconds);
      end = Math.max(end, t + fall.at + fall.seconds + 1);
    }
    offset.connect(detune);
    offset.start(t);
    offset.stop(end);
  }
  return () => {
    for (const n of running) {
      n.stop();
      n.disconnect();
    }
    offset?.disconnect();
  };
}
