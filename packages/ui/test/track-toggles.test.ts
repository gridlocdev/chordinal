import { test } from 'vitest';
import assert from 'node:assert/strict';
import { hist, project, redo, toggleChromatic, toggleShowSteps, undo } from '../src/index.ts';
import { history, emptyProject, makeTrack, addTrack } from '@chordinal/daw';

test('Chromatic and Show Steps turn off again, leaving no field behind, and each turn is an undo step', () => {
  let p = emptyProject();
  p = addTrack(p, { ...makeTrack(p, { name: 'Drums', instrument: { bank: 128, program: 0 } }), id: 'd' });
  hist.value = history(p);
  const track = () => project.value.tracks[0]!;
  toggleShowSteps('d');
  toggleChromatic('d');
  assert.equal(track().showSteps, true);
  assert.equal(track().gridChromatic, true);
  toggleShowSteps('d');
  toggleChromatic('d');
  assert.ok(!('showSteps' in track()), 'Show Steps is off');
  assert.ok(!('gridChromatic' in track()), 'Chromatic is off');
  undo();
  assert.equal(track().gridChromatic, true);
  redo();
  assert.ok(!('gridChromatic' in track()));
});
