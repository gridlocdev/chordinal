import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  DEFAULT_SYNTH,
  SYNTH_SECTIONS,
  controlPlace,
  controlText,
  controlValue,
  synthValue,
  withSynthValue,
} from '@chordinal/audio';

const controls = SYNTH_SECTIONS.flatMap((s) => s.controls);

test("every Sound tab control sets a setting the synth has, and a slider's place and value go both ways", () => {
  for (const c of controls) {
    assert.notEqual(synthValue(DEFAULT_SYNTH, c.path), undefined, c.path);
    if (c.kind !== 'number') continue;
    for (const x of [0, 0.25, 0.5, 1]) {
      const v = controlValue(c, x);
      assert.ok(v >= c.min - 1e-9 && v <= c.max + 1e-9, `${c.path} at ${x}`);
      if (!c.whole) assert.ok(Math.abs(controlPlace(c, v) - x) < 1e-9, `${c.path} back to ${x}`);
    }
  }
});

test('setting one value keeps the rest, holds it in range, and an LFO moved to the volume keeps its share', () => {
  const s = withSynthValue(DEFAULT_SYNTH, 'filter.env.attack', 0.5);
  assert.equal(s.filter.env.attack, 0.5);
  assert.deepEqual({ ...s, filter: DEFAULT_SYNTH.filter }, DEFAULT_SYNTH);
  assert.equal(DEFAULT_SYNTH.filter.env.attack, 0.005, 'the old settings are untouched');
  assert.equal(withSynthValue(DEFAULT_SYNTH, 'filter.cutoff', 99999).filter.cutoff, 20000);
  assert.equal(withSynthValue(DEFAULT_SYNTH, 'osc1.wave', 'kazoo').osc1.wave, DEFAULT_SYNTH.osc1.wave);

  const pitch = withSynthValue(DEFAULT_SYNTH, 'lfo.depth', 600);
  const volume = withSynthValue(pitch, 'lfo.target', 'volume');
  assert.equal(volume.lfo.depth, 0.5);
  assert.equal(withSynthValue(volume, 'lfo.target', 'filter').lfo.depth, 600);
  assert.equal(withSynthValue(pitch, 'lfo.target', 'filter').lfo.depth, 600);
});

test("a control's value reads in its unit", () => {
  const find = (path: string) => {
    const c = controls.find((x) => x.path === path);
    if (c?.kind !== 'number') throw new Error(path);
    return c;
  };
  assert.equal(controlText(find('filter.cutoff'), 2400), '2.40 kHz');
  assert.equal(controlText(find('amp.attack'), 0.005), '5 ms');
  assert.equal(controlText(find('osc2.detune'), -7), '−7 ct');
  assert.equal(controlText(find('osc1.octave'), 1), '+1 oct');
  assert.equal(controlText(find('noise'), 0.25), '25%');
});
