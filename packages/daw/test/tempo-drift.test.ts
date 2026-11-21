// Changing the base tempo back and forth leaves the later tempo changes where they were (audit: each change rounded
// every scaled tempo to hundredths, so after 30 changes a ramp's 141 had drifted to 141.01).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { emptyProject } from '@chordinal/daw';
import { setTempo, setTempoAt } from '@chordinal/daw';
import { at } from './at.ts';

test('changing the base tempo many times, then back, leaves the other tempos as they were', () => {
  let p = setTempoAt(setTempoAt(emptyProject({ bpm: 120 }), 16, 141, { ramp: false }), 0, 120, {
    ramp: true,
  });
  p = setTempoAt(p, 32, 97);
  const before = p.tempoMap;
  for (let i = 0; i < 30; i++) p = setTempo(p, 61 + ((i * 37) % 120));
  p = setTempo(p, 120);
  assert.equal(p.tempoMap.length, before.length);
  p.tempoMap.forEach((s, i) => {
    const b = at(before, i);
    assert.ok(Math.abs(s.bpm - b.bpm) < 1e-4, `${s.bpm} vs ${b.bpm}`);
    if (b.to !== undefined) {
      assert.ok(s.to !== undefined && Math.abs(s.to - b.to) < 1e-4, `to ${s.to} vs ${b.to}`);
    }
  });
  assert.equal(at(p.tempoMap, 0).bpm, 120);
  assert.equal(at(setTempo(p, 97.5).tempoMap, 0).bpm, 97.5, 'the base tempo is the one typed');
});
