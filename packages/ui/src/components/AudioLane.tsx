// An audio track's lane (Chordinal PRD §16): its clips, each with its file's name and its waveform. Drop WAV, AIFF or
// MP3 files on it to put them there as clips, from the beat they're dropped on (Shift: where they are, unsnapped).
import { useState } from 'preact/hooks';
import type { TargetedDragEvent, TargetedPointerEvent } from 'preact';
import { audioClipEnd, audioClipsOf } from '@chordinal/daw';
import type { Track } from '@chordinal/daw';
import { waveformPeaks } from '@chordinal/lib';
import { project, selected, selectedClip } from '../store.ts';
import { pointPicks } from '../automation.ts';
import { focus } from '../focus.ts';
import { dropAudioClips, dropBeat } from '../audio-tracks.ts';
import { audioFiles, audioRead } from '../audio-files.ts';
import { useCanvas, rgba } from './canvas.ts';
import { px } from './arrange-view.ts';
import { palette } from '../theme.ts';

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

export function AudioLane({ track, beats, ppb }: AudioLaneProps) {
  const ref = useCanvas((g, _w, h) => {
    void audioRead.value;
    const map = project.value.tempoMap,
      t = palette.value;
    g.font = '11px -apple-system, system-ui, sans-serif';
    g.textBaseline = 'middle';
    for (const c of audioClipsOf(track)) {
      const a = c.start * ppb + 1,
        b = audioClipEnd(map, c) * ppb - 1;
      if (b <= a) continue;
      g.globalAlpha = c.mute ? 0.35 : 1;
      g.fillStyle = rgba(track.color, 0.2);
      g.beginPath();
      g.roundRect(a, 2, b - a, h - 4, 5);
      g.fill();
      g.save();
      g.beginPath();
      g.roundRect(a, 2, b - a, h - 4, 5);
      g.clip();
      g.fillStyle = rgba(track.color, 0.75);
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
      g.restore();
      g.globalAlpha = 1;
    }
  });

  const beatAt = (e: { clientX: number; currentTarget: Element }) =>
    (e.clientX - e.currentTarget.getBoundingClientRect().left) / ppb;
  const down = (e: TargetedPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    focus.value = 'arrange';
    selected.value = track.id;
    selectedClip.value = null;
    pointPicks.value = null;
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
