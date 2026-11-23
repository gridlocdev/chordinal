// Automation lanes: keyframes a track's value moves through as it plays, and the edits that change them. Pure.
import { updateTrack } from './project.ts';
import type { Automation, Keyframe, Project, Track } from './project.ts';
import { effectSpec, insertValue, insertsOf, paramText } from './effects.ts';

/** the values a track can automate */
export type LaneId = keyof Automation;

/** a lane's value: its name, range, how it's drawn and what it rests at with no keyframes */
export interface LaneParam {
  id: LaneId;
  label: string;
  min: number;
  max: number;
  /** 'db': a gain drawn in decibels; 'log': a frequency drawn on octaves; 'linear': as it is */
  scale: 'db' | 'log' | 'linear';
  /** the value with no keyframes, from the track's mixer */
  rest: (track: Track) => number;
  /** whether a ramp can be exponential (only where every value is above 0) */
  exp: boolean;
  /** how a value reads, for a lane with its own units (an effect's setting) */
  text?: (value: number) => string;
}

export const LANE_PARAMS: LaneParam[] = [
  { id: 'volume', label: 'Volume', min: 0, max: 2, scale: 'db', rest: () => 1, exp: false },
  { id: 'pan', label: 'Pan', min: -1, max: 1, scale: 'linear', rest: (t) => t.mixer.pan, exp: false },
  { id: 'tone', label: 'Tone', min: 80, max: 20000, scale: 'log', rest: () => 20000, exp: true },
  {
    id: 'reverb',
    label: 'Reverb Send',
    min: 0,
    max: 1.5,
    scale: 'linear',
    rest: (t) => t.mixer.sends.reverb,
    exp: false,
  },
  {
    id: 'delay',
    label: 'Delay Send',
    min: 0,
    max: 1.5,
    scale: 'linear',
    rest: (t) => t.mixer.sends.delay,
    exp: false,
  },
];

/**
 * the lanes a track can show: its mixer's, then each automatable setting of each of its effects, `<insert>.<setting>`,
 * named after the effect (numbered when the track has two of a kind) and drawn in the setting's own units
 */
export function trackLanes(track: Pick<Track, 'inserts'>): LaneParam[] {
  const list = insertsOf(track);
  const out = [...LANE_PARAMS];
  for (const x of list) {
    const spec = effectSpec(x.type);
    if (!spec) continue;
    const same = list.filter((y) => y.type === x.type);
    const name = same.length > 1 ? `${spec.name} ${same.indexOf(x) + 1}` : spec.name;
    for (const q of spec.params)
      if (q.automatable)
        out.push({
          id: `${x.id}.${q.id}`,
          label: `${name} ${q.label}`,
          min: q.min,
          max: q.max,
          scale: q.scale === 'log' ? 'log' : 'linear',
          rest: (t) => {
            const now = insertsOf(t).find((y) => y.id === x.id);
            return now ? insertValue(now, q.id) : q.value;
          },
          exp: q.min > 0,
          text: (v) => paramText(q, v),
        });
  }
  return out;
}

/** a lane's value; an effect's setting needs its track. A lane of an effect no longer there reads 0..1. */
export function laneParam(id: LaneId, track?: Pick<Track, 'inserts'>): LaneParam {
  const own = LANE_PARAMS.find((l) => l.id === id);
  if (own) return own;
  return (
    (track && trackLanes(track).find((l) => l.id === id)) ?? {
      id,
      label: id,
      min: 0,
      max: 1,
      scale: 'linear',
      rest: () => 0,
      exp: false,
    }
  );
}

/** a keyframed value at a beat, interpolated the way Web Audio ramps it */
export function valueAt(frames: Keyframe[], beat: number): number {
  const i = frames.findLastIndex((f) => f.beat <= beat);
  const a = frames[i < 0 ? 0 : i];
  if (!a) throw new TypeError('an automation lane needs a keyframe');
  if (i < 0) return a.value;
  const b = frames[i + 1];
  if (!b || b.curve === 'set' || b.beat <= a.beat) return a.value;
  const p = (beat - a.beat) / (b.beat - a.beat);
  return b.curve === 'exp' ? a.value * (b.value / a.value) ** p : a.value + (b.value - a.value) * p;
}

const clampTo = (param: LaneParam, value: number) => Math.max(param.min, Math.min(param.max, value));

/** the track's lane changed by `f`; an empty lane is removed, so a track with none saves as it did */
function changeLane(
  p: Project,
  trackId: string,
  lane: LaneId,
  f: (frames: Keyframe[], param: LaneParam) => Keyframe[],
): Project {
  return updateTrack(p, trackId, (t) => {
    const was = t.automation[lane] ?? [];
    const frames = f(was, laneParam(lane, t));
    if (JSON.stringify(frames) === JSON.stringify(was)) return t;
    const { [lane]: _gone, ...rest } = t.automation;
    return { ...t, automation: frames.length ? { ...rest, [lane]: frames } : rest };
  });
}

/** adds a keyframe (a linear ramp to it), or replaces the one already at that beat; values are kept in range */
export function addKeyframe(p: Project, trackId: string, lane: LaneId, beat: number, value: number): Project {
  return changeLane(p, trackId, lane, (frames, param) => {
    const frame: Keyframe = { beat: Math.max(0, beat), value: clampTo(param, value), curve: 'linear' };
    return [...frames.filter((f) => f.beat !== frame.beat), frame].sort((a, b) => a.beat - b.beat);
  });
}

/** moves the keyframe at `index`, kept between its neighbours so the order (and every index) stays the same */
export function moveKeyframe(
  p: Project,
  trackId: string,
  lane: LaneId,
  index: number,
  beat: number,
  value: number,
): Project {
  return changeLane(p, trackId, lane, (frames, param) => {
    const lo = frames[index - 1]?.beat ?? 0,
      hi = frames[index + 1]?.beat ?? Infinity;
    return frames.map((f, i) =>
      i === index
        ? {
            ...f,
            beat: Math.max(lo, Math.min(hi, Math.max(0, beat))),
            value: clampTo(param, value),
          }
        : f,
    );
  });
}

export const removeKeyframe = (p: Project, trackId: string, lane: LaneId, index: number): Project =>
  changeLane(p, trackId, lane, (frames) => frames.filter((_, i) => i !== index));

/** how the value gets to the keyframe at `index` from the one before it; 'exp' only where the lane allows it */
export function setKeyframeCurve(
  p: Project,
  trackId: string,
  lane: LaneId,
  index: number,
  curve: Keyframe['curve'],
): Project {
  if (
    curve === 'exp' &&
    !laneParam(
      lane,
      p.tracks.find((t) => t.id === trackId),
    ).exp
  )
    return p;
  return changeLane(p, trackId, lane, (frames) => frames.map((f, i) => (i === index ? { ...f, curve } : f)));
}

export const clearLane = (p: Project, trackId: string, lane: LaneId): Project =>
  changeLane(p, trackId, lane, () => []);
