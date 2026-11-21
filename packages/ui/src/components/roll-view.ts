// What the piano roll's parts share: the part of the roll shown, its geometry on a canvas, the selection rectangle
// and snapping to the grid.
import { signal } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { settings } from '../store.ts';

export const GUTTER = 52; // px of keyboard at the left
export const STRIP = 26; // px of chord names above the lanes
export const PPB: readonly [min: number, max: number] = [4, 400];
export const LANE_H = 12;
export const VEL_H = 44;
export const EDGE = 5; // px at a note's right edge that resize it

/** a point on the roll: a beat and a key */
export interface RollPoint {
  beat: number;
  key: number;
}

/** what's shown: from beat, px per beat, and the key at the bottom */
export interface RollView {
  from: number;
  ppb: number;
  low: number;
}

/** a selection rectangle being dragged out: two corners */
export const band: Signal<{ a: RollPoint; b: RollPoint } | null> = signal(null);
export const view: Signal<RollView> = signal({ from: 0, ppb: 40, low: 48 });

/** the key lanes: the lowest and highest key shown, a lane's height, and the top of a key's lane */
export interface Lanes {
  lo: number;
  hi: number;
  laneH: number;
  y: (k: number) => number;
}

export interface RollGeometry {
  L: Lanes;
  top: number;
  bottom: number;
  w: number;
  h: number;
  from: number;
  ppb: number;
  x: (b: number) => number;
  beatAt: (x: number) => number;
  keyAt: (y: number) => number;
}

/** a view's geometry for a canvas of w × h */
export function rollGeometry({ from, ppb, low }: RollView, w: number, h: number): RollGeometry {
  const top = STRIP + 4,
    bottom = h - VEL_H;
  const rows = Math.ceil((bottom - top) / LANE_H);
  const L: Lanes = { lo: low, hi: low + rows - 1, laneH: LANE_H, y: (k) => bottom - (k - low + 1) * LANE_H };
  return {
    L,
    top,
    bottom,
    w,
    h,
    from,
    ppb,
    x: (b) => GUTTER + (b - from) * ppb,
    beatAt: (x) => from + (x - GUTTER) / ppb,
    keyAt: (y) => low + Math.floor((bottom - y) / LANE_H),
  };
}

/** the view's geometry for a canvas of w × h */
export const geometry = (w: number, h: number): RollGeometry => rollGeometry(view.value, w, h);

/** a beat snapped to a grid of `grid` beats, unless Alt */
export const snapToGrid = (b: number, grid: number, altKey: boolean): number =>
  altKey ? b : Math.round(b / grid) * grid;

/** the beat snapped to the grid, unless Alt */
export const snap = (b: number, e: { altKey: boolean }): number =>
  snapToGrid(b, settings.value.grid, e.altKey);

/** the view moved up or down, as little as it takes, so keys lo to hi are all in its `rows` lanes (PRD §5.7) */
export function showKeys(v: RollView, lo: number, hi: number, rows: number): RollView {
  if (lo >= v.low && hi <= v.low + rows - 1) return v;
  const low = hi - lo + 1 > rows || lo < v.low ? lo : hi - rows + 1;
  return { ...v, low: Math.max(0, low) };
}
