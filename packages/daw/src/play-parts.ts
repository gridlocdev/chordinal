// The pieces playProject (player.js) schedules from: each pass's note events, the notes a start mid-way restarts,
// the beats a track ducks on, an automation lane on an audio param, and a metronome click.
import { trackNotes, isDrums } from './project.ts';
import type { Keyframe, Project, Track } from './project.ts';
import { performProject } from './fx.ts';
import type { FxEvent, PlayedNote } from './fx.ts';
import { valueAt } from './automation.ts';

const CLICK = { bar: 1760, beat: 1320, seconds: 0.05, gain: 0.3 }; // the metronome: pitches of a bar's first beat and the rest

/** the parts of a played note heldAt reads */
type Sounding = Pick<PlayedNote, 'beat' | 'beats' | 'grid'>;

/**
 * The notes sounding at a beat that started before it, which a start or a jump there has to restart: not drums, since
 * a hit restarted mid-ring would sound like a new one. `played` is each track's played notes.
 */
export function heldAt<N extends Sounding>(
  played: N[][],
  tracks: Pick<Track, 'instrument'>[],
  beat: number,
): { i: number; n: N }[] {
  return played.flatMap((notes, i) =>
    // played has a list for each track, in the same order
    isDrums(tracks[i]!)
      ? []
      : notes.filter((n) => n.grid < beat && n.beat < beat && n.beat + n.beats > beat).map((n) => ({ i, n })),
  );
}

/**
 * Whether a note's note-off should release its key: not when a later note on the same key has retriggered it, or the
 * earlier note's end would cut the later one short.
 */
export const ownsKey = <N>(sounding: Map<string, { n?: N | null }>, id: string, n: N): boolean => {
  const s = sounding.get(id);
  return !s?.n || s.n === n;
};

/** a note starting or ending in a pass: i is its track's index */
export interface NoteEvent {
  beat: number;
  on: boolean;
  i: number;
  n: PlayedNote;
}

/** one pass, ready to schedule: each track's played notes, their note events in order, and the FX's events */
export interface PassEvents {
  played: PlayedNote[][];
  events: NoteEvent[];
  fx: FxEvent[];
}

/**
 * One pass's performance as note events: note-offs sort before note-ons on the same beat, so a repeated key is
 * released before it restarts. A held note has no off: the next note glides on from it.
 */
export function passEvents(project: Project, pass: number): PassEvents {
  const { tracks: played, events: fxEvents } = performProject(project, pass);
  const events = played
    .flatMap((notes, i) =>
      notes.flatMap((n): NoteEvent[] => [
        { beat: n.beat, on: true, i, n },
        ...(n.held ? [] : [{ beat: n.beat + n.beats, on: false, i, n }]),
      ]),
    )
    .sort((a, b) => a.beat - b.beat || +a.on - +b.on);
  return { played, events, fx: [...fxEvents].sort((a, b) => a.beat - b.beat) };
}

/**
 * each track's ducks: the beats of its source track's notes on the duck's keys, at least `apart` seconds apart so
 * the track comes back up between them; `secs` gives a beat's time in seconds
 */
export function duckPlan(tracks: Track[], secs: (beat: number) => number, apart: number): number[][] {
  return tracks.map((t) => {
    const d = t.mixer.duck,
      source = d && tracks.find((s) => s.id === d.from);
    if (!d || !source) return [];
    const out: number[] = [];
    for (const b of [
      ...new Set(
        trackNotes(source)
          .filter((n) => d.keys.includes(n.key))
          .map((n) => n.beat),
      ),
    ].sort((a, b) => a - b)) {
      const last = out.at(-1);
      if (last === undefined || secs(b) - secs(last) >= apart) out.push(b);
    }
    return out;
  });
}

/** the parts of a Web Audio AudioParam an automation lane is scheduled on */
export interface AutomatedParam {
  cancelScheduledValues(time: number): unknown;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
}

/** a stretch of playback: from beat `from` at audio time `at`, up to beat `until` */
export interface LaneSegment {
  from: number;
  at: number;
  until: number;
}

/** an automation lane's keyframes on an audio param, for the segment `s`; `timeOf` gives a beat's audio time in it */
export function scheduleLane(
  param: AutomatedParam,
  keyframes: Keyframe[],
  s: LaneSegment,
  timeOf: (beat: number) => number,
  now: number,
): void {
  // just after s.at, so the last segment's ramp ending at s.at isn't dropped short of its target
  param.cancelScheduledValues(s.at + 0.001);
  param.setValueAtTime(valueAt(keyframes, s.from), Math.max(now, s.at));
  for (const f of keyframes) {
    if (f.beat <= s.from || f.beat > s.until) continue;
    const t = timeOf(f.beat);
    if (f.curve === 'exp') param.exponentialRampToValueAtTime(f.value, t);
    else if (f.curve === 'linear') param.linearRampToValueAtTime(f.value, t);
    else param.setValueAtTime(f.value, t);
  }
}

// The Web Audio nodes a click is made of. The engine has no DOM types; the page passes the real context and output.

/** a Web Audio node a click connects to */
export interface AudioNodeLike {
  connect<T extends AudioNodeLike>(destination: T): T;
  disconnect(): void;
}

export interface ClickOscillator extends AudioNodeLike {
  start(when: number): void;
  stop(when: number): void;
  addEventListener(type: 'ended', listener: () => void): void;
}

interface ClickGain extends AudioNodeLike {
  gain: AutomatedParam;
}

declare const OscillatorNode: new (ctx: object, options: { frequency: number }) => ClickOscillator;
declare const GainNode: new (ctx: object, options: { gain: number }) => ClickGain;

/** a metronome click at `at` into `output`: higher on a bar's first beat. Returns its oscillator, which ends itself. */
export function playClick(ctx: object, output: AudioNodeLike, first: boolean, at: number): ClickOscillator {
  const osc = new OscillatorNode(ctx, { frequency: first ? CLICK.bar : CLICK.beat });
  const env = new GainNode(ctx, { gain: 0 });
  env.gain.setValueAtTime(CLICK.gain, at);
  env.gain.exponentialRampToValueAtTime(0.001, at + CLICK.seconds);
  osc.connect(env).connect(output);
  osc.start(at);
  osc.stop(at + CLICK.seconds);
  osc.addEventListener('ended', () => env.disconnect());
  return osc;
}
