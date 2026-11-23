// Drawing automation: adding, moving, removing and curving keyframes, each an undoable project edit.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { emptyProject, makeTrack, addTrack, valueAt } from '@chordinal/daw';
import { addKeyframe, moveKeyframe, removeKeyframe, setKeyframeCurve, clearLane } from '@chordinal/daw';
import type { Project } from '@chordinal/daw';

function oneTrack(): Project {
  const p = emptyProject();
  return addTrack(p, { ...makeTrack(p, { name: 'Keys' }), id: 't' });
}
const lane = (p: Project, id: 'volume' | 'tone' | 'pan') => p.tracks[0]!.automation[id];

test('keyframes are added in beat order, and one at the same beat replaces the one there', () => {
  let p = oneTrack();
  p = addKeyframe(p, 't', 'volume', 8, 0.2);
  p = addKeyframe(p, 't', 'volume', 0, 1);
  p = addKeyframe(p, 't', 'volume', 8, 0.5);
  assert.deepEqual(
    lane(p, 'volume')?.map((f) => [f.beat, f.value]),
    [
      [0, 1],
      [8, 0.5],
    ],
  );
  assert.equal(valueAt(lane(p, 'volume')!, 4), 0.75, 'a linear ramp between them');
});

test('values stay in the lane’s range', () => {
  let p = oneTrack();
  p = addKeyframe(p, 't', 'pan', 0, -3);
  p = addKeyframe(p, 't', 'tone', 0, 5);
  assert.equal(lane(p, 'pan')![0]!.value, -1);
  assert.equal(lane(p, 'tone')![0]!.value, 80);
});

test('a keyframe moves only between its neighbours, so the order never changes', () => {
  let p = oneTrack();
  for (const b of [0, 4, 8]) p = addKeyframe(p, 't', 'volume', b, 1);
  p = moveKeyframe(p, 't', 'volume', 1, 20, 0.3);
  assert.deepEqual(lane(p, 'volume')![1], { beat: 8, value: 0.3, curve: 'linear' });
  p = moveKeyframe(p, 't', 'volume', 0, -5, 1);
  assert.equal(lane(p, 'volume')![0]!.beat, 0);
});

test('removing the last keyframe removes the lane, so the track saves as it did', () => {
  let p = oneTrack();
  p = addKeyframe(p, 't', 'volume', 0, 1);
  p = removeKeyframe(p, 't', 'volume', 0);
  assert.deepEqual(p.tracks[0]!.automation, {});
  p = addKeyframe(p, 't', 'tone', 0, 1000);
  p = addKeyframe(p, 't', 'tone', 4, 2000);
  assert.deepEqual(clearLane(p, 't', 'tone').tracks[0]!.automation, {});
});

test('an exponential ramp only where every value is above 0', () => {
  let p = oneTrack();
  p = addKeyframe(p, 't', 'tone', 0, 200);
  p = addKeyframe(p, 't', 'tone', 4, 3200);
  p = setKeyframeCurve(p, 't', 'tone', 1, 'exp');
  assert.equal(lane(p, 'tone')![1]!.curve, 'exp');
  assert.equal(valueAt(lane(p, 'tone')!, 2), 800);
  let q = addKeyframe(oneTrack(), 't', 'volume', 0, 0);
  const before = q;
  q = setKeyframeCurve(q, 't', 'volume', 0, 'exp');
  assert.equal(q, before, 'volume can reach 0, so no exponential ramps');
});

test('an edit that changes nothing gives back the same project (no undo step)', () => {
  const p = addKeyframe(oneTrack(), 't', 'volume', 0, 1);
  assert.equal(setKeyframeCurve(p, 't', 'volume', 0, 'linear'), p);
});
