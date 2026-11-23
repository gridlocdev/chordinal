// A track's automation lane, under its row in the arrangement: the value it shows drawn as a line through its points.
// Click empty space to add a point and drag it into place, drag a point to move it, double-click one to delete it, and
// right-click for its curve and the lane's other values. Points snap to the beat; hold Shift to place them freely.
import { useState } from 'preact/hooks';
import type { TargetedMouseEvent, TargetedPointerEvent } from 'preact';
import { signal } from '@preact/signals';
import { LANE_PARAMS, laneParam, valueAt, addKeyframe, moveKeyframe, removeKeyframe } from '@chordinal/daw';
import type { Keyframe, LaneId, Track } from '@chordinal/daw';
import { selected } from '../store.ts';
import { edit } from '../document.ts';
import { focus } from '../focus.ts';
import { shownLanes, showLane, toggleAutomation, laneHeight, laneValueAt, laneText } from '../automation.ts';
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
}

const pointDrag = signal<PointDrag | null>(null);

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
  return frames.map((f, i) => (i === d.index ? { ...f, beat: d.beat, value: d.value } : f));
}

/** the track's lane when it's shown, else nothing */
export function AutomationRow(props: AutomationRowProps) {
  const lane = shownLanes.value[props.track.id];
  return lane ? <LaneRow {...props} lane={lane} /> : null;
}

/** the lane itself: its own component, so its canvas exists from the moment it mounts */
function LaneRow({ track, beats, ppb, lane }: AutomationRowProps & { lane: LaneId }) {
  const [reading, setReading] = useState('');
  const ref = useCanvas((g, w, h) => {
    const param = laneParam(lane);
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
    for (const [i, f] of frames.entries()) {
      const dragged = d?.track === track.id && (d.index === null ? f.beat === d.beat : d.index === i);
      g.beginPath();
      g.arc(f.beat * ppb, y(f.value), dragged ? 4.5 : 3.5, 0, Math.PI * 2);
      g.fillStyle = dragged ? t.text : t.panel;
      g.fill();
      g.strokeStyle = rgba(track.color, 1);
      g.lineWidth = 1.5;
      g.stroke();
    }
  });
  const param = laneParam(lane);
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
    frames.findIndex(
      (f) => Math.hypot(f.beat * ppb - x, PAD + (1 - laneHeight(param, f.value)) * (h - 2 * PAD) - y) <= HIT,
    );
  const snapped = (beat: number, free: boolean) => (free ? beat : Math.max(0, Math.round(beat)));

  const down = (e: TargetedPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    focus.value = 'arrange';
    selected.value = track.id;
    const at = place(e);
    const index = pointAt(at.x, at.y, at.h);
    const target = e.currentTarget;
    pointDrag.value = {
      track: track.id,
      lane,
      index: index < 0 ? null : index,
      beat: index < 0 ? snapped(at.beat, e.shiftKey) : frames[index]!.beat,
      value: index < 0 ? at.value : frames[index]!.value,
    };
    const was = { ...pointDrag.value };
    const move = (m: PointerEvent) => {
      const d = pointDrag.value;
      if (!d) return;
      const p = place({ clientX: m.clientX, clientY: m.clientY, currentTarget: target });
      pointDrag.value = { ...d, beat: snapped(p.beat, m.shiftKey), value: p.value };
      setReading(laneText(lane, p.value));
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      const d = pointDrag.value;
      pointDrag.value = null;
      if (!d) return;
      if (d.index === null) edit((p) => addKeyframe(p, track.id, lane, d.beat, d.value));
      else if (d.beat !== was.beat || d.value !== was.value)
        edit((p) => moveKeyframe(p, track.id, lane, d.index!, d.beat, d.value));
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  };
  const hover = (e: TargetedPointerEvent<HTMLDivElement>) => {
    if (pointDrag.value) return;
    const at = place(e);
    const i = pointAt(at.x, at.y, at.h);
    setReading(
      laneText(
        lane,
        i >= 0 ? frames[i]!.value : frames.length ? valueAt(frames, at.beat) : param.rest(track),
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
          {LANE_PARAMS.map((l) => (
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
