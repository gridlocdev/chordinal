// Plays a project through the SoundFont synth: a channel strip per track in a mixer, then its notes (through each
// track's MIDI FX, fx.js) and automation, scheduled a little ahead on the audio clock through the tempo map, so
// timing doesn't depend on the frame rate.
//
// Playback is a chain of segments: each plays from one beat until the end or the loop's end, where the next takes
// over seamlessly at the loop's start, one pass further on so the MIDI FX can vary it. Reverb and delay tails carry
// over the loop point, because nothing is pre-rendered.
import { audioEngine, peak } from './audio-engine.ts';
import { startTicker } from './ticker.ts';
import { createInstrument, type Instrument } from './soundfont.ts';
import { createSampler } from './sampler.ts';
import { createSynth } from './synth.ts';
import type { PlayableInstrument } from './instruments.ts';
import { createMixer, dbToGain } from './mixer.ts';
import { beatToSeconds, bendCurve, readBend, secondsToBeat, tempoSteps } from '@chordinal/lib';
import { insertValues, insertsOf, projectEnd } from '@chordinal/daw';
import { passEvents, duckPlan, scheduleLane, playClick, heldAt, ownsKey } from '@chordinal/daw';
import { clickBeats } from '@chordinal/daw';
import type {
  Click,
  ClickOscillator,
  FxEvent,
  Insert,
  Keyframe,
  PassEvents,
  PlayedNote,
  Project,
} from '@chordinal/daw';

const LOOKAHEAD = 0.2; // seconds of notes handed to Web Audio ahead of time
const TICK_MS = 25; // how often more notes are scheduled
export const LEAD_IN = 0.25; // seconds between pressing play and the first beat
const SWITCH_LEAD = 0.5; // seconds before the loop's end that the next pass takes over, for its early notes
const PICKUP_BEATS = 1; // how far before its grid a played note can sound (anticipation, drift)
const GLIDE_SECONDS = 0.08; // a slide from one note into the next
const DUCK = { seconds: 0.1, attack: 0.01 }; // a duck's dip and recovery

/** a track's mixer settings: gain (0 mutes), pan (−1..1), and its sends and low cut */
export interface ChannelMix {
  gain: number;
  pan: number;
  reverb?: number;
  delay?: number;
  lowCut?: number;
}

/**
 * from: the beat to start at; until: the beat to stop at, in a project with no loop (else its end); mix: each
 * track's gain and pan to start with (see setMix); click: a metronome on each beat unit of the meter (meter.js
 * clickBeats); ticker: what calls the scheduler (an offline render drives it itself)
 */
export interface PlayOptions {
  from?: number;
  until?: number | null;
  mix?: { gain: number; pan: number }[] | null;
  click?: boolean;
  ticker?: typeof startTicker;
}

/** a project playing: the position in beats, seek(beat), setMix(channels), levels() and stop() */
export interface PlaybackHandle {
  readonly beat: number;
  readonly done: boolean;
  readonly pass: number;
  seek(beat: number): void;
  setMix(channels: ChannelMix[]): void;
  /** each track's effects, as its inserts now are: settings glide to their new values, and the chain is rewired
   * where effects were added, removed, moved or bypassed */
  setInserts(inserts: (Insert[] | undefined)[]): void;
  levels(): number[];
  stop(): void;
}

/** a stretch of playback: from beat `from` at audio time `at`, until beat `until`, on pass `pass` round the loop */
interface Segment {
  at: number;
  from: number;
  until: number;
  pass: number;
}

/** Starts playing. instrumentsOf: from loadInstruments, one per track. */
export function playProject(
  project: Project,
  instrumentsOf: PlayableInstrument[],
  { from = 0, until = null, mix = null, click = false, ticker = startTicker }: PlayOptions = {},
): PlaybackHandle {
  const ctx = audioEngine.context;
  const map = project.tempoMap;
  const loop = project.loop;
  const secs = (b: number) => beatToSeconds(map, b);
  const tracks = project.tracks;
  const first = map[0];
  if (!first) throw new Error('the project has no tempo');
  const mixer = createMixer({ tempo: first.bpm });
  const strips = tracks.map((t) =>
    mixer.channel({
      volumeDb: 0,
      pan: t.mixer.pan,
      lowCut: t.mixer.lowCut,
      reverb: t.mixer.sends.reverb,
      delay: t.mixer.sends.delay,
      autoPan: t.mixer.autoPan,
      inserts: insertsOf(t),
    }),
  );
  strips.forEach((s, i) => {
    s.user.gain.value = dbToGain(tracks[i]!.mixer.volumeDb);
  });
  // what setMix last set, so it only touches the sends and low cuts that changed
  const mixed: { reverb?: number; delay?: number; lowCut?: number }[] = tracks.map((t) => ({
    reverb: t.mixer.sends.reverb,
    delay: t.mixer.sends.delay,
    lowCut: t.mixer.lowCut,
  }));
  // each insert's settings as last set, so setInserts only touches what changed
  const insertsNow = tracks.map((t) => insertsOf(t));
  const makeInstruments = (): (Instrument | undefined)[] =>
    instrumentsOf.map((b, i) => {
      const strip = strips[i];
      if (!strip) return undefined;
      return 'sample' in b
        ? createSampler(b.sample, b.buffer, strip.input)
        : 'synth' in b
          ? createSynth(b.synth, strip.input)
          : createInstrument(b.font, b.preset, strip.input);
    });
  let instruments = makeInstruments();

  // one performance per pass round a loop, each with its own small details; built the first time it's needed
  const passes = new Map<number, PassEvents>();
  const passData = (pass: number): PassEvents => {
    let data = passes.get(pass);
    if (!data) {
      data = passEvents(project, pass);
      passes.set(pass, data);
      const oldest = passes.keys().next().value;
      if (passes.size > 3 && oldest !== undefined) passes.delete(oldest);
    }
    return data;
  };

  // each track's ducks: the beats of its source track's notes on the duck's keys, far enough apart to come back up
  const ducks = duckPlan(tracks, secs, DUCK.seconds);
  const duckBeats = [...new Set(ducks.flat())].sort((a, b) => a - b);

  // A segment plays from beat `from`, starting at audio time `at`, until beat `until`: the notes whose grid (where
  // they belong, before anticipation and drift) is in [from, until), even those that sound just before `from`.
  const end = loop?.to ?? until ?? projectEnd(project);
  let seg: Segment = {
    at: ctx.currentTime + LEAD_IN,
    from: Math.max(0, Math.min(end, from)),
    until: end,
    pass: 0,
  };
  const segments: Segment[] = [seg];
  const timeOf = (s: Segment, beat: number) => s.at + secs(beat) - secs(s.from);
  // a note with a bend mark, its curve timed in seconds from where its voice starts at `beat` (partway through, when a
  // held note plays on from a seek or a loop's start)
  const withCurve = (n: PlayedNote, s: Segment, beat: number, at: number): PlayedNote => {
    const bend = readBend(n.bend);
    if (!bend) return n;
    return { ...n, curve: bendCurve(bend, Math.max(0, beat - n.beat), (b) => timeOf(s, n.beat + b) - at) };
  };
  const segmentAt = (t: number) => segments.findLast((x) => x.at <= t) ?? segments[0] ?? seg;
  const current = () => segmentAt(ctx.currentTime);
  const beatNow = (t = ctx.currentTime) => {
    const s = segmentAt(t);
    return secondsToBeat(map, secs(s.from) + t - s.at);
  };

  const duck = (beat: number, at: number) =>
    strips.forEach((s, i) => {
      const beats = ducks[i],
        d = tracks[i]?.mixer.duck;
      if (!beats?.length || !beats.includes(beat) || !d) return;
      const g = s.fader.gain;
      g.setValueAtTime(1, at);
      g.linearRampToValueAtTime(dbToGain(-d.db), at + DUCK.attack);
      g.linearRampToValueAtTime(1, at + DUCK.seconds);
    });

  // automation lanes are few keyframes, so a segment's are all scheduled when it begins; an effect's setting in its
  // own units (dB, say) is turned into its param's as it's scheduled
  const automateStrip = (i: number, s: Segment) => {
    const strip = strips[i],
      lanes = tracks[i]?.automation;
    if (!strip || !lanes) return;
    for (const [id, target] of strip.params()) {
      const keyframes = lanes[id as keyof typeof lanes];
      if (!keyframes?.length) continue;
      const map = target.map;
      const frames: Keyframe[] = map ? keyframes.map((f) => ({ ...f, value: map(f.value) })) : keyframes;
      scheduleLane(target.param, frames, s, (b) => timeOf(s, b), ctx.currentTime);
    }
  };
  const automate = (s: Segment) => strips.forEach((_, i) => automateStrip(i, s));

  // MIDI FX events that aren't notes: tape stops, and a delay send swelling
  const fxEvent = (e: FxEvent, s: Segment) => {
    const at = timeOf(s, e.beat);
    if (e.kind === 'tapeStop')
      for (const inst of instruments) inst?.tapeStop(at - e.seconds, e.seconds, e.rate);
    if (e.kind === 'sendSwell') {
      const i = tracks.findIndex((t) => t.id === e.track);
      const strip = strips[i],
        base = mixed[i]?.delay;
      if (i < 0 || !strip || base === undefined) return;
      const g = strip.delaySend.gain;
      g.setValueAtTime(base, at);
      g.linearRampToValueAtTime(e.send, at + (timeOf(s, e.beat + e.beats) - at) * 0.5);
      g.linearRampToValueAtTime(base, timeOf(s, e.beat + e.beats + 1));
    }
  };

  // the metronome, straight to the output past the mixer
  const clickList = click ? clickBeats(project.meters, 0, end) : [];
  const clicks = new Set<ClickOscillator>(); // metronome clicks scheduled and not yet over, so a seek can take them back
  const tick = ({ first }: Click, at: number) => {
    const osc = playClick(ctx, audioEngine.output, first, at);
    clicks.add(osc);
    osc.addEventListener('ended', () => clicks.delete(osc));
  };

  const sounding = new Map<string, { i: number; key: number; n: PlayedNote }>(); // `${track}:${key}`, notes on and not yet off
  const carried = new Set<PlayedNote>(); // notes a seek restarted mid-way: their note-off is still this segment's to play
  const delayList = tempoSteps(map); // the shared delay and the timed effects keep time with each tempo change
  let next = 0,
    nextDuck = 0,
    nextFx = 0,
    nextClick = 0,
    nextDelay = 0,
    stopped = false;
  const indexFrom = <T>(list: T[], beat: number, get: (x: T) => number) => {
    const k = list.findIndex((x) => get(x) >= beat - 1e-9);
    return k < 0 ? list.length : k;
  };
  const begin = (s: Segment) => {
    const data = passData(s.pass);
    next = indexFrom(data.events, s.from - PICKUP_BEATS, (e) => e.beat);
    nextDuck = indexFrom(duckBeats, s.from, (b) => b);
    nextFx = indexFrom(data.fx, s.from, (e) => e.beat);
    nextClick = indexFrom(clickList, s.from, (c) => c.beat);
    nextDelay = indexFrom(delayList, s.from + 1e-6, (d) => d.beat);
    const delay = delayList[Math.max(0, nextDelay - 1)];
    if (delay) mixer.tempoAt(delay.bpm, s.at);
    automate(s);
  };
  // notes already sounding at a beat play on from it, their note-offs still to come in this segment
  const restartHeld = (beat: number, at: number) => {
    for (const { i, n } of heldAt(passData(seg.pass).played, tracks, beat)) {
      instruments[i]?.noteOn(n.key, n.vel, at, withCurve(n, seg, beat, at));
      sounding.set(`${i}:${n.key}`, { i, key: n.key, n });
      if (!n.held) carried.add(n);
    }
  };
  begin(seg);
  restartHeld(seg.from, seg.at);

  const schedule = () => {
    if (stopped) return; // a tick already queued when playback stopped
    const horizon = ctx.currentTime + LOOKAHEAD;
    for (;;) {
      const data = passData(seg.pass);
      // near the loop's end, hand over everything up to it, so the next pass can start early for its pickups
      const boundary = timeOf(seg, seg.until);
      const switching = !!loop && boundary - SWITCH_LEAD < horizon;
      const limit = switching ? Infinity : horizon;
      for (; next < data.events.length; next++) {
        const e = data.events[next]!;
        // round a loop the next pass takes over at its end; without one, the last notes' tails still end
        if (loop && e.beat > seg.until + 1e-9) break;
        const mine = !e.on && carried.has(e.n);
        if (!mine && (e.n.grid < seg.from - 1e-9 || e.n.grid > seg.until - 1e-9)) continue; // another segment's note
        const at = timeOf(seg, e.beat);
        if (at >= limit) break;
        if (mine) carried.delete(e.n);
        const inst = instruments[e.i],
          id = `${e.i}:${e.n.key}`;
        if (!inst) continue;
        if (!e.on) {
          if (ownsKey(sounding, id, e.n)) {
            inst.noteOff(e.n.key, false, at);
            sounding.delete(id);
          }
          continue;
        }
        if (e.n.glideFrom === undefined || !inst.glide(e.n.glideFrom, e.n.key, at, GLIDE_SECONDS))
          inst.noteOn(e.n.key, e.n.vel, at, withCurve(e.n, seg, e.beat, at));
        else sounding.delete(`${e.i}:${e.n.glideFrom}`);
        sounding.set(id, { i: e.i, key: e.n.key, n: e.n });
      }
      // each list's next item, while it is before the segment's end and its time (less a lead) is before the limit
      const due = <T>(
        item: T | undefined,
        beat: (x: T) => number,
        lead: (x: T) => number = () => 0,
      ): item is T =>
        item !== undefined && beat(item) < seg.until - 1e-9 && timeOf(seg, beat(item)) - lead(item) < limit;
      for (let b = duckBeats[nextDuck]; due(b, (x) => x); b = duckBeats[++nextDuck]) duck(b, timeOf(seg, b));
      // a tape stop starts winding down its own length before its beat
      const lead = (e: FxEvent) => (e.kind === 'tapeStop' ? e.seconds : 0);
      for (let e = data.fx[nextFx]; due(e, (x) => x.beat, lead); e = data.fx[++nextFx]) fxEvent(e, seg);
      for (let d = delayList[nextDelay]; due(d, (x) => x.beat); d = delayList[++nextDelay])
        mixer.tempoAt(d.bpm, timeOf(seg, d.beat));
      for (let c = clickList[nextClick]; due(c, (x) => x.beat); c = clickList[++nextClick])
        tick(c, timeOf(seg, c.beat));

      // the loop's end: carry on from its start, one pass further on
      if (!switching || !loop) break;
      for (const { i, key } of sounding.values()) instruments[i]?.noteOff(key, false, boundary);
      sounding.clear();
      seg = { at: boundary, from: loop.from, until: end, pass: seg.pass + 1 };
      segments.push(seg);
      if (segments.length > 4) segments.shift();
      begin(seg);
    }
  };
  schedule();
  const stopTicker = ticker(TICK_MS, schedule);

  const handle: PlaybackHandle = {
    /** position in beats; negative during the lead-in */
    get beat() {
      return beatNow();
    },
    get done() {
      return stopped || (!loop && ctx.currentTime > timeOf(seg, end) + 2);
    },
    /** the pass round the loop that's playing, from 0 */
    get pass() {
      return current().pass;
    },
    /** jumps to a beat now: cuts what's sounding or scheduled, and restarts notes that are held across that beat */
    seek(beat) {
      if (stopped) return;
      beat = Math.max(0, Math.min(end, beat));
      for (const inst of instruments) inst?.dispose();
      instruments = makeInstruments();
      sounding.clear();
      carried.clear();
      const now = ctx.currentTime;
      for (const osc of clicks) osc.stop(now);
      // a delay swell under way goes back to the track's send, where no automation lane sets it
      strips.forEach((s, i) => {
        if (tracks[i]?.automation.delay?.length) return;
        s.delaySend.gain.cancelScheduledValues(0);
        const send = mixed[i]?.delay;
        if (send !== undefined) s.delaySend.gain.setValueAtTime(send, now);
      });
      seg = { at: now, from: beat, until: end, pass: current().pass };
      segments.length = 0;
      segments.push(seg);
      for (const s of strips) {
        s.fader.gain.cancelScheduledValues(0);
        s.fader.gain.setValueAtTime(1, now);
      }
      begin(seg);
      restartHeld(beat, now);
      schedule();
    },
    /**
     * The mixer's settings, one per track: gain (0 mutes), pan (−1..1), and the sends and low cut where they
     * changed (a pan or send an automation lane moves is left to the lane). Glides there over a few milliseconds so
     * nothing clicks.
     */
    setMix(channels) {
      const now = ctx.currentTime;
      const glide = (param: AudioParam, value: number) => {
        param.cancelScheduledValues(now);
        param.setTargetAtTime(value, now, 0.01);
      };
      channels.forEach((c, i) => {
        const s = strips[i],
          was = mixed[i] ?? {},
          lanes = tracks[i]?.automation;
        if (!s || !c) return;
        s.user.gain.setTargetAtTime(c.gain, now, 0.01);
        if (!lanes?.pan?.length) s.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, c.pan)), now, 0.01);
        if (c.reverb !== undefined && c.reverb !== was.reverb && !lanes?.reverb?.length)
          glide(s.reverbSend.gain, c.reverb);
        if (c.delay !== undefined && c.delay !== was.delay && !lanes?.delay?.length)
          glide(s.delaySend.gain, c.delay);
        if (c.lowCut !== undefined && c.lowCut !== was.lowCut) glide(s.lowCut.frequency, c.lowCut);
        mixed[i] = c;
      });
    },
    setInserts(lists) {
      lists.forEach((list = [], i) => {
        const strip = strips[i],
          was = insertsNow[i] ?? [];
        if (!strip) return;
        insertsNow[i] = list;
        const before = [...strip.effects.keys()].join();
        strip.setInserts(list);
        const rewired = [...strip.effects.keys()].join() !== before;
        const lanes = tracks[i]?.automation ?? {};
        for (const x of list) {
          const e = strip.effects.get(`${x.id}:${x.type}`),
            before = was.find((w) => w.id === x.id && w.type === x.type);
          if (!e) continue;
          const now = insertValues(x),
            then = before ? insertValues(before) : null;
          for (const [k, v] of Object.entries(now))
            if (then && then[k] !== v && !lanes[`${x.id}.${k}`]?.length) e.set(k, v);
        }
        // a new effect picks up its lanes from where playback is
        if (rewired) automateStrip(i, current());
      });
    },
    /** each track's level now, its peak 0..1 */
    levels: () => strips.map((s) => peak(s.meter)),
    stop() {
      if (stopped) return;
      stopped = true;
      stopTicker();
      for (const osc of clicks) osc.stop(0);
      for (const inst of instruments) inst?.dispose();
      mixer.dispose();
    },
  };
  if (mix)
    for (const [i, c] of mix.entries()) {
      const s = strips[i];
      if (s && c) {
        s.user.gain.value = c.gain;
        s.panner.pan.value = Math.max(-1, Math.min(1, c.pan));
      }
    }
  return handle;
}
