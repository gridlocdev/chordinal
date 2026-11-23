// Automation lanes: keyframes a track's value moves through as it plays, and the edits that change them. Pure.
import { updateTrack } from './project.ts';
import type { Automation, Keyframe, Project, Track } from './project.ts';

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

export const laneParam = (id: LaneId): LaneParam => LANE_PARAMS.find((l) => l.id === id)!;

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
  f: (frames: Keyframe[]) => Keyframe[],
): Project {
  return updateTrack(p, trackId, (t) => {
    const was = t.automation[lane] ?? [];
    const frames = f(was);
    if (JSON.stringify(frames) === JSON.stringify(was)) return t;
    const { [lane]: _gone, ...rest } = t.automation;
    return { ...t, automation: frames.length ? { ...rest, [lane]: frames } : rest };
  });
}

/** adds a keyframe (a linear ramp to it), or replaces the one already at that beat; values are kept in range */
export function addKeyframe(p: Project, trackId: string, lane: LaneId, beat: number, value: number): Project {
  const frame: Keyframe = {
    beat: Math.max(0, beat),
    value: clampTo(laneParam(lane), value),
    curve: 'linear',
  };
  return changeLane(p, trackId, lane, (frames) =>
    [...frames.filter((f) => f.beat !== frame.beat), frame].sort((a, b) => a.beat - b.beat),
  );
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
  return changeLane(p, trackId, lane, (frames) => {
    const lo = frames[index - 1]?.beat ?? 0,
      hi = frames[index + 1]?.beat ?? Infinity;
    return frames.map((f, i) =>
      i === index
        ? {
            ...f,
            beat: Math.max(lo, Math.min(hi, Math.max(0, beat))),
            value: clampTo(laneParam(lane), value),
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
  if (curve === 'exp' && !laneParam(lane).exp) return p;
  return changeLane(p, trackId, lane, (frames) => frames.map((f, i) => (i === index ? { ...f, curve } : f)));
}

export const clearLane = (p: Project, trackId: string, lane: LaneId): Project =>
  changeLane(p, trackId, lane, () => []);
