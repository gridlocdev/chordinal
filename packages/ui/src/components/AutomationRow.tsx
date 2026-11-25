// A track's automation lane, under its row in the arrangement: the value it shows drawn as a line through its points.
// Click empty space to add a point and drag it into place, drag a point to move it, double-click one to delete it, and
// right-click for its curve and the lane's other values. Points snap to the beat; hold Shift while dragging to place
// them freely. Shift-drag on empty space picks the points in a box, and Shift-click a point to pick it or let it go;
// dragging a picked point moves every picked point with it, and Delete removes them.
import { useState } from 'preact/hooks';
import type { TargetedMouseEvent, TargetedPointerEvent } from 'preact';
import { signal } from '@preact/signals';
import {
  laneParam,
  trackLanes,
  valueAt,
  addKeyframe,
  moveKeyframe,
  moveKeyframes,
  removeKeyframe,
} from '@chordinal/daw';
import type { Keyframe, KeyframeMoves, LaneId, Track } from '@chordinal/daw';
import { project, selected, selectedClip } from '../store.ts';
import { edit } from '../document.ts';
import { focus } from '../focus.ts';
import {
  shownLanes,
  showLane,
  toggleAutomation,
  laneHeight,
  laneValueAt,
  laneText,
  pointPicks,
  pickedIndexes,
} from '../automation.ts';
import { automationMenu } from '../context-menus.ts';
import { useCanvas, rgba } from './canvas.ts';
import { px } from './arrange-view.ts';
import { palette } from '../theme.ts';

const HIT = 7; // px from a point that grabs it
const PAD = 5; // px kept clear at the lane's top and bottom, so points at the ends can be grabbed

/** a point being dragged: a new one (added on release) or the one at `index` */
interface PointDrag {
  track: string;
  lane: LaneId;
  index: number | null;
  beat: number;
  value: number;
  /** the other picked points' new places, by index, when several move together */
  others?: KeyframeMoves;
}

const pointDrag = signal<PointDrag | null>(null);

/** the box being drawn to pick points, in the lane's pixels */
interface Box {
  track: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const box = signal<Box | null>(null);

/** a group drag's places for every point it moves, the grabbed one included */
const groupMoves = (d: PointDrag): Map<number, { beat: number; value: number }> =>
  new Map([...(d.others ?? []), [d.index!, { beat: d.beat, value: d.value }]]);

interface AutomationRowProps {
  track: Track;
  beats: number;
  ppb: number;
}

/** the lane's points with the one being dragged in its new place */
function shownFrames(track: Track, lane: LaneId): Keyframe[] {
  const frames = track.automation[lane] ?? [];
  const d = pointDrag.value;
  if (!d || d.track !== track.id || d.lane !== lane) return frames;
  if (d.index === null)
    return [
      ...frames.filter((f) => f.beat !== d.beat),
      { beat: d.beat, value: d.value, curve: 'linear' as const },
    ].sort((a, b) => a.beat - b.beat);
  if (!d.others) return frames.map((f, i) => (i === d.index ? { ...f, beat: d.beat, value: d.value } : f));
  const moves = groupMoves(d);
  const moved = [...moves].flatMap(([i, to]) => (frames[i] ? [{ ...frames[i], ...to }] : []));
  const landed = new Set(moved.map((f) => f.beat));
  return [...frames.filter((f, i) => !moves.has(i) && !landed.has(f.beat)), ...moved].sort(
    (a, b) => a.beat - b.beat,
  );
}

/** the track's lane when it's shown, else nothing */
export function AutomationRow(props: AutomationRowProps) {
  const shown = shownLanes.value[props.track.id];
  if (!shown) return null;
  // a lane of an effect taken off the track shows Volume instead
  const lane = trackLanes(props.track).some((l) => l.id === shown) ? shown : 'volume';
  return <LaneRow {...props} lane={lane} />;
}

/** the lane itself: its own component, so its canvas exists from the moment it mounts */
function LaneRow({ track, beats, ppb, lane }: AutomationRowProps & { lane: LaneId }) {
  const [reading, setReading] = useState('');
  const ref = useCanvas((g, w, h) => {
    const param = laneParam(lane, track);
    const frames = shownFrames(track, lane);
    const t = palette.value;
    const y = (v: number) => PAD + (1 - laneHeight(param, v)) * (h - 2 * PAD);
    if (!frames.length) {
      g.strokeStyle = t.faint;
      g.setLineDash([4, 4]);
      g.beginPath();
      g.moveTo(0, y(param.rest(track)) + 0.5);
      g.lineTo(w, y(param.rest(track)) + 0.5);
      g.stroke();
      g.setLineDash([]);
      return;
    }
    // the line through the points, sampled so every curve (step, linear, exponential) draws the way it plays
    g.beginPath();
    g.moveTo(0, y(valueAt(frames, 0)));
    for (let x = 1; x <= w; x += 1) g.lineTo(x, y(valueAt(frames, x / ppb)));
    g.lineTo(w, h);
    g.lineTo(0, h);
    g.closePath();
    g.fillStyle = rgba(track.color, 0.14);
    g.fill();
    g.beginPath();
    g.moveTo(0, y(valueAt(frames, 0)));
    for (let x = 1; x <= w; x += 1) g.lineTo(x, y(valueAt(frames, x / ppb)));
    g.strokeStyle = rgba(track.color, 0.95);
    g.lineWidth = 1.5;
    g.stroke();
    const d = pointDrag.value;
    const lit = new Set(
      d?.track === track.id
        ? d.index === null
          ? [d.beat]
          : [...groupMoves(d).values()].map((m) => m.beat)
        : pickedIndexes(track, lane).map((i) => frames[i]?.beat),
    );
    for (const f of frames) {
      const dragged = lit.has(f.beat);
      g.beginPath();
      g.arc(f.beat * ppb, y(f.value), dragged ? 4.5 : 3.5, 0, Math.PI * 2);
      g.fillStyle = dragged ? t.text : t.panel;
      g.fill();
      g.strokeStyle = rgba(track.color, 1);
      g.lineWidth = 1.5;
      g.stroke();
    }
    const b = box.value;
    if (b?.track === track.id) {
      g.fillStyle = rgba(track.color, 0.12);
      g.strokeStyle = rgba(track.color, 0.8);
      g.lineWidth = 1;
      const x = Math.min(b.x0, b.x1),
        y = Math.min(b.y0, b.y1);
      g.fillRect(x, y, Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
      g.strokeRect(x + 0.5, y + 0.5, Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
    }
  });
  const param = laneParam(lane, track);
  const frames = track.automation[lane] ?? [];

  const place = (e: { clientX: number; clientY: number; currentTarget: Element }) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      beat: Math.max(0, (e.clientX - r.left) / ppb),
      value: laneValueAt(param, 1 - (e.clientY - r.top - PAD) / (r.height - 2 * PAD)),
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      h: r.height,
    };
  };
  /** the point under the cursor, by index */
  const pointAt = (x: number, y: number, h: number) =>
    frames.findIndex((f) => Math.hypot(f.beat * ppb - x, pointY(f, h) - y) <= HIT);
  const snapped = (beat: number, free: boolean) => (free ? beat : Math.max(0, Math.round(beat)));

  const pointY = (f: Keyframe, h: number) => PAD + (1 - laneHeight(param, f.value)) * (h - 2 * PAD);
  /** follows the pointer until it's let go */
  const follow = (move: (m: PointerEvent) => void, done: () => void) => {
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      done();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  };
  const picks = () => pickedIndexes(track, lane);
  const pick = (indexes: number[]) => {
    const beats = indexes.flatMap((i) => (frames[i] ? [frames[i].beat] : []));
    pointPicks.value = beats.length ? { track: track.id, lane, beats } : null;
  };

  /** Shift-drag on empty space: a box that picks the points in it, added to those picked */
  const drawBox = (target: HTMLDivElement, x: number, y: number) => {
    const had = picks();
    box.value = { track: track.id, x0: x, y0: y, x1: x, y1: y };
    follow(
      (m) => {
        const p = place({ clientX: m.clientX, clientY: m.clientY, currentTarget: target });
        if (box.value) box.value = { ...box.value, x1: p.x, y1: p.y };
      },
      () => {
        const b = box.value;
        box.value = null;
        if (!b) return;
        const h = target.getBoundingClientRect().height;
        const [x0, x1] = [Math.min(b.x0, b.x1), Math.max(b.x0, b.x1)];
        const [y0, y1] = [Math.min(b.y0, b.y1), Math.max(b.y0, b.y1)];
        const inside = frames.flatMap((f, i) => {
          const fx = f.beat * ppb,
            fy = pointY(f, h);
          return fx >= x0 && fx <= x1 && fy >= y0 && fy <= y1 ? [i] : [];
        });
        pick([...new Set([...had, ...inside])]);
      },
    );
  };

  const down = (e: TargetedPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    focus.value = 'arrange';
    selected.value = track.id;
    selectedClip.value = null;
    const at = place(e);
    const index = pointAt(at.x, at.y, at.h);
    const target = e.currentTarget;
    if (index < 0 && e.shiftKey) {
      drawBox(target, at.x, at.y);
      return;
    }
    if (index >= 0 && e.shiftKey) {
      const had = picks();
      pick(had.includes(index) ? had.filter((i) => i !== index) : [...had, index]);
      return;
    }
    if (index < 0) pointPicks.value = null;
    else if (!picks().includes(index)) pick([index]);
    const group = index >= 0 ? picks().filter((i) => i !== index) : [];
    const grabbed = index >= 0 ? frames[index]! : null;
    pointDrag.value = {
      track: track.id,
      lane,
      index: index < 0 ? null : index,
      beat: grabbed ? grabbed.beat : snapped(at.beat, e.shiftKey),
      value: grabbed ? grabbed.value : at.value,
    };
    const was = { ...pointDrag.value };
    // where the grab started, so a group moves by how far the pointer has gone, as heights so every scale moves alike
    const first = at;
    const earliest = Math.min(...[index, ...group].map((i) => frames[i]?.beat ?? 0));
    follow(
      (m) => {
        const d = pointDrag.value;
        if (!d) return;
        const p = place({ clientX: m.clientX, clientY: m.clientY, currentTarget: target });
        setReading(laneText(lane, p.value, track));
        if (!grabbed || !group.length) {
          pointDrag.value = { ...d, beat: snapped(p.beat, m.shiftKey), value: p.value };
          return;
        }
        // the grabbed point snaps, and the rest keep their distance from it; none goes before the start
        const beats = Math.max(
          -earliest,
          snapped(grabbed.beat + p.beat - first.beat, m.shiftKey) - grabbed.beat,
        );
        const rise = (first.y - p.y) / (p.h - 2 * PAD);
        const to = (f: Keyframe) => ({
          beat: f.beat + beats,
          value: laneValueAt(param, laneHeight(param, f.value) + rise),
        });
        const self = to(grabbed);
        pointDrag.value = {
          ...d,
          beat: self.beat,
          value: self.value,
          others: new Map(group.map((i) => [i, to(frames[i]!)])),
        };
      },
      () => {
        const d = pointDrag.value;
        pointDrag.value = null;
        if (!d) return;
        if (d.index === null) edit((p) => addKeyframe(p, track.id, lane, d.beat, d.value));
        else if (d.beat === was.beat && d.value === was.value) return;
        else if (d.others) {
          const moves = groupMoves(d);
          edit((p) => moveKeyframes(p, track.id, lane, moves));
          pointPicks.value = {
            track: track.id,
            lane,
            beats: [...moves.values()].map((m) => Math.max(0, m.beat)),
          };
        } else {
          edit((p) => moveKeyframe(p, track.id, lane, d.index!, d.beat, d.value));
          const now = project.value.tracks.find((t) => t.id === track.id)?.automation[lane]?.[d.index];
          pointPicks.value = now ? { track: track.id, lane, beats: [now.beat] } : null;
        }
      },
    );
  };
  const hover = (e: TargetedPointerEvent<HTMLDivElement>) => {
    if (pointDrag.value) return;
    const at = place(e);
    const i = pointAt(at.x, at.y, at.h);
    setReading(
      laneText(
        lane,
        i >= 0 ? frames[i]!.value : frames.length ? valueAt(frames, at.beat) : param.rest(track),
        track,
      ),
    );
  };
  const dbl = (e: TargetedMouseEvent<HTMLDivElement>) => {
    const at = place(e);
    const i = pointAt(at.x, at.y, at.h);
    if (i >= 0) edit((p) => removeKeyframe(p, track.id, lane, i));
  };
  const menu = (e: TargetedMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const at = place(e);
    const i = pointAt(at.x, at.y, at.h);
    automationMenu(track.id, lane, i < 0 ? null : i);
  };

  return (
    <div class="auto-row" data-id={track.id} style={{ '--track': rgba(track.color) }}>
      <div class="head">
        <select
          aria-label={`${track.name} automation`}
          value={lane}
          onChange={(e) => showLane(track.id, e.currentTarget.value as LaneId)}
        >
          {trackLanes(track).map((l) => (
            <option key={l.id} value={l.id}>
              {track.automation[l.id]?.length ? `${l.label} •` : l.label}
            </option>
          ))}
        </select>
        <span class="reading">{reading}</span>
        <button
          class="hide"
          title="Hide Automation (A)"
          aria-label="Hide automation"
          onClick={() => toggleAutomation(track.id)}
        >
          ×
        </button>
      </div>
      <div
        class="lane"
        style={{ width: px(beats * ppb) }}
        onPointerDown={down}
        onPointerMove={hover}
        onPointerLeave={() => setReading('')}
        onDblClick={dbl}
        onContextMenu={menu}
      >
        <canvas ref={ref} />
      </div>
    </div>
  );
}
