import { test } from 'vitest';
import assert from 'node:assert/strict';
import { addClip, addTrack, emptyProject, history, makeTrack } from '@chordinal/daw';
import type { Note } from '@chordinal/daw';
import { down, hist, knife, project, selected, setSettings, sliceNote, undo, view } from '@chordinal/ui';
import type { RollMove, RollTarget } from '@chordinal/ui';

globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};

type Listener = (m: RollMove) => void;

/** a pretend piano roll canvas holder, 900 × 500, that records its listeners */
function roll(): RollTarget & { on: Partial<Record<string, Listener>> } {
  const on: Partial<Record<string, Listener>> = {};
  return {
    on,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 500, right: 900, bottom: 500 }),
    setPointerCapture() {},
    addEventListener: (k, fn) => {
      on[k] = fn;
    },
    removeEventListener: (k) => {
      delete on[k];
    },
  };
}

// with the view from beat 0 at 40 px a beat and key 48 at the bottom: a beat's x and the middle of a key's lane
const x = (beat: number) => 52 + beat * 40;
const y = (key: number) => 456 - (key - 48) * 12 - 6;

function start(notes: Note[]) {
  let p = emptyProject({ bars: 4 });
  p = addTrack(p, { ...makeTrack(p, { name: 'Keys' }), id: 't1' });
  p = addClip(p, 't1', { id: 'c1', start: 0, beats: 4, notes });
  hist.value = history(p);
  selected.value = 't1';
  view.value = { from: 0, ppb: 40, low: 48 };
  setSettings({ grid: 0.25 });
  return p;
}

const keys = { altKey: false, shiftKey: false, metaKey: false, ctrlKey: false };
const notesNow = () =>
  project.value.tracks[0]!.clips[0]!.notes.map((n) => `${n.key}@${n.beat}+${n.beats}`).sort();

test('a note sliced inside keeps its key, velocity and chance in both halves; a cut at its ends leaves it whole', () => {
  const n: Note = { beat: 1, beats: 2, key: 60, vel: 70, chance: 0.5 };
  assert.deepEqual(sliceNote(n, 2), [
    { ...n, beats: 1 },
    { ...n, beat: 2, beats: 1 },
  ]);
  assert.deepEqual(sliceNote(n, 1), [n]);
  assert.deepEqual(sliceNote(n, 3), [n]);
});

test('Alt-drag up across a chord slices every note the line goes through on the grid, in one undo step', () => {
  const p = start([
    { beat: 0, beats: 2, key: 60, vel: 90 },
    { beat: 0, beats: 2, key: 64, vel: 90 },
    { beat: 0, beats: 1, key: 67, vel: 90 },
    { beat: 0, beats: 2, key: 72, vel: 90 },
  ]);
  const el = roll();
  down(
    {
      ...keys,
      altKey: true,
      button: 0,
      currentTarget: el,
      clientX: x(1.04),
      clientY: y(60),
      timeStamp: 1,
      pointerId: 1,
    },
    p,
    p.tracks[0]!,
  );
  el.on.pointermove?.({ clientX: x(1.02), clientY: y(67), altKey: true });
  assert.deepEqual(knife.value, { beat: 1, k0: 60, k1: 67 }, 'the line snaps to the grid');
  assert.equal(notesNow().length, 4, 'nothing is cut until the pointer lets go');
  el.on.pointerup?.({ clientX: x(1.02), clientY: y(67), altKey: true });
  assert.equal(knife.value, null);
  assert.deepEqual(notesNow(), ['60@0+1', '60@1+1', '64@0+1', '64@1+1', '67@0+1', '72@0+2']);
  undo();
  assert.equal(notesNow().length, 4);
});

test('Cmd-drag (Ctrl on Windows and Linux) deletes each note the pointer passes over, in one undo step', () => {
  const p = start([
    { beat: 0, beats: 1, key: 60, vel: 90 },
    { beat: 2, beats: 1, key: 60, vel: 90 },
    { beat: 0, beats: 1, key: 62, vel: 90 },
  ]);
  const el = roll(),
    cmd = { ...keys, metaKey: true, ctrlKey: true };
  down(
    { ...cmd, button: 0, currentTarget: el, clientX: x(0.5), clientY: y(60), timeStamp: 2, pointerId: 1 },
    p,
    p.tracks[0]!,
  );
  assert.deepEqual(notesNow(), ['60@2+1', '62@0+1'], 'the press deletes the note under it');
  // one quick move jumps past the gap between notes, and still reaches the second
  el.on.pointermove?.({ clientX: x(2.5), clientY: y(60), altKey: false });
  el.on.pointerup?.({ clientX: x(2.5), clientY: y(60), altKey: false });
  assert.deepEqual(notesNow(), ['62@0+1']);
  undo();
  assert.equal(notesNow().length, 3);
});
