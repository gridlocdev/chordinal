// The piano roll for the selected track: every clip's notes, the chords above, velocity below and the playhead.
//
// Click empty space in a clip to draw a note (outside a clip, a bar's clip is made for it) and drag to set its
// length; drag a note to move it, its right edge to resize it; Shift-click adds to the selection, Shift-drag on empty
// space picks the notes in a rectangle; other tracks' notes show faintly behind; Delete removes,
// ↑ ↓ transpose (Shift: an octave), Cmd+A selects the clip's notes. Drag in the velocity strip to set velocity.
// Right-click a note or the background for more. Everything snaps to the grid picked in the toolbar (RollToolbar, in the editor's bar); hold Alt to place
// freely. Changing the letter keys' octave (Z, X) scrolls their keys into view. Press a key in the gutter to hear it (drag to glide across keys); its lane lights while it sounds. The wheel scrolls (Shift: across), Cmd/Ctrl + wheel zooms.
import { useEffect, useRef } from 'preact/hooks';
import { project, selected, selectedTrack, picked, settings } from '../store.ts';
import { typedRange } from '../live.ts';
import { useCanvas } from './canvas.ts';
import { view, geometry, showKeys } from './roll-view.ts';
import { drawRoll } from './roll-draw.ts';
import { wheel, down, hover, menu } from './roll-input.ts';
import { RollPlayhead } from './RollPlayhead.tsx';

function Roll() {
  const p = project.value;
  const track = selectedTrack.value;
  // a new track: the view moves to its notes
  useEffect(() => {
    const keys = track ? track.clips.flatMap((c) => c.notes.map((n) => n.key)) : [];
    const mid = keys.length ? Math.round((Math.min(...keys) + Math.max(...keys)) / 2) : 66;
    view.value = { ...view.value, low: mid - 12 };
    picked.value = new Set();
  }, [track?.id]);

  const ref = useCanvas((g, w, h) => drawRoll(g, w, h, p, track));
  // a new octave for the letter keys: the view moves, if it must, so every key they play is in view (PRD §5.7)
  const octave = settings.value.octave;
  const lastOctave = useRef(octave);
  useEffect(() => {
    if (octave === lastOctave.current) return;
    lastOctave.current = octave;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const { lo, hi } = typedRange(octave);
    const L = geometry(r.width, r.height).L;
    view.value = showKeys(view.value, lo, hi, L.hi - L.lo); // the top lane may be cut off
  }, [octave]);
  return (
    <div
      class="roll"
      data-testid="piano-roll"
      onWheel={wheel}
      onPointerDown={(e) => down(e, p, track)}
      onPointerMove={(e) => hover(e, track)}
      onContextMenu={(e) => menu(e, track)}
    >
      <canvas ref={ref} />
      <RollPlayhead />
    </div>
  );
}

export function PianoRoll() {
  void selected.value;
  return <Roll />;
}
