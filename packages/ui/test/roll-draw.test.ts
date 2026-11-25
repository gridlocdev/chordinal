import { test } from 'vitest';
import assert from 'node:assert/strict';
import { hist, selected, project } from '@chordinal/ui';
import { emptyProject, makeTrack, addTrack } from '@chordinal/daw';
import { history } from '@chordinal/daw';
import { undo } from '@chordinal/ui';
import { down, held } from '@chordinal/ui';
import type { RollMove, RollTarget } from '@chordinal/ui';

globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};

type Listener = (m: RollMove) => void;

/** a pretend piano roll canvas holder that records its listeners */
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

test('drawing a note on an empty lane, and dragging its length, is one undo step', () => {
  let p = emptyProject({ bars: 4 });
  p = addTrack(p, { ...makeTrack(p, { name: 'Keys' }), id: 't1' });
  hist.value = history(p);
  selected.value = 't1';
  const el = roll();
  const press = { button: 0, currentTarget: el, clientX: 300, clientY: 250, timeStamp: 1, pointerId: 1 };
  down({ ...press, altKey: false, shiftKey: false, metaKey: false, ctrlKey: false }, p, p.tracks[0] ?? null);
  el.on.pointermove?.({ clientX: 360, clientY: 250, altKey: false });
  el.on.pointerup?.({ clientX: 360, clientY: 250, altKey: false });
  assert.equal(project.value.tracks[0]?.clips.length, 1);
  assert.equal(project.value.tracks[0]?.clips[0]?.notes.length, 1);
  undo();
  assert.equal(
    project.value.tracks[0]?.clips.length,
    0,
    'one undo takes back the note and the clip made for it',
  );
});

test("pressing the roll's keyboard holds that key until the pointer lets go, gliding to the keys it passes", () => {
  let p = emptyProject({ bars: 4 });
  p = addTrack(p, { ...makeTrack(p, { name: 'Keys' }), id: 't1' });
  hist.value = history(p);
  selected.value = 't1';
  const el = roll();
  const at = { button: 0, currentTarget: el, clientX: 10, clientY: 250, timeStamp: 1, pointerId: 1 };
  down({ ...at, altKey: false, shiftKey: false, metaKey: false, ctrlKey: false }, p, p.tracks[0] ?? null);
  assert.equal(held.value.size, 1, 'the pressed key sounds');
  const first = [...held.value][0] ?? 0;
  el.on.pointermove?.({ clientX: 10, clientY: 150, altKey: false });
  assert.equal(held.value.size, 1, 'a glide sounds one key at a time');
  assert.ok((held.value.values().next().value ?? 0) > first, 'higher up the keyboard is a higher key');
  el.on.pointerup?.({ clientX: 10, clientY: 150, altKey: false });
  assert.equal(held.value.size, 0, 'letting go stops it');
  assert.equal(project.value.tracks[0]?.clips.length, 0, 'the keyboard draws no notes');
});
