import { test } from 'vitest';
import assert from 'node:assert/strict';
import { hist, project, toggleSolo } from '../src/index.ts';
import { history, emptyProject, makeTrack, addTrack } from '@chordinal/daw';

test('solo is one track at a time: soloing a track turns the others off, and again turns it off', () => {
  let p = emptyProject();
  for (const id of ['a', 'b', 'c']) p = addTrack(p, { ...makeTrack(p, { name: id }), id });
  hist.value = history(p);
  const soloed = () => project.value.tracks.filter((t) => t.mixer.solo).map((t) => t.id);
  toggleSolo('a');
  assert.deepEqual(soloed(), ['a']);
  toggleSolo('b');
  assert.deepEqual(soloed(), ['b'], 'the one picked last');
  toggleSolo('b');
  assert.deepEqual(soloed(), [], 'again turns it off');
});
