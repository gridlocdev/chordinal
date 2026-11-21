import { useEffect, useRef } from 'preact/hooks';
import { beat, playing, settings } from '../store.ts';
import { recording } from '../recording.ts';
import { GUTTER, view } from './roll-view.ts';

/** the playhead over the roll, apart from the canvas so a frame of playback doesn't redraw the notes; while playing
 * or recording (and following), the view turns the page when it reaches an edge, and when a take ends it shows where
 * the playhead went back to */
export function RollPlayhead() {
  const ref = useRef<HTMLDivElement>(null);
  const now = beat.value,
    { from, ppb } = view.value;
  const w = ref.current?.parentElement?.clientWidth ?? 0;
  const taking = !!recording.value;
  const took = useRef(taking);
  useEffect(() => {
    const ended = took.current && !taking;
    took.current = taking;
    if (!w || !(ended || (settings.value.follow && (playing.value || taking)))) return;
    if (now < from || now > from + (w - GUTTER) / ppb) view.value = { ...view.value, from: now };
  }, [now, w, taking]);
  const x = GUTTER + (now - from) * ppb;
  return (
    <div
      ref={ref}
      class="playhead"
      style={{ left: `${x}px`, display: x < GUTTER || (w && x > w) ? 'none' : '' }}
    />
  );
}
