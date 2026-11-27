// The step grid for the selected clip (PRD §4): a row per drum sound, or per note of the key on a melodic track
// (Chordinal PRD §17.1), and a column per step. Click a step to turn it on or off and drag to paint more; Shift-click
// an on step to accent it. Drag an on step's right edge to make its note longer or shorter, a step at a time (Shift:
// freely); a long note is one bar across the steps it covers (Chordinal PRD §17.4). The lane under the grid sets each
// step's velocity or chance of playing; drag across it to paint (§17.5). Notes off the grid show greyed and are left alone. Click a row's name to hear it. On a drum
// track, right-click a drum's name to add or hide rows, or to load a sample on it, and drop a WAV, AIFF or MP3 on a
// row to play it there in place of the kit's sound (PRD §14).
import type { TargetedDragEvent, TargetedMouseEvent, TargetedPointerEvent } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { barAt, GRID_OCTAVES, GRID_OCTAVE_RANGE } from '@chordinal/daw';
import { findPattern, isDrums } from '@chordinal/daw';
import { STEP_SIZES, stepOf, stepCount, cell, drumName, ACCENT_VELOCITY } from '@chordinal/daw';
import { laneValueOf, stepNotes, MAX_SWING, swingOf } from '@chordinal/daw';
import type { LaneValue } from '@chordinal/daw';
import { noteName } from '@chordinal/lib';
import { GM_DRUMS } from '@chordinal/daw';
import type { Clip, Track } from '@chordinal/daw';
import { appMenu } from '../platform/app-menu.ts';
import { useComputed } from '@preact/signals';
import { project, selected } from '../store.ts';
import { focus } from '../focus.ts';
import {
  gridTarget,
  playingStep,
  paintStep,
  stretchStep,
  laneShows,
  paintLane,
  accentStep,
  setStepSize,
  setSwing,
  addGridRow,
  hideGridRow,
  previewStep,
  rowsOf,
  shownOctave,
  setGridOctave,
  toggleChromatic,
} from '../steps.ts';
import { useCanvas, rgba } from './canvas.ts';
import { palette, alpha } from '../theme.ts';
import type { Palette } from '../theme.ts';
import { gridGeometry, lineKind, betweenCells, GRID_GUTTER, ROW_H } from './grid-view.ts';
import { loadDrumSample, pickDrumSample, removeDrumSample, rowName, rowSample } from '../drum-sample-edit.ts';
import { notify } from '../store.ts';
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
  sampled: t.accent,
});

function drawGrid(g: CanvasRenderingContext2D, w: number, h: number, track: Track, clip: Clip, now: number) {
  const rows = rowsOf(track, clip),
    drums = isDrums(track),
    tonic = project.value.key?.tonic ?? 0,
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
    const sample = drums ? rowSample(track, key) : null;
    // a melodic row's name is its note's; the key's tonic stands out
    g.fillStyle = sample ? C.sampled : !drums && (key - tonic) % 12 === 0 ? C.accent : C.label;
    g.textAlign = 'left';
    const name = sample ? `♪ ${sample.name}` : drums ? drumName(key) : noteName(key);
    g.fillText(name, 8, y + G.rowH / 2, GRID_GUTTER - 14);
    const cells = Array.from({ length: steps }, (_, i) => cell(clip.notes, key, i, step));
    // every step's empty cell first, then each on step's note as one bar across the steps it covers
    cells.forEach((_, i) => {
      g.fillStyle = C.cell;
      g.beginPath();
      g.roundRect(G.x(i) + 1.5, y + 2, G.colW - 3, G.rowH - 5, 3);
      g.fill();
    });
    cells.forEach(({ on, off }, i) => {
      const x = G.x(i);
      if (on) {
        const width = spanOf(on.beats, step, steps - i) * G.colW;
        // a step that may not play is filled only to its chance (Chordinal PRD §17.5)
        const share = laneValueOf(on, 'chance'),
          full = G.rowH - 5,
          tall = full * share;
        if (share < 1) {
          g.fillStyle = rgba(track.color, 0.18);
          g.beginPath();
          g.roundRect(x + 1.5, y + 2, width - 3, full, 3);
          g.fill();
        }
        g.fillStyle = rgba(track.color, 0.35 + 0.65 * Math.min(1, on.vel / ACCENT_VELOCITY));
        g.beginPath();
        g.roundRect(x + 1.5, y + 2 + full - tall, width - 3, tall, 3);
        g.fill();
        if (on.vel >= ACCENT_VELOCITY) {
          g.fillStyle = C.accent;
          g.fillRect(x + 3, y + 3, width - 6, 2);
        }
      }
      g.fillStyle = C.offGrid;
      for (const n of off)
        g.fillRect(x + (n.beat / step - i) * G.colW, y + G.rowH / 2 - 2, Math.max(2, G.colW / 4), 4);
    });
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

/** how many steps a note `beats` long is drawn across: at least one, and no further than the `left` steps */
const spanOf = (beats: number, step: number, left: number) => Math.min(left, Math.max(1, beats / step));

/** px either side of a note's right end that grab it to change its length */
const EDGE = 5;

/** the on step whose note's right end is under the pointer, on the pointer's row, or null */
function edgeAt(e: At, clip: Clip, rows: number[]): DrumCell | null {
  const r = e.currentTarget.getBoundingClientRect(),
    steps = stepCount(clip),
    step = stepOf(clip);
  const G = gridGeometry(r.width, r.height, rows.length, steps);
  const px = e.clientX - r.left,
    row = Math.floor((e.clientY - r.top) / G.rowH),
    key = rows[row];
  if (key === undefined || px < GRID_GUTTER) return null;
  const grab = Math.min(EDGE, G.colW / 3);
  for (let i = 0; i < steps; i++) {
    const on = cell(clip.notes, key, i, step).on;
    if (on && Math.abs(px - G.x(i + spanOf(on.beats, step, steps - i))) <= grab) return { row, col: i, key };
  }
  return null;
}

/** drags the right end of step `at`'s note: its length follows the pointer, as one undo step */
function stretch(
  e: TargetedPointerEvent<HTMLDivElement>,
  track: Track,
  clip: Clip,
  rows: number[],
  at: DrumCell,
) {
  const el = e.currentTarget,
    step = stepOf(clip),
    merge = `length-${e.timeStamp}`;
  el.setPointerCapture?.(e.pointerId);
  const move = (m: PointerEvent) => {
    const r = el.getBoundingClientRect();
    const G = gridGeometry(r.width, r.height, rows.length, stepCount(clip));
    const beat = ((m.clientX - r.left - GRID_GUTTER) / G.colW) * step;
    stretchStep(track.id, clip.id, at.key, at.col, beat - at.col * step, m.shiftKey, merge);
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

/** the resize cursor over a note's right end */
function hover(e: TargetedPointerEvent<HTMLDivElement>, track: Track, clip: Clip) {
  if (e.buttons) return;
  e.currentTarget.style.cursor = edgeAt(e, clip, rowsOf(track, clip)) ? 'ew-resize' : '';
}

/** a cell of the grid and the drum or note its row plays */
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
function hit(e: At, track: Track, clip: Clip, rows = rowsOf(track, clip)): DrumCell | null {
  const r = e.currentTarget.getBoundingClientRect();
  const G = gridGeometry(r.width, r.height, rows.length, stepCount(clip));
  const at = G.at(e.clientX - r.left, e.clientY - r.top);
  return at && drumCell(rows, at);
}

function down(e: TargetedPointerEvent<HTMLDivElement>, track: Track, clip: Clip) {
  if (e.button !== 0) return;
  focus.value = 'grid';
  // the rows as they are now, for the whole drag, even if turning a step off drops a row
  const rows = rowsOf(track, clip);
  const edge = edgeAt(e, clip, rows);
  if (edge) {
    stretch(e, track, clip, rows, edge);
    return;
  }
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

/** right-click a drum row: add a drum, or hide this one (PRD §4.6); a melodic track's rows have no menu */
function menu(e: TargetedMouseEvent<HTMLDivElement>, track: Track, clip: Clip) {
  e.preventDefault();
  if (!isDrums(track)) return;
  const at = hit(e, track, clip);
  const rows = rowsOf(track, clip);
  const missing = Object.keys(GM_DRUMS)
    .map(Number)
    .filter((k) => !rows.includes(k));
  const sample = at && rowSample(track, at.key);
  appMenu.popup([
    {
      label: at ? `Load a Sample for ${rowName(track, at.key)}…` : 'Load a Sample…',
      enabled: !!at,
      run: () => at && pickDrumSample(track.id, at.key),
    },
    {
      label: sample ? `Remove Sample ${sample.name}` : 'Remove Sample',
      enabled: !!sample,
      run: () => at && removeDrumSample(track.id, at.key),
    },
    '-',
    {
      label: 'Add Row',
      submenu: missing.length
        ? missing.map((k) => ({ label: `${drumName(k)} (${k})`, run: () => addGridRow(track.id, k) }))
        : [{ label: 'Every drum is shown', enabled: false }],
    },
    {
      label: at ? `Hide ${rowName(track, at.key)}` : 'Hide Row',
      enabled: !!at && !clip.notes.some((n) => n.key === at.key) && (track.stepRows ?? rows).includes(at.key),
      run: () => at && hideGridRow(track.id, at.key, clip),
    },
  ]);
}

/** a melodic track's range: its rows an octave down or up, and all twelve notes or the key's (Chordinal PRD §17.1) */
function RangeControls({ track, clip }: { track: Track; clip: Clip | null }) {
  const octave = shownOctave(track, clip),
    [low, high] = GRID_OCTAVE_RANGE,
    from = (octave + 1) * 12 + (project.value.key?.tonic ?? 0);
  return (
    <>
      <span class="sep" />
      <button
        title="Show the notes an octave lower"
        disabled={octave <= low}
        onClick={() => setGridOctave(track.id, octave - 1)}
      >
        Octave −
      </button>
      <span class="range" title="The notes the rows run from and to">
        {noteName(from)}–{noteName(from + 12 * GRID_OCTAVES)}
      </span>
      <button
        title="Show the notes an octave higher"
        disabled={octave >= high}
        onClick={() => setGridOctave(track.id, octave + 1)}
      >
        Octave +
      </button>
      <button
        class={track.gridChromatic ? 'on' : ''}
        aria-pressed={!!track.gridChromatic}
        title="Show all twelve notes, not only the key's"
        onClick={() => toggleChromatic(track.id)}
      >
        Chromatic
      </button>
    </>
  );
}

/** the clip's swing, 0 to 75%: each drag, or each key press, is one undo step (Chordinal PRD §17.7) */
function SwingSlider({ track, clip }: { track: Track | null; clip: Clip | null }) {
  // a ref, not state: the first input of a drag comes before a re-render would
  const gesture = useRef('');
  const percent = clip ? Math.round(swingOf(clip) * 100) : 0;
  const set = (value: number) => track && clip && setSwing(track.id, clip.id, value / 100, gesture.current);
  return (
    <label class="swing" title="Delay every second step (double-click for straight)">
      Swing
      <input
        type="range"
        aria-label="Swing"
        aria-valuetext={`${percent}%`}
        min="0"
        max={Math.round(MAX_SWING * 100)}
        step="1"
        disabled={!clip}
        value={percent}
        onPointerDown={(e) => {
          // the second press of a double-click goes with the first, so undo takes the slider back to before both
          if (e.pointerType !== 'mouse') gesture.current = `swing-${e.timeStamp}`;
        }}
        onMouseDown={(e) => {
          if (e.detail < 2) gesture.current = `swing-${e.timeStamp}`;
        }}
        onKeyDown={(e) => (gesture.current = `swing-${e.timeStamp}`)}
        onInput={(e) => set(Number(e.currentTarget.value))}
        onDblClick={() => set(0)}
      />
      <span class="value">{percent}%</span>
    </label>
  );
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
      <SwingSlider track={track} clip={clip} />
      {track && !isDrums(track) && !track.kind && <RangeControls track={track} clip={clip} />}
      <span class="sep" />
      <span>
        {track
          ? `${track.name}${pattern ? ` · ⧉ ${pattern.name}` : clip ? ` · clip at bar ${barAt(project.value.meters, clip.start).bar + 1}` : ''}`
          : (project.value.tracks.find((t) => t.id === selected.value)?.name ?? 'Select a track')}
      </span>
      <span class="sep" />
      <span class="tip" title={STEP_TIP}>
        {STEP_TIP}
      </span>
    </div>
  );
}

/** the track and the clip of it to edit */
interface GridProps {
  track: Track;
  clip: Clip;
}

function Grid({ track, clip }: GridProps) {
  const now = useComputed(() => playingStep(clip));
  const ref = useCanvas((g, w, h) => drawGrid(g, w, h, track, clip, now.value));
  const [dropping, setDropping] = useState(false);
  const files = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
  const drums = isDrums(track);
  const dropped = (e: TargetedDragEvent<HTMLDivElement>) => {
    setDropping(false);
    if (!files(e) || !drums) return;
    e.preventDefault();
    const at = hit(e, track, clip);
    const file = e.dataTransfer?.files[0];
    if (!at || !file) notify('Drop a WAV, AIFF or MP3 file on a drum row to play it there', 'error');
    else void loadDrumSample(track.id, at.key, file);
  };
  // rows that don't fit at their least height scroll (chromatic rows, Chordinal PRD §17.1)
  const rows = rowsOf(track, clip).length;
  return (
    <div
      class="roll steps"
      data-focus-part="grid"
      data-focus-item
      data-focused={focus.value === 'grid' || undefined}
      tabIndex={0}
      aria-label="Step grid"
      onFocus={(e) => e.target === e.currentTarget && (focus.value = 'grid')}
    >
      <div
        class={`grid ${dropping ? 'drop' : ''}`}
        style={{ height: `${rows * ROW_H[0]}px` }}
        data-testid="step-grid"
        onPointerDown={(e) => down(e, track, clip)}
        onPointerMove={(e) => hover(e, track, clip)}
        onContextMenu={(e) => menu(e, track, clip)}
        onDragOver={(e) => {
          if (files(e) && drums) {
            e.preventDefault();
            setDropping(true);
          }
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={dropped}
      >
        <canvas ref={ref} />
      </div>
    </div>
  );
}

/** the lane's value at y px of a lane h px tall: a velocity from 1 to 127, or a chance in whole percents */
function laneValueAt(y: number, h: number, what: LaneValue): number {
  const share = Math.max(0, Math.min(1, (h - 3 - y) / (h - 6)));
  return what === 'vel' ? 1 + Math.round(share * 126) : Math.round(share * 100) / 100;
}

function drawLane(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  track: Track,
  clip: Clip,
  what: LaneValue,
) {
  const t = palette.value,
    step = stepOf(clip),
    steps = stepCount(clip),
    colW = w / steps;
  g.fillStyle = t['grid-lane'];
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < steps; i++) {
    const notes = stepNotes(clip.notes, i, step);
    g.fillStyle = t['grid-key'];
    g.fillRect(i * colW + 1.5, 3, colW - 3, h - 6);
    if (!notes.length) continue;
    const top = Math.max(...notes.map((n) => laneValueOf(n, what))),
      share = what === 'vel' ? top / 127 : top,
      tall = Math.max(2, (h - 6) * share);
    g.fillStyle = rgba(track.color, 0.85);
    g.fillRect(i * colW + 1.5, h - 3 - tall, colW - 3, tall);
  }
}

/** the lane under the grid: a bar per step of its velocity or its chance, painted by dragging (Chordinal PRD §17.5) */
function StepLane({ track, clip }: GridProps) {
  const what = laneShows.value;
  const ref = useCanvas((g, w, h) => drawLane(g, w, h, track, clip, laneShows.value));
  const down = (e: TargetedPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    focus.value = 'grid';
    const el = e.currentTarget,
      steps = stepCount(clip),
      merge = `lane-${e.timeStamp}`;
    el.setPointerCapture?.(e.pointerId);
    let last: number | null = null;
    // pointer moves can jump several steps, so every step between the last one and this one is painted
    const paint = (m: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      const col = Math.max(0, Math.min(steps - 1, Math.floor(((m.clientX - r.left) / r.width) * steps))),
        value = laneValueAt(m.clientY - r.top, r.height, laneShows.value);
      const from = last ?? col;
      for (let i = Math.min(from, col); i <= Math.max(from, col); i++)
        paintLane(track.id, clip.id, i, value, merge);
      last = col;
    };
    paint(e);
    const up = () => {
      el.removeEventListener('pointermove', paint);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', paint);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const choice = (value: LaneValue, label: string, title: string) => (
    <button
      class={what === value ? 'on' : ''}
      aria-pressed={what === value}
      title={title}
      onClick={() => (laneShows.value = value)}
    >
      {label}
    </button>
  );
  return (
    <div class="step-lane">
      <div class="lane-switch" role="group" aria-label="What the lane sets">
        {choice('vel', 'Velocity', 'Drag across the lane to set how hard each step plays')}
        {choice('chance', 'Probability', 'Drag across the lane to set the chance each step plays')}
      </div>
      <div class="lane-bars" data-testid="step-lane" onPointerDown={down}>
        <canvas ref={ref} />
      </div>
    </div>
  );
}

const STEP_TIP = 'Click a step to turn it on or off, drag to paint, Shift-click to accent';

export function StepGrid() {
  const { track, clip } = gridTarget();
  // PRD §4.3: the message for no clip; melodic tracks have a grid of their own now (Chordinal PRD §17.1)
  if (!track || !clip)
    return (
      <div class="hint">
        {selected.value
          ? 'Click one of the track’s clips in the arrangement to edit its steps.'
          : 'Select a clip to edit its steps.'}
      </div>
    );
  return (
    <>
      <Grid track={track} clip={clip} />
      <StepLane track={track} clip={clip} />
    </>
  );
}
