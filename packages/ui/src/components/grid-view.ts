// The step grid's geometry (PRD §4.5, §4.6): drum names in a gutter at the left, then one column per step across the
// whole width and one row per drum sound. Pure, so it's tested in Node.
import { barAt } from '@chordinal/daw';
import type { Clip, MeterChange } from '@chordinal/daw';

export const GRID_GUTTER = 110; // px of drum names
export const ROW_H: readonly [least: number, most: number] = [12, 24]; // px per row

/** a cell of the grid by row and step; `col` is -1 over the gutter */
export interface GridCell {
  row: number;
  col: number;
}

export interface GridGeometry {
  rowH: number;
  colW: number;
  rows: number;
  steps: number;
  x: (i: number) => number;
  y: (r: number) => number;
  /** the cell under a point, or null outside the cells; `col` is -1 over the gutter */
  at: (px: number, py: number) => GridCell | null;
}

/** the grid on a canvas of w × h px, with `rows` drum rows and `steps` columns */
export function gridGeometry(w: number, h: number, rows: number, steps: number): GridGeometry {
  const rowH = Math.max(ROW_H[0], Math.min(ROW_H[1], Math.floor(h / Math.max(1, rows))));
  const colW = Math.max(1, (w - GRID_GUTTER) / Math.max(1, steps));
  return {
    rowH,
    colW,
    rows,
    steps,
    x: (i) => GRID_GUTTER + i * colW,
    y: (r) => r * rowH,
    at(px, py) {
      const row = Math.floor(py / rowH);
      if (row < 0 || row >= rows) return null;
      if (px < GRID_GUTTER) return { row, col: -1 };
      const col = Math.floor((px - GRID_GUTTER) / colW);
      return col >= 0 && col < steps ? { row, col } : null;
    },
  };
}

/** the kinds of line the grid draws between steps */
export type LineKind = 'bar' | 'beat' | 'step';

/** the line drawn at a beat of the song: 'bar' on the song's bar lines (meter changes included), 'beat', or 'step' */
export function lineKind(beat: number, meters: MeterChange[]): LineKind {
  const near = (x: number, y: number) => Math.abs(x - y) < 1e-6;
  return near(barAt(meters, beat + 1e-6).start, beat)
    ? 'bar'
    : near(beat, Math.round(beat))
      ? 'beat'
      : 'step';
}

/** the step under the playhead, in a clip of the pattern being edited, or -1 (PRD §4.11) */
export function playheadStep(
  clips: readonly Pick<Clip, 'start' | 'beats' | 'mute'>[],
  beat: number,
  step: number,
  steps: number,
): number {
  const c = clips.find((x) => !x.mute && beat >= x.start && beat < x.start + x.beats);
  if (!c) return -1;
  const i = Math.floor((beat - c.start) / step + 1e-9);
  return i < steps ? i : -1;
}

/** the cells on a straight line from cell a (left out) to cell b (included), so a fast drag paints every cell it crossed */
export function betweenCells(a: GridCell, b: GridCell): [row: number, col: number][] {
  const n = Math.max(Math.abs(b.row - a.row), Math.abs(b.col - a.col));
  const out: [number, number][] = [];
  for (let i = 1; i <= n; i++)
    out.push([Math.round(a.row + ((b.row - a.row) * i) / n), Math.round(a.col + ((b.col - a.col) * i) / n)]);
  return out;
}
