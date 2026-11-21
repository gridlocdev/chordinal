// The arrangement: a ruler of bars and markers, the chord track, then a row per track, and below them + Track and
// + Drums and a place to drop an instrument (or a track's header, to move it last). Cmd/Ctrl + wheel zooms. While
// playing, the view scrolls to keep the playhead in sight (Follow Playhead).
import { useEffect, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import { project, chordRange, beat, playing, settings } from '../store.ts';
import { arrangeZoom as zoom, arrangePpb, moveTrackTo } from '../tracks.ts';
import { HEAD_W, ZOOM, width, px, span, fitted } from './arrange-view.ts';
import { Ruler } from './Ruler.tsx';
import { ChordLane } from './ChordLane.tsx';
import { TrackRow } from './TrackRow.tsx';
import { PRESET, TRACK, carries, readPreset } from './drag-data.ts';
import type { DroppedPreset } from './drag-data.ts';

// The parts that move with the playhead read `beat` in components of their own, so a frame of playback re-renders
// them and not the lanes.

/** the marker the playhead is in */
function MarkerName() {
  const now = beat.value;
  return <>{project.value.markers.findLast((m) => m.beat <= now + 1e-9)?.name ?? ''}</>;
}

interface PlayheadProps {
  ppb: number;
  scroller: RefObject<HTMLDivElement | null>;
}

/** the playhead; while playing, one that runs off the right (or is left of the view) brings the view along a page */
function Playhead({ ppb, scroller }: PlayheadProps) {
  const now = beat.value;
  useEffect(() => {
    const el = scroller.current;
    if (!el || !playing.value || !settings.value.follow) return;
    const x = now * ppb,
      view = el.clientWidth - HEAD_W;
    if (x > el.scrollLeft + view - 20 || x < el.scrollLeft) el.scrollLeft = Math.max(0, x - 20);
  }, [now, ppb]);
  return <div class="playhead" style={{ left: px(HEAD_W + now * ppb) }} />;
}

/** what the app does when a track is opened, an instrument dropped (on a track, or below them: null) and a track added */
export interface ArrangeActions {
  open: (id: string) => void;
  instrument: (id: string | null, preset: DroppedPreset) => void;
  addTrack: () => void;
  addDrums: () => void;
}

/** below the tracks: add one, or drop an instrument for a new track with it, or a header to move that track last */
function AddTrack({ actions }: { actions: ArrangeActions }) {
  const [drop, setDrop] = useState(false);
  const tracks = project.value.tracks;
  return (
    <div
      class={`add-track ${drop ? 'drop' : ''}`}
      onDragOver={(e) => {
        if (carries(e, PRESET) || carries(e, TRACK)) {
          e.preventDefault();
          setDrop(true);
        }
      }}
      onDragLeave={() => setDrop(false)}
      onDrop={(e) => {
        setDrop(false);
        if (carries(e, PRESET)) {
          e.preventDefault();
          const preset = readPreset(e.dataTransfer?.getData(PRESET) ?? '');
          if (preset) actions.instrument(null, preset);
        } else if (carries(e, TRACK)) {
          e.preventDefault();
          moveTrackTo(e.dataTransfer?.getData(TRACK) ?? '', tracks.length - 1);
        }
      }}
    >
      <div class="buttons">
        <button onClick={actions.addTrack} title="Add an instrument track (⌥⌘N)">
          + Track
        </button>
        <button onClick={actions.addDrums} title="Add a drum track with the Standard kit">
          + Drums
        </button>
      </div>
      <div class="hint">
        {tracks.length
          ? 'Drop an instrument here for a new track'
          : 'No tracks yet: add one, or drop an instrument here'}
      </div>
    </div>
  );
}

export interface ArrangeProps {
  actions: ArrangeActions;
}

export function Arrange({ actions }: ArrangeProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const p = project.value;
  const beats = span();
  // a new project is fitted to the window, and stays fitted as the window resizes until zoomed
  const first = p.tracks[0]?.id;
  useEffect(() => {
    zoom.value = 0;
    if (scroller.current) scroller.current.scrollLeft = 0;
  }, [p.title, first]);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      width.value = el.clientWidth - HEAD_W - 12;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // Cmd/Ctrl + wheel zooms around the pointer
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left - HEAD_W + el.scrollLeft;
      const was = fitted(),
        at = x / was;
      zoom.value = Math.max(ZOOM[0], Math.min(ZOOM[1], was * Math.exp(-e.deltaY * 0.004)));
      el.scrollLeft = at * zoom.value - (e.clientX - r.left - HEAD_W);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  const ppb = fitted();
  useEffect(() => {
    arrangePpb.value = ppb;
  }, [ppb]);
  const range = chordRange.value;
  return (
    <div class="arrange">
      <div class="scroll" ref={scroller}>
        <div class="rows" style={{ width: px(HEAD_W + beats * ppb) }}>
          <div class="ruler">
            <div class="head">
              <MarkerName />
            </div>
            <Ruler beats={beats} ppb={ppb} />
          </div>
          <div class="track chords">
            <div
              class="head"
              title="Drag across the chord track to pick a stretch, then press ● and whistle the chord"
            >
              <span class="name">Chords</span>
              <span class="inst">{range ? 'Press ● and whistle the chord' : 'Drag to pick a stretch'}</span>
            </div>
            <ChordLane beats={beats} ppb={ppb} />
          </div>
          {p.tracks.map((t, i) => (
            <TrackRow
              key={t.id}
              track={t}
              index={i}
              beats={beats}
              ppb={ppb}
              onOpen={actions.open}
              onInstrument={actions.instrument}
            />
          ))}
          <AddTrack actions={actions} />
          <Playhead ppb={ppb} scroller={scroller} />
        </div>
      </div>
    </div>
  );
}
