// The step grid for the selected drum clip (PRD §4): a row per drum sound, a column per step. Click a step to turn it
// on or off and drag to paint more; Shift-click an on step to accent it. Notes off the grid show greyed and are left
// alone. Right-click a drum's name to add or hide rows; click it to hear the drum.
import type { TargetedMouseEvent, TargetedPointerEvent } from 'preact';
import { barAt } from '@chordinal/daw';
import { findPattern, isDrums } from '@chordinal/daw';
import { STEP_SIZES, stepOf, stepCount, gridRows, cell, drumName, ACCENT_VELOCITY } from '@chordinal/daw';
import { GM_DRUMS } from '@chordinal/daw';
import type { Clip, Track } from '@chordinal/daw';
import { appMenu } from '../platform/app-menu.ts';
import { useComputed } from '@preact/signals';
import { project } from '../store.ts';
import { focus } from '../focus.ts';
import {
  gridTarget,
  playingStep,
  paintStep,
  accentStep,
  setStepSize,
  addGridRow,
  hideGridRow,
  previewStep,
} from '../steps.ts';
import { useCanvas, rgba } from './canvas.ts';
import { palette, alpha } from '../theme.ts';
import type { Palette } from '../theme.ts';
import { gridGeometry, lineKind, betweenCells, GRID_GUTTER } from './grid-view.ts';
import type { GridCell } from './grid-view.ts';

const FONT = '11px -apple-system, system-ui, sans-serif';
/** the grid's colours, from the theme's */
const colours = (t: Palette) => ({
  row: t['grid-lane'],
  rowAlt: t['grid-key'],
  cell: t['grid-key'],
  gutter: t.panel,
  step: t['grid-lane'],
  beat: t['grid-beat'],
  bar: t['grid-bar'],
  label: t.muted,
  offGrid: t.faint,
  playhead: alpha(t.rec, 0.16),
  accent: t.text,
});

function drawGrid(g: CanvasRenderingContext2D, w: number, h: number, track: Track, clip: Clip, now: number) {
  const rows = gridRows(track, clip),
    step = stepOf(clip),
    steps = stepCount(clip);
  const G = gridGeometry(w, h, rows.length, steps);
  const C = colours(palette.value);
  g.font = FONT;
  g.textBaseline = 'middle';
  rows.forEach((key, r) => {
    const y = G.y(r);
    g.fillStyle = r % 2 ? C.rowAlt : C.row;
    g.fillRect(0, y, w, G.rowH - 1);
    g.fillStyle = C.gutter;
    g.fillRect(0, y, GRID_GUTTER - 4, G.rowH - 1);
    g.fillStyle = C.label;
    g.textAlign = 'left';
    g.fillText(drumName(key), 8, y + G.rowH / 2, GRID_GUTTER - 14);
    for (let i = 0; i < steps; i++) {
      const x = G.x(i),
        { on, off } = cell(clip.notes, key, i, step);
      g.fillStyle = on ? rgba(track.color, 0.35 + 0.65 * Math.min(1, on.vel / ACCENT_VELOCITY)) : C.cell;
      g.beginPath();
      g.roundRect(x + 1.5, y + 2, G.colW - 3, G.rowH - 5, 3);
      g.fill();
      if (on && on.vel >= ACCENT_VELOCITY) {
        g.fillStyle = C.accent;
        g.fillRect(x + 3, y + 3, G.colW - 6, 2);
      }
      g.fillStyle = C.offGrid;
      for (const n of off)
        g.fillRect(x + (n.beat / step - i) * G.colW, y + G.rowH / 2 - 2, Math.max(2, G.colW / 4), 4);
    }
  });
  const bottom = G.y(rows.length);
  for (let i = 0; i <= steps; i++) {
    const kind = lineKind(clip.start + i * step, project.value.meters);
    g.fillStyle = C[kind];
    g.fillRect(G.x(i) - (kind === 'bar' ? 1 : 0), 0, kind === 'step' ? 1 : kind === 'bar' ? 2 : 1, bottom);
  }
  if (now >= 0) {
    g.fillStyle = C.playhead;
    g.fillRect(G.x(now), 0, G.colW, bottom);
  }
}

/** a cell of the grid and the drum its row plays */
interface DrumCell extends GridCell {
  key: number;
}

/** where a pointer event is, and the element it's on */
interface At {
  clientX: number;
  clientY: number;
  currentTarget: Element;
}

/** the cell of `rows` at a row and step, or null past the last row */
function drumCell(rows: number[], { row, col }: GridCell): DrumCell | null {
  const key = rows[row];
  return key === undefined ? null : { row, col, key };
}

/** the cell under a pointer event */
function hit(e: At, track: Track, clip: Clip, rows = gridRows(track, clip)): DrumCell | null {
  const r = e.currentTarget.getBoundingClientRect();
  const G = gridGeometry(r.width, r.height, rows.length, stepCount(clip));
  const at = G.at(e.clientX - r.left, e.clientY - r.top);
  return at && drumCell(rows, at);
}

function down(e: TargetedPointerEvent<HTMLDivElement>, track: Track, clip: Clip) {
  if (e.button !== 0) return;
  focus.value = 'grid';
  // the rows as they are now, for the whole drag, even if turning a step off drops a row
  const rows = gridRows(track, clip);
  const first = hit(e, track, clip, rows);
  if (!first) return;
  if (first.col < 0) {
    previewStep(first.key);
    return;
  }
  if (e.shiftKey) {
    accentStep(track.id, clip.id, first.key, first.col);
    return;
  }
  // PRD §4.8: the first cell decides whether the drag turns steps on or off
  const on = !cell(clip.notes, first.key, first.col, stepOf(clip)).on;
  const merge = `steps-${e.timeStamp}`;
  const seen = new Set<string>();
  const paint = (c: DrumCell | null) => {
    if (!c || c.col < 0 || seen.has(`${c.key}:${c.col}`)) return;
    seen.add(`${c.key}:${c.col}`);
    const was = !!cell(clip.notes, c.key, c.col, stepOf(clip)).on;
    paintStep(track.id, clip.id, c.key, c.col, on, merge);
    if (on && !was) previewStep(c.key);
  };
  paint(first);
  const el = e.currentTarget;
  el.setPointerCapture?.(e.pointerId);
  let last: DrumCell = first;
  // pointer moves can jump several cells, so paint every cell between the last one and this one
  const move = (m: PointerEvent) => {
    const c = hit({ currentTarget: el, clientX: m.clientX, clientY: m.clientY }, track, clip, rows);
    if (!c) return;
    betweenCells(last, c).forEach(([row, col]) => paint(drumCell(rows, { row, col })));
    last = c;
  };
  const up = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

/** right-click a row: add a drum, or hide this one (PRD §4.6) */
function menu(e: TargetedMouseEvent<HTMLDivElement>, track: Track, clip: Clip) {
  e.preventDefault();
  const at = hit(e, track, clip);
  const rows = gridRows(track, clip);
  const missing = Object.keys(GM_DRUMS)
    .map(Number)
    .filter((k) => !rows.includes(k));
  appMenu.popup([
    {
      label: 'Add Row',
      submenu: missing.length
        ? missing.map((k) => ({ label: `${drumName(k)} (${k})`, run: () => addGridRow(track.id, k) }))
        : [{ label: 'Every drum is shown', enabled: false }],
    },
    {
      label: at ? `Hide ${drumName(at.key)}` : 'Hide Row',
      enabled: !!at && !clip.notes.some((n) => n.key === at.key) && (track.stepRows ?? rows).includes(at.key),
      run: () => at && hideGridRow(track.id, at.key, clip),
    },
  ]);
}

/** the step grid's toolbar, in the editor's bar: the step size and what's shown */
export function GridToolbar() {
  const { track, clip } = gridTarget();
  const pattern = clip?.pattern ? findPattern(project.value, clip.pattern) : null;
  return (
    <div class="toolbar">
      <label>
        Step
        <select
          disabled={!clip}
          value={String(clip ? stepOf(clip) : 0.25)}
          onChange={(e) => track && clip && setStepSize(track.id, clip.id, Number(e.currentTarget.value))}
        >
          {STEP_SIZES.map(([s, name]) => (
            <option value={String(s)}>{name}</option>
          ))}
        </select>
      </label>
      <span class="sep" />
      <span>
        {track
          ? `${track.name}${pattern ? ` · ⧉ ${pattern.name}` : clip ? ` · clip at bar ${barAt(project.value.meters, clip.start).bar + 1}` : ''}`
          : 'Select a track'}
      </span>
      <span class="sep" />
      <span>Click a step to turn it on or off, drag to paint, Shift-click to accent</span>
    </div>
  );
}

/** the drum track and the clip of it to edit */
interface GridProps {
  track: Track;
  clip: Clip;
}

function Grid({ track, clip }: GridProps) {
  const now = useComputed(() => playingStep(clip));
  const ref = useCanvas((g, w, h) => drawGrid(g, w, h, track, clip, now.value));
  return (
    <div
      class="roll"
      data-testid="step-grid"
      onPointerDown={(e) => down(e, track, clip)}
      onContextMenu={(e) => menu(e, track, clip)}
    >
      <canvas ref={ref} />
    </div>
  );
}

export function StepGrid() {
  const { track, clip } = gridTarget();
  // PRD §4.3: the messages for no clip and for a melodic track
  if (!track || !clip) return <div class="hint">Select a clip to edit its steps.</div>;
  if (!isDrums(track))
    return <div class="hint">The step grid edits drum tracks. Use the piano roll for this track.</div>;
  return <Grid track={track} clip={clip} />;
}
