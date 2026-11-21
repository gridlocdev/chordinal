// The chord track: the project's chords, and a stretch dragged out to record a chord for.
import type { TargetedMouseEvent, TargetedPointerEvent } from 'preact';
import { barAt } from '@chordinal/daw';
import { project, chordRange } from '../store.ts';
import { focus } from '../focus.ts';
import { chordMenu } from '../context-menus.ts';
import { useCanvas } from './canvas.ts';
import { palette, alpha } from '../theme.ts';
import { px, snapTo } from './arrange-view.ts';

/** the lane's length in beats and its scale in px per beat */
export interface LaneProps {
  beats: number;
  ppb: number;
}

export function ChordLane({ beats, ppb }: LaneProps) {
  const p = project.value;
  const ref = useCanvas((g, _w, h) => {
    const t = palette.value;
    g.font = '500 11px -apple-system, system-ui, sans-serif';
    g.textBaseline = 'middle';
    for (const c of p.chords) {
      const a = c.beat * ppb,
        b = (c.beat + c.beats) * ppb;
      g.fillStyle = c.symbol ? alpha(t.select, 0.2) : t['grid-key'];
      g.beginPath();
      g.roundRect(a + 1, 4, b - a - 2, h - 8, 4);
      g.fill();
      if (b - a > 22) {
        g.fillStyle = t.text;
        g.fillText(c.name, a + 6, h / 2);
      }
    }
    const r = chordRange.value;
    if (r) {
      g.fillStyle = alpha(t.select, 0.16);
      g.fillRect(r.beat * ppb, 0, r.beats * ppb, h);
      g.fillStyle = alpha(t.select, 0.8);
      g.fillRect(r.beat * ppb, 0, 1, h);
      g.fillRect((r.beat + r.beats) * ppb - 1, 0, 1, h);
    }
  });
  const down = (e: TargetedPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    focus.value = 'chords';
    const r = e.currentTarget.getBoundingClientRect();
    const at = (x: number) => (x - r.left) / ppb;
    const from = at(e.clientX);
    const pick = (m: PointerEvent) => {
      const a = snapTo(Math.min(from, at(m.clientX)), m),
        b = snapTo(Math.max(from, at(m.clientX)), m);
      const bar = barAt(project.value.meters, a);
      chordRange.value = { beat: a, beats: Math.max(b - a, m.shiftKey ? 1 : bar.beatsPerBar) };
    };
    pick(e);
    const up = () => {
      removeEventListener('pointermove', pick);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
    };
    addEventListener('pointermove', pick);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  };
  const menu = (e: TargetedMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    chordMenu((e.clientX - e.currentTarget.getBoundingClientRect().left) / ppb);
  };
  return (
    <div class="lane" style={{ width: px(beats * ppb) }} onPointerDown={down} onContextMenu={menu}>
      <canvas ref={ref} />
    </div>
  );
}
