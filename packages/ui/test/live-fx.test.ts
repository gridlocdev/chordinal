// Playing live through the selected track's note effects, so a key sounds the way Play will play it.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { emptyProject, makeTrack, addTrack, history, arpSettings } from '@chordinal/daw';
import type { Project, TrackFx } from '@chordinal/daw';
import { hist, selected } from '../src/store.ts';
import { dueSteps, liveKeys } from '../src/live.ts';

function select(fx: TrackFx[]): void {
  let p: Project = { ...emptyProject(), key: { tonic: 0, mode: 'major' } };
  p = addTrack(p, { ...makeTrack(p, { name: 'keys' }), id: 'k', fx });
  hist.value = history(p);
  selected.value = 'k';
}

test('a key played live goes through the track’s Scale and Chord, in order, and not through a bypassed one', () => {
  select([]);
  assert.deepEqual(liveKeys(61), [61], 'no effects: the key as pressed');
  select([{ type: 'scale' }, { type: 'chord', shape: 'key' }]);
  assert.deepEqual(liveKeys(61), [60, 64, 67], 'C# snaps to C, then plays C major');
  assert.deepEqual(liveKeys(62), [62, 65, 69], 'D plays the key’s D minor');
  select([{ type: 'chord', shape: 'power', bypass: true }]);
  assert.deepEqual(liveKeys(60), [60]);
});

test('a live arpeggio schedules its steps at the rate, with the gate, carrying on from the step it got to', () => {
  const a = arpSettings({ type: 'arp', rate: '1/8', direction: 'up', octaves: 1, gate: 0.5 });
  // at 120 bpm an eighth is 0.25 s: C E G held, 0.6 s ahead from 10 s
  const steps = dueSteps([64, 60, 67], a, 0, 10, 10.6, 0.25);
  assert.deepEqual(
    steps.map((s) => [s.key, s.on, s.off]),
    [
      [60, 10, 10.125],
      [64, 10.25, 10.375],
      [67, 10.5, 10.625],
    ],
  );
  assert.deepEqual(
    dueSteps([64, 60, 67], a, 3, 10.75, 11, 0.25).map((s) => s.key),
    [60],
    'step 3 goes round to the bottom again',
  );
  assert.deepEqual(dueSteps([], a, 0, 10, 11, 0.25), []);
  select([{ type: 'chord', shape: 'key' }, { type: 'arp' }, { type: 'scale' }]);
  assert.deepEqual(
    liveKeys(60, 100, [{ type: 'chord', shape: 'key' }]),
    [60, 64, 67],
    'the keys put into it',
  );
});
