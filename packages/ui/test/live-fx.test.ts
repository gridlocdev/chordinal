// Playing live through the selected track's note effects, so a key sounds the way Play will play it.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { emptyProject, makeTrack, addTrack, history } from '@chordinal/daw';
import type { Project, TrackFx } from '@chordinal/daw';
import { hist, selected } from '../src/store.ts';
import { liveKeys } from '../src/live.ts';

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
