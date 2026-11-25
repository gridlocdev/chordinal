import { test } from 'vitest';
import assert from 'node:assert/strict';
import { DEFAULT_SYNTH, synthSettings } from '@chordinal/audio';

test("a synth's settings: nothing given is the default, and a few settings keep the rest of it", () => {
  assert.deepEqual(synthSettings(), DEFAULT_SYNTH);
  assert.deepEqual(synthSettings(null), DEFAULT_SYNTH);
  const p = synthSettings({ mono: true, glide: 0.2, osc1: { wave: 'square' }, filter: { type: 'highpass' } });
  assert.equal(p.mono, true);
  assert.equal(p.glide, 0.2);
  assert.deepEqual(p.osc1, { ...DEFAULT_SYNTH.osc1, wave: 'square' });
  assert.deepEqual(p.filter, { ...DEFAULT_SYNTH.filter, type: 'highpass' });
  assert.deepEqual(p.amp, DEFAULT_SYNTH.amp);
});

test("a synth's settings keep their numbers in range and drop what can't be read", () => {
  const p = synthSettings({
    osc1: { wave: 'kazoo', octave: 3.6, detune: -500, level: 2 },
    noise: Number.NaN,
    filter: { cutoff: 5, resonance: 99, amount: -9000, env: { sustain: 1.5, attack: -1 } },
    lfo: { target: 'volume', depth: 3, rate: 50 },
    mono: 'yes',
    glide: 10,
  });
  assert.deepEqual(p.osc1, { wave: 'saw', octave: 2, detune: -100, level: 1 });
  assert.equal(p.noise, DEFAULT_SYNTH.noise);
  assert.equal(p.filter.cutoff, 20);
  assert.equal(p.filter.resonance, 20);
  assert.equal(p.filter.amount, -4800);
  assert.equal(p.filter.env.sustain, 1);
  assert.equal(p.filter.env.attack, 0);
  assert.deepEqual(p.lfo, { wave: 'sine', rate: 20, depth: 1, target: 'volume' });
  assert.equal(p.mono, false);
  assert.equal(p.glide, 5);
  // a pitch or filter LFO's depth is in cents
  assert.equal(synthSettings({ lfo: { target: 'pitch', depth: 50 } }).lfo.depth, 50);
});
