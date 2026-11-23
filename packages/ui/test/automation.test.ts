import { test } from 'vitest';
import assert from 'node:assert/strict';
import { LANE_PARAMS, laneParam, emptyProject, makeTrack, addTrack, history } from '@chordinal/daw';
import { hist, laneHeight, laneValueAt, laneText, shownLanes, toggleAutomation } from '../src/index.ts';

test('a lane height and its value turn back into each other on every lane', () => {
  for (const param of LANE_PARAMS)
    for (const h of [0.1, 0.25, 0.5, 0.75, 1]) {
      const back = laneHeight(param, laneValueAt(param, h));
      assert.ok(Math.abs(back - h) < 1e-9, `${param.id} at ${h} came back as ${back}`);
    }
});

test('volume reads in decibels with silence at the bottom, tone on octaves, pan left and right', () => {
  const volume = laneParam('volume');
  assert.equal(laneValueAt(volume, 0), 0);
  assert.equal(laneHeight(volume, 0), 0);
  assert.equal(laneHeight(volume, volume.max), 1);
  assert.equal(laneText('volume', 1), '0.0 dB');
  assert.equal(laneText('volume', 0.5), '−6.0 dB');
  assert.equal(laneText('volume', 0), '−∞ dB');
  const tone = laneParam('tone');
  assert.ok(
    Math.abs(laneValueAt(tone, 0.5) - Math.sqrt(tone.min * tone.max)) < 1e-6,
    'the middle is the middle octave',
  );
  assert.equal(laneText('tone', 1200), '1.2 kHz');
  assert.equal(laneText('pan', -0.3), '30 L');
  assert.equal(laneText('pan', 0), 'C');
  assert.equal(laneText('reverb', 0.25), '25%');
});

test('Show Automation shows the lane with keyframes first, and again hides it', () => {
  let p = emptyProject();
  p = addTrack(p, {
    ...makeTrack(p, { name: 'a' }),
    id: 'a',
    automation: { tone: [{ beat: 0, value: 500, curve: 'set' }] },
  });
  hist.value = history(p);
  toggleAutomation('a');
  assert.equal(shownLanes.value.a, 'tone');
  toggleAutomation('a');
  assert.equal(shownLanes.value.a, undefined);
});
