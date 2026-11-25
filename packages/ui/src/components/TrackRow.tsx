// A track's row in the arrangement: its header (colour, name, instrument, mute, solo and a volume knob) and its lane of
// clips. Click a header to select the track, double-click it to open the track's editor, double-click the name to
// rename it; drag headers to reorder the tracks; drop an instrument on a track to play it there, or a WAV, AIFF or MP3
// on its header to play that file across the keys (a sampler, PRD §14). Right-click a header
// for more (Delete Track among them). Show Automation (A) opens the track's automation lane under its row. An audio
// track's lane is AudioLane.tsx.
//
// Clips: drag to move (to another track too), Alt-drag to copy, drag the right edge to resize, double-click empty
// space for a new clip; they snap to bars, or to beats with Shift. Drop audio files on a lane to read them as notes.
import { useState } from 'preact/hooks';
import type { TargetedDragEvent, TargetedMouseEvent, TargetedPointerEvent } from 'preact';
import { signal } from '@preact/signals';
import { barAt } from '@chordinal/daw';
import { updateClip, moveClip, newId, findPattern, isAudioTrack } from '@chordinal/daw';
import type { Clip, Track } from '@chordinal/daw';
import { project, selected, selectedClip, beat, settings, setSettings, notify } from '../store.ts';
import { pointPicks } from '../automation.ts';
import { edit } from '../document.ts';
import { recording, takeNotes, dropAudio, dropTake } from '../recording.ts';
import { monitored, toggleMonitor } from '../audio-recording.ts';
import { loadSample } from '../sample-edit.ts';
import { SAMPLE_FILE } from '@chordinal/audio';
import { isMidi, dropMidi } from '../midi-import.ts';
import { focus } from '../focus.ts';
import { instrumentName, renameTrack, toggleMute, toggleSolo, newClipAt, moveTrackTo } from '../tracks.ts';
import { clipMenu, laneMenu, trackContextMenu } from '../context-menus.ts';
import { useCanvas, rgba } from './canvas.ts';
import { px, snapTo } from './arrange-view.ts';
import { Knob } from './Knob.tsx';
import { AutomationRow } from './AutomationRow.tsx';
import { AudioLane } from './AudioLane.tsx';
import { palette, alpha } from '../theme.ts';
import { PRESET, TRACK, carries, readPreset } from './drag-data.ts';
import type { DroppedPreset } from './drag-data.ts';
import { editorOf } from '../steps.ts';

export { PRESET, TRACK, carries } from './drag-data.ts';

const EDGE = 6; // px at a clip's right edge that resize it

/** a clip being dragged: moved (to the track `to`, copied with Alt) or resized */
interface ClipDrag {
  track: string;
  clip: string;
  source: Clip;
  mode: 'move' | 'resize';
  start: number;
  beats: number;
  to: string;
  copy: boolean;
}

const drag = signal<ClipDrag | null>(null);

/** a track, and the arrangement's length (beats) and scale (px per beat) */
interface LaneProps {
  track: Track;
  beats: number;
  ppb: number;
}

/** a track's lane: its clips, with their notes drawn small inside, and the take being recorded */
function Lane({ track, beats, ppb }: LaneProps) {
  const ref = useCanvas((g, _w, h) => {
    const all = track.clips.flatMap((c) => c.notes);
    const rec = recording.value?.track === track.id ? recording.value : null;
    const recNotes = rec ? takeNotes.value : [];
    const keys = [...all, ...recNotes].map((n) => n.key);
    const lo = keys.length ? Math.min(...keys) - 1 : 59,
      hi = keys.length ? Math.max(...keys) + 1 : 61;
    const top = 16,
      inner = h - top - 5,
      noteH = Math.max(1.5, Math.min(4, inner / (hi - lo + 1)));
    const y = (k: number) => top + ((hi - k) / Math.max(1, hi - lo)) * (inner - noteH);
    const d = drag.value,
      sel = selectedClip.value,
      t = palette.value;
    g.font = '11px -apple-system, system-ui, sans-serif';
    g.textBaseline = 'middle';
    const draw = (c: Clip, start: number, len: number, ghost: boolean) => {
      const a = start * ppb + 1,
        b = (start + len) * ppb - 1;
      const on = sel?.track === track.id && sel.clip === c.id;
      g.globalAlpha = ghost ? 0.5 : c.mute ? 0.35 : 1;
      g.fillStyle = rgba(track.color, on ? 0.32 : 0.2);
      g.beginPath();
      g.roundRect(a, 2, b - a, h - 4, 5);
      g.fill();
      g.save();
      g.beginPath();
      g.roundRect(a, 2, b - a, h - 4, 5);
      g.clip();
      g.fillStyle = rgba(track.color, on ? 0.95 : 0.75);
      g.fillRect(a, 2, b - a, 12);
      g.restore();
      g.strokeStyle = on ? t.text : rgba(track.color, 0.55);
      g.lineWidth = on ? 1.5 : 1;
      g.beginPath();
      g.roundRect(a + 0.5, 2.5, b - a - 1, h - 5, 5);
      g.stroke();
      // PRD §3.10: a pattern clip shows its pattern's name and a link mark
      const pattern = c.pattern && findPattern(project.value, c.pattern);
      if (pattern && b - a > 24) {
        g.save();
        g.beginPath();
        g.rect(a, 0, b - a - 4, h);
        g.clip();
        g.fillStyle = t['clip-text'];
        g.textAlign = 'left';
        g.fillText(`⧉ ${pattern.name}`, a + 4, 8);
        g.restore();
      }
      g.fillStyle = rgba(track.color, 0.95);
      g.save();
      g.beginPath();
      g.rect(a, 0, b - a, h);
      g.clip();
      for (const n of c.notes)
        if (n.beat < len) g.fillRect((start + n.beat) * ppb, y(n.key), Math.max(1, n.beats * ppb - 1), noteH);
      g.restore();
      g.globalAlpha = 1;
    };
    for (const c of track.clips) {
      const moving = d && d.track === track.id && d.clip === c.id;
      if (moving && d.mode === 'move' && !d.copy) continue;
      draw(c, c.start, moving && d.mode === 'resize' ? d.beats : c.beats, false);
    }
    if (d?.mode === 'move' && d.to === track.id) draw(d.source, d.start, d.source.beats, true);
    if (rec) {
      const now = Math.max(rec.start, beat.value);
      g.fillStyle = alpha(t.rec, 0.18);
      g.fillRect(rec.start * ppb, 2, (now - rec.start) * ppb, h - 4);
      g.fillStyle = alpha(t.rec, 0.9);
      for (const n of recNotes) g.fillRect(n.beat * ppb, y(n.key), Math.max(1, n.beats * ppb - 1), noteH);
    }
  });

  const beatAt = (e: { clientX: number; currentTarget: Element }) =>
    (e.clientX - e.currentTarget.getBoundingClientRect().left) / ppb;
  const clipAt = (b: number) => track.clips.findLast((c) => b >= c.start && b < c.start + c.beats);

  const down = (e: TargetedPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    focus.value = 'arrange';
    selected.value = track.id;
    pointPicks.value = null;
    const b = beatAt(e),
      c = clipAt(b);
    if (!c) {
      selectedClip.value = null;
      return;
    }
    selectedClip.value = { track: track.id, clip: c.id };
    const x0 = e.clientX;
    const mode = (c.start + c.beats - b) * ppb <= EDGE ? 'resize' : 'move';
    const grab = b - c.start;
    drag.value = {
      track: track.id,
      clip: c.id,
      source: c,
      mode,
      start: c.start,
      beats: c.beats,
      to: track.id,
      copy: e.altKey,
    };
    const move = (m: PointerEvent) => {
      const now = drag.value;
      if (!now) return;
      const at = b + (m.clientX - x0) / ppb;
      if (mode === 'resize') {
        const end = snapTo(at, m);
        drag.value = {
          ...now,
          beats: Math.max(m.shiftKey ? 1 : barAt(project.value.meters, c.start).beatsPerBar, end - c.start),
        };
        return;
      }
      const row = document.elementFromPoint(m.clientX, m.clientY)?.closest<HTMLElement>('.track[data-id]');
      drag.value = { ...now, start: snapTo(at - grab, m), to: row?.dataset.id ?? now.to, copy: m.altKey };
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      const d = drag.value;
      drag.value = null;
      if (!d) return;
      if (d.mode === 'resize') {
        if (d.beats !== c.beats) edit((p) => updateClip(p, track.id, c.id, { beats: d.beats }));
        return;
      }
      if (d.start === c.start && d.to === track.id) return;
      let id = c.id;
      edit((p) => {
        if (d.copy) id = newId(p, 'c');
        return moveClip(p, track.id, c.id, d.to, d.start, d.copy);
      });
      selected.value = d.to;
      selectedClip.value = { track: d.to, clip: id };
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  };

  const dblclick = (e: TargetedMouseEvent<HTMLDivElement>) => {
    const b = beatAt(e),
      c = clipAt(b);
    if (c) setSettings({ editorTab: editorOf(track) });
    else newClipAt(track.id, b);
  };

  const menu = (e: TargetedMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const b = beatAt(e),
      c = clipAt(b);
    if (c) clipMenu(track.id, c.id, b);
    else laneMenu(track.id, b);
  };

  const hover = (e: TargetedPointerEvent<HTMLDivElement>) => {
    const b = beatAt(e),
      c = clipAt(b);
    e.currentTarget.style.cursor = c && (c.start + c.beats - b) * ppb <= EDGE ? 'ew-resize' : c ? 'grab' : '';
  };

  const [dropping, setDropping] = useState(false);
  const isFiles = (e: DragEvent) =>
    e.dataTransfer?.types.includes('Files') || e.dataTransfer?.types.includes('application/x-take');
  const dropped = (e: TargetedDragEvent<HTMLDivElement>) => {
    setDropping(false);
    const dt = e.dataTransfer;
    if (!isFiles(e) || !dt) return;
    e.preventDefault();
    const take = dt.getData('application/x-take');
    const files = [...dt.files],
      midi = files.filter(isMidi),
      audio = files.filter((f) => !isMidi(f));
    if (take) void dropTake(track.id, take, beatAt(e));
    if (midi.length) void dropMidi(midi, beatAt(e));
    if (audio.length) void dropAudio(track.id, audio, beatAt(e));
  };
  return (
    <div
      class={`lane ${dropping ? 'drop' : ''}`}
      style={{ width: px(beats * ppb) }}
      onPointerDown={down}
      onDblClick={dblclick}
      onPointerMove={hover}
      onContextMenu={menu}
      onDragOver={(e) => {
        if (isFiles(e)) {
          e.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={dropped}
    >
      <canvas ref={ref} />
    </div>
  );
}

export interface TrackRowProps {
  track: Track;
  /** the track's place in the project */
  index: number;
  beats: number;
  ppb: number;
  /** what a double-click does: the app's own */
  onOpen: (id: string) => void;
  /** what a dropped instrument does: the app's own */
  onInstrument: (id: string, preset: DroppedPreset) => void;
}

export function TrackRow({ track, index, beats, ppb, onOpen, onInstrument }: TrackRowProps) {
  const [drop, setDrop] = useState(false);
  const [dragging, setDragging] = useState(false);
  void settings.value.library;
  const m = track.mixer;
  const over = (e: DragEvent) => {
    if (carries(e, PRESET) || carries(e, TRACK)) {
      e.preventDefault();
      setDrop(true);
    }
  };
  const dropped = (e: DragEvent) => {
    setDrop(false);
    if (carries(e, PRESET)) {
      e.preventDefault();
      const preset = readPreset(e.dataTransfer?.getData(PRESET) ?? '');
      if (preset) onInstrument(track.id, preset);
    } else if (carries(e, TRACK)) {
      e.preventDefault();
      moveTrackTo(e.dataTransfer?.getData(TRACK) ?? '', index);
    }
  };
  // an audio file dropped on the header: the track plays it as a sampler (on the lane, it's read as notes)
  const overHead = (e: DragEvent) => {
    if (carries(e, 'Files')) {
      e.preventDefault();
      setDrop(true);
    }
  };
  const droppedOnHead = (e: DragEvent) => {
    if (!carries(e, 'Files')) return;
    e.preventDefault();
    e.stopPropagation();
    setDrop(false);
    if (isAudioTrack(track)) {
      notify(`${track.name} is an audio track: drop the file on its lane to put it there as a clip`, 'error');
      return;
    }
    const file = [...(e.dataTransfer?.files ?? [])].find((f) => SAMPLE_FILE.test(f.name));
    if (file) void loadSample(track.id, file);
    else notify('Drop a WAV, AIFF or MP3 file on a track header to play it there', 'error');
  };
  return (
    <>
      <div
        class={`track ${selected.value === track.id ? 'on' : ''} ${drop ? 'drop' : ''} ${dragging ? 'dragging' : ''}`}
        data-id={track.id}
        style={{ '--track': rgba(track.color) }}
        onDragOver={over}
        onDragLeave={() => setDrop(false)}
        onDrop={dropped}
      >
        <div
          class="head"
          role="group"
          aria-label={`${track.name} track`}
          draggable
          onDragStart={(e) => {
            e.dataTransfer?.setData(TRACK, track.id);
            setDragging(true);
          }}
          onDragEnd={() => setDragging(false)}
          onDragOver={overHead}
          onDrop={droppedOnHead}
          onClick={() => {
            selected.value = track.id;
          }}
          onDblClick={() => onOpen(track.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            trackContextMenu(track.id);
          }}
        >
          <span
            class="name"
            onDblClick={(e) => {
              e.stopPropagation();
              void renameTrack(track.id);
            }}
            title="Double-click to rename"
          >
            {track.name}
          </span>
          <span class="inst">{isAudioTrack(track) ? 'Audio' : instrumentName(track.instrument)}</span>
          <div class="ms" onClick={(e) => e.stopPropagation()} onDblClick={(e) => e.stopPropagation()}>
            <button class={`mute ${m.mute ? 'on' : ''}`} title="Mute" onClick={() => toggleMute(track.id)}>
              M
            </button>
            <button class={`solo ${m.solo ? 'on' : ''}`} title="Solo" onClick={() => toggleSolo(track.id)}>
              S
            </button>
            {isAudioTrack(track) && (
              <button
                class={`monitor ${monitored.value === track.id ? 'on' : ''}`}
                title="Monitor: hear the microphone through this track"
                aria-label="Monitor"
                aria-pressed={monitored.value === track.id}
                onClick={() => void toggleMonitor(track.id)}
              >
                I
              </button>
            )}
          </div>
          <Knob track={track} />
        </div>
        {isAudioTrack(track) ? (
          <AudioLane track={track} beats={beats} ppb={ppb} />
        ) : (
          <Lane track={track} beats={beats} ppb={ppb} />
        )}
      </div>
      <AutomationRow track={track} beats={beats} ppb={ppb} />
    </>
  );
}
