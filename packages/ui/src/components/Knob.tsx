// A track's volume knob: drag up or down, double-click for 0 dB. A drag is one undo step.
import type { TargetedPointerEvent } from 'preact';
import { setMixer } from '@chordinal/daw';
import type { Track } from '@chordinal/daw';
import { FADER_FLOOR_DB } from '../store.ts';
import { edit } from '../document.ts';

const DB = [FADER_FLOOR_DB, 6] as const;
const DB_PER_PX = 0.25;
const SWEEP = 270; // degrees from the knob's lowest to its highest

export interface KnobProps {
  track: Track;
}

export function Knob({ track }: KnobProps) {
  const v = track.mixer.volumeDb;
  const set = (db: number) =>
    edit((p) => setMixer(p, track.id, { volumeDb: db }), `mix:${track.id}:volumeDb`);
  const down = (e: TargetedPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const y0 = e.clientY,
      start = v;
    const move = (m: PointerEvent) =>
      set(Math.round(Math.max(DB[0], Math.min(DB[1], start - (m.clientY - y0) * DB_PER_PX)) * 2) / 2);
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  };
  const turn = -SWEEP / 2 + (SWEEP * (v - DB[0])) / (DB[1] - DB[0]);
  return (
    <div
      class="knob"
      role="slider"
      aria-label={`${track.name} volume`}
      aria-valuenow={v}
      aria-valuemin={DB[0]}
      aria-valuemax={DB[1]}
      title={`Volume ${v > 0 ? '+' : ''}${v.toFixed(1)} dB (double-click for 0 dB)`}
      draggable={false}
      onPointerDown={down}
      onClick={(e) => e.stopPropagation()}
      onDblClick={(e) => {
        e.stopPropagation();
        set(0);
      }}
    >
      <div class="mark" style={{ transform: `rotate(${turn}deg)` }} />
    </div>
  );
}
