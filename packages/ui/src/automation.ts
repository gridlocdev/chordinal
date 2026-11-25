// Automation lanes in the arrangement: which tracks show one, which value each shows, and how a value maps to a lane's
// height and reads as text. Show Automation (A) shows the selected track's lane under its row.
import { signal } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { laneParam, trackLanes } from '@chordinal/daw';
import type { LaneId, LaneParam, Track } from '@chordinal/daw';
import { project, selected } from './store.ts';

/** the lane each track shows under its row, by track id; a track missing from it shows none */
export const shownLanes: Signal<Record<string, LaneId>> = signal({});

const LOW_DB = -48; // a volume lane's bottom edge above silence

/** shows the track's lane (the first with keyframes, else Volume), or hides it */
export function toggleAutomation(trackId: string | null = selected.value): void {
  const t = project.value.tracks.find((x) => x.id === trackId);
  if (!t) return;
  const { [t.id]: shown, ...rest } = shownLanes.value;
  shownLanes.value = shown ? rest : { ...rest, [t.id]: firstLane(t) };
}

/** the lane to show first: one with keyframes, else Volume; a lane of an effect no longer on the track is left out */
export const firstLane = (t: Track): LaneId =>
  (Object.keys(t.automation) as LaneId[]).find(
    (k) => t.automation[k]?.length && trackLanes(t).some((l) => l.id === k),
  ) ?? 'volume';

/** the points picked in one lane, by beat (a lane has one point per beat) */
export interface PointPicks {
  track: string;
  lane: LaneId;
  beats: readonly number[];
}

/** the automation points picked, which Delete removes and a drag moves together; none when null */
export const pointPicks: Signal<PointPicks | null> = signal(null);

/** the indexes of the points picked in this track's lane */
export function pickedIndexes(t: Track, lane: LaneId): number[] {
  const picks = pointPicks.value;
  if (picks?.track !== t.id || picks.lane !== lane) return [];
  const frames = t.automation[lane] ?? [];
  return frames.flatMap((f, i) => (picks.beats.includes(f.beat) ? [i] : []));
}

export function showLane(trackId: string, lane: LaneId): void {
  shownLanes.value = { ...shownLanes.value, [trackId]: lane };
}

/** a value as a height in its lane, 0 (bottom) to 1 (top) */
export function laneHeight(param: LaneParam, value: number): number {
  const f =
    param.scale === 'db'
      ? value <= 0
        ? 0
        : (20 * Math.log10(value / 1) - LOW_DB) / (20 * Math.log10(param.max) - LOW_DB)
      : param.scale === 'log'
        ? Math.log(value / param.min) / Math.log(param.max / param.min)
        : (value - param.min) / (param.max - param.min);
  return Math.max(0, Math.min(1, f));
}

/** the value at a height in its lane, 0 (bottom) to 1 (top): the inverse of laneHeight */
export function laneValueAt(param: LaneParam, height: number): number {
  const f = Math.max(0, Math.min(1, height));
  if (param.scale === 'db') {
    if (f <= 0.005) return 0;
    const db = LOW_DB + f * (20 * Math.log10(param.max) - LOW_DB);
    return 10 ** (db / 20);
  }
  if (param.scale === 'log') return param.min * (param.max / param.min) ** f;
  return param.min + f * (param.max - param.min);
}

/** a lane's value as a person reads it: −6.0 dB, 30 L, 1.2 kHz, 25%; an effect's setting in its own units */
export function laneText(id: LaneId, value: number, track?: Pick<Track, 'inserts'>): string {
  const param = laneParam(id, track);
  if (param.text) return param.text(value);
  if (param.scale === 'db') {
    const db = 20 * Math.log10(value);
    return value <= 0 ? '−∞ dB' : `${db > 0.05 ? '+' : ''}${db.toFixed(1).replace('-', '−')} dB`;
  }
  if (param.scale === 'log')
    return value >= 1000 ? `${(value / 1000).toFixed(1)} kHz` : `${Math.round(value)} Hz`;
  if (id === 'pan') {
    const n = Math.round(Math.abs(value) * 100);
    return n === 0 ? 'C' : `${n} ${value < 0 ? 'L' : 'R'}`;
  }
  return `${Math.round(value * 100)}%`;
}
