// An audio track's lane (Chordinal PRD §16): its clips, each with its file's name, its waveform and its fades. Drop
// WAV, AIFF or MP3 files on it to put them there as clips, from the beat they're dropped on (Shift: where they are,
// unsnapped). Drag a clip to move it (to another audio track too; Alt copies it), drag its left or right edge to trim
// it, and drag the small squares at its top corners to set its fades. Right-click a clip for its menu, gain included.
import { signal } from '@preact/signals';
import { useState } from 'preact/hooks';
import type { TargetedDragEvent, TargetedMouseEvent, TargetedPointerEvent } from 'preact';
import {
  audioClipAt,
  audioClipEnd,
  audioClipsOf,
  isAudioTrack,
  moveAudioClip,
  newId,
  trimAudioClip,
  updateAudioClip,
} from '@chordinal/daw';
import type { AudioClip, Project, Track } from '@chordinal/daw';
import { beatToSeconds, secondsToBeat, waveformPeaks } from '@chordinal/lib';
import { project, selected, selectedAudio } from '../store.ts';
import { pointPicks } from '../automation.ts';
import { focus } from '../focus.ts';
import { edit } from '../document.ts';
import { dropAudioClips, dropBeat } from '../audio-tracks.ts';
import { audioFiles, audioRead } from '../audio-files.ts';
import { audioClipMenu, audioLaneMenu } from '../context-menus.ts';
import { useCanvas, rgba } from './canvas.ts';
import { px } from './arrange-view.ts';
import { palette } from '../theme.ts';

const EDGE = 6; // px at a clip's left and right edges that trim it
const HANDLE = 6; // px either side of a fade's square that grab it
const HEAD = 14; // px of a clip's name strip, where its fade squares are

/** what a press on a clip drags */
type Grab = 'move' | 'start' | 'end' | 'fadeIn' | 'fadeOut';

/** a clip being dragged, and the project as the drag would leave it, which every audio lane draws */
interface AudioDrag {
  to: string;
  clip: string;
  result: Project;
}
const audioDrag = signal<AudioDrag | null>(null);

const OVERVIEW = 256; // frames per peak in a file's overview, which a clip's waveform is drawn from

const overviews = new WeakMap<AudioBuffer, Float32Array>();
/** a file's peaks, one per OVERVIEW frames, worked out once */
function overview(buffer: AudioBuffer): Float32Array {
  let o = overviews.get(buffer);
  if (!o) {
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    o = waveformPeaks(channels, 0, buffer.length, Math.ceil(buffer.length / OVERVIEW));
    overviews.set(buffer, o);
  }
  return o;
}

interface AudioLaneProps {
  track: Track;
  beats: number;
  ppb: number;
}

/** where a clip's fades end and start, in beats */
function fadeBeats(p: Project, c: AudioClip): { inEnd: number; outStart: number } {
  const at = beatToSeconds(p.tempoMap, c.start);
  return {
    inEnd: secondsToBeat(p.tempoMap, at + c.fadeIn),
    outStart: secondsToBeat(p.tempoMap, at + c.seconds - c.fadeOut),
  };
}

export function AudioLane({ track, beats, ppb }: AudioLaneProps) {
  const ref = useCanvas((g, _w, h) => {
    void audioRead.value;
    const p = audioDrag.value?.result ?? project.value,
      shown = p.tracks.find((x) => x.id === track.id) ?? track;
    const map = p.tempoMap,
      t = palette.value,
      sel = selectedAudio.value,
      dragged = audioDrag.value?.clip;
    g.font = '11px -apple-system, system-ui, sans-serif';
    g.textBaseline = 'middle';
    for (const c of audioClipsOf(shown)) {
      const a = c.start * ppb + 1,
        b = audioClipEnd(map, c) * ppb - 1;
      if (b <= a) continue;
      const on = (sel?.track === track.id && sel.clip === c.id) || dragged === c.id;
      g.globalAlpha = c.mute ? 0.35 : 1;
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
      g.fillStyle = t['clip-text'];
      g.textAlign = 'left';
      g.fillText(c.file, a + 4, 8);
      const buffer = audioFiles.decoded(c.file);
      if (buffer === undefined) void audioFiles.read(c.file).then(() => audioRead.value++);
      if (buffer) {
        const o = overview(buffer),
          rate = buffer.sampleRate / OVERVIEW;
        const columns = Math.max(1, Math.round(b - a));
        const peaks = waveformPeaks([o], c.offset * rate, (c.offset + c.seconds) * rate, columns);
        const mid = 16 + (h - 20) / 2,
          half = (h - 22) / 2;
        g.fillStyle = rgba(track.color, 0.95);
        peaks.forEach((v, i) => {
          const y = Math.max(0.5, v * c.gain * half);
          g.fillRect(a + i, mid - y, 1, 2 * y);
        });
      }
      // the fades: a line from silence at the clip's edge to full where the fade ends, and its square
      const f = fadeBeats(p, c),
        x1 = f.inEnd * ppb,
        x2 = f.outStart * ppb;
      g.strokeStyle = t.text;
      g.lineWidth = 1;
      g.beginPath();
      if (c.fadeIn > 0) {
        g.moveTo(a, h - 2);
        g.lineTo(x1, HEAD + 2);
      }
      if (c.fadeOut > 0) {
        g.moveTo(x2, HEAD + 2);
        g.lineTo(b, h - 2);
      }
      g.stroke();
      g.restore();
      g.strokeStyle = on ? t.text : rgba(track.color, 0.55);
      g.lineWidth = on ? 1.5 : 1;
      g.beginPath();
      g.roundRect(a + 0.5, 2.5, b - a - 1, h - 5, 5);
      g.stroke();
      if (on) {
        g.fillStyle = t.text;
        g.fillRect(Math.max(a, x1 - 3), 3, 6, 6);
        g.fillRect(Math.min(b - 6, x2 - 3), 3, 6, 6);
      }
      g.globalAlpha = 1;
    }
  });

  const beatAt = (e: { clientX: number; currentTarget: Element }) =>
    (e.clientX - e.currentTarget.getBoundingClientRect().left) / ppb;
  const yAt = (e: { clientY: number; currentTarget: Element }) =>
    e.clientY - e.currentTarget.getBoundingClientRect().top;

  /** what a press at (beat b, y px) on clip c drags: a fade's square in the name strip, an edge, or the clip */
  const grabOf = (c: AudioClip, b: number, y: number): Grab => {
    const p = project.value,
      x = b * ppb,
      a = c.start * ppb,
      z = audioClipEnd(p.tempoMap, c) * ppb,
      f = fadeBeats(p, c);
    if (y <= HEAD + 2) {
      if (Math.abs(x - f.outStart * ppb) <= HANDLE && z - x <= (z - a) / 2 + HANDLE) return 'fadeOut';
      if (Math.abs(x - f.inEnd * ppb) <= HANDLE) return 'fadeIn';
    }
    if (x - a <= EDGE) return 'start';
    if (z - x <= EDGE) return 'end';
    return 'move';
  };

  const down = (e: TargetedPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    focus.value = 'arrange';
    selected.value = track.id;
    pointPicks.value = null;
    const p = project.value,
      b0 = beatAt(e),
      c = audioClipAt(p, track, b0);
    if (!c) {
      selectedAudio.value = null;
      return;
    }
    selectedAudio.value = { track: track.id, clip: c.id };
    const grab = grabOf(c, b0, yAt(e)),
      x0 = e.clientX,
      map = p.tempoMap,
      s0 = beatToSeconds(map, b0),
      file = audioFiles.decoded(c.file)?.duration ?? Infinity;
    const result = (m: PointerEvent): AudioDrag => {
      const b = b0 + (m.clientX - x0) / ppb,
        by = beatToSeconds(map, Math.max(0, b)) - s0;
      switch (grab) {
        case 'start':
        case 'end':
          return {
            to: track.id,
            clip: c.id,
            result: trimAudioClip(p, track.id, c.id, grab, dropBeat(b, m.shiftKey), file),
          };
        case 'fadeIn':
          return {
            to: track.id,
            clip: c.id,
            result: updateAudioClip(p, track.id, c.id, { fadeIn: Math.max(0, c.fadeIn + by) }),
          };
        case 'fadeOut':
          return {
            to: track.id,
            clip: c.id,
            result: updateAudioClip(p, track.id, c.id, { fadeOut: Math.max(0, c.fadeOut - by) }),
          };
        default: {
          const row = document
            .elementFromPoint(m.clientX, m.clientY)
            ?.closest<HTMLElement>('.track[data-id]');
          const over = p.tracks.find((x) => x.id === row?.dataset.id);
          const to = over && isAudioTrack(over) ? over.id : (audioDrag.value?.to ?? track.id);
          const copy = m.altKey;
          return {
            to,
            clip: copy ? newId(p, 'a') : c.id,
            result: moveAudioClip(p, track.id, c.id, to, dropBeat(c.start + b - b0, m.shiftKey), copy),
          };
        }
      }
    };
    const move = (m: PointerEvent) => {
      audioDrag.value = result(m);
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      const d = audioDrag.value;
      audioDrag.value = null;
      if (!d || d.result === project.value) return;
      edit(() => d.result);
      selected.value = d.to;
      selectedAudio.value = { track: d.to, clip: d.clip };
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  };

  const hover = (e: TargetedPointerEvent<HTMLDivElement>) => {
    if (audioDrag.value) return;
    const b = beatAt(e),
      c = audioClipAt(project.value, track, b);
    const grab = c && grabOf(c, b, yAt(e));
    e.currentTarget.style.cursor = !grab ? '' : grab === 'move' ? 'grab' : 'ew-resize';
  };

  const menu = (e: TargetedMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const b = beatAt(e),
      c = audioClipAt(project.value, track, b);
    if (c) audioClipMenu(track.id, c.id, b);
    else audioLaneMenu(track.id, b);
  };

  const [dropping, setDropping] = useState(false);
  const isFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
  const dropped = (e: TargetedDragEvent<HTMLDivElement>) => {
    setDropping(false);
    if (!isFiles(e) || !e.dataTransfer) return;
    e.preventDefault();
    void dropAudioClips(track.id, [...e.dataTransfer.files], dropBeat(beatAt(e), e.shiftKey));
  };
  return (
    <div
      class={`lane audio ${dropping ? 'drop' : ''}`}
      style={{ width: px(beats * ppb) }}
      onPointerDown={down}
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
