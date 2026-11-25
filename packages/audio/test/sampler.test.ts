import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  DEFAULT_SAMPLER,
  SAMPLER_SECTIONS,
  SAMPLE_FILE,
  controlText,
  guessRoot,
  samplerSettings,
  synthValue,
  withSamplerValue,
} from '@chordinal/audio';

const RATE = 44100;

const tone = (hz: number, seconds: number): Float32Array =>
  Float32Array.from(
    { length: Math.round(RATE * seconds) },
    (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / RATE),
  );

test('saved settings are made whole and held in range', () => {
  assert.deepEqual(samplerSettings(), DEFAULT_SAMPLER);
  assert.deepEqual(samplerSettings('nonsense'), DEFAULT_SAMPLER);
  const s = samplerSettings({
    name: '  Pad ',
    file: 'pad.wav',
    root: 200.4,
    mode: 'reverse',
    start: 3,
    amp: { release: -1 },
  });
  assert.equal(s.name, 'Pad');
  assert.equal(s.file, 'pad.wav');
  assert.equal(s.root, 127);
  assert.equal(s.mode, 'oneshot');
  assert.equal(s.start, 0.99);
  assert.equal(s.amp.release, 0);
  assert.equal(samplerSettings({ root: 61.6, mode: 'loop' }).root, 62);
  assert.equal(samplerSettings({ mode: 'loop' }).mode, 'loop');
});

test('the root key is the pitch a tone holds, and none for noise or silence', () => {
  assert.equal(guessRoot(tone(440, 1), RATE), 69);
  assert.equal(guessRoot(tone(261.63, 1), RATE), 60);
  let seed = 7;
  const noise = Float32Array.from({ length: RATE }, () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 30 - 1;
  });
  assert.equal(guessRoot(noise, RATE), null);
  assert.equal(guessRoot(new Float32Array(RATE), RATE), null);
});

test('every sampler control sets a setting the sampler has, and values set are held in range', () => {
  for (const c of SAMPLER_SECTIONS.flatMap((s) => s.controls))
    assert.notEqual(synthValue(DEFAULT_SAMPLER, c.path), undefined, c.path);
  const s = withSamplerValue(DEFAULT_SAMPLER, 'amp.release', 2);
  assert.equal(s.amp.release, 2);
  assert.deepEqual({ ...s, amp: DEFAULT_SAMPLER.amp }, DEFAULT_SAMPLER);
  assert.equal(withSamplerValue(DEFAULT_SAMPLER, 'root', 300).root, 127);
  const root = SAMPLER_SECTIONS[0]!.controls.find((c) => c.path === 'root');
  assert.ok(root?.kind === 'number');
  assert.equal(controlText(root, 69), 'A4');
});

test('WAV, AIFF and MP3 files are samples', () => {
  for (const f of ['kick.wav', 'Pad.AIFF', 'pad.aif', 'vox.mp3']) assert.ok(SAMPLE_FILE.test(f), f);
  for (const f of ['song.mid', 'notes.txt', 'wav']) assert.ok(!SAMPLE_FILE.test(f), f);
});
