// The song New from Melody's customizer makes around a melody (PRD §9.4): its choices go into the spec, and the
// melody's section is every section of the chosen type, or the one section of a song that plays it once.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { melodySongSpec, ONCE } from '../src/index.ts';
import type { MelodySong } from '../src/index.ts';

const choices: MelodySong = {
  feeling: 'tender',
  genre: 'jazz',
  seed: 'ab12',
  tempo: 96,
  key: 'Eb',
  mode: 'dorian',
  form: 'AABA',
  melodyIn: 'A',
  band: { lead: 66, counter: null, arp: null, chords: 0, pad: null, bass: 32, drums: 32 },
  groove: 'swing',
  swing: 0.67,
  dynamics: 0.6,
  lift: true,
  ritardando: true,
  style: { ornaments: 0.3, swing: 0.5 },
};
const section = { bars: 2, melody: '1 3 5 | 1:4', progression: 'I V', vibrato: { rate: 6, cents: 30 } };

test('the choices go into the spec, and the melody into every section of its type', () => {
  const spec = melodySongSpec(choices, { name: 'Tune melody', meter: '4/4', section });
  assert.deepEqual(
    { ...spec, style: undefined },
    {
      id: 'sketch',
      title: 'Tune melody',
      seed: 'ab12',
      emotion: 'tender',
      genre: 'jazz',
      key: 'Eb',
      mode: 'dorian',
      tempo: 96,
      meter: '4/4',
      band: choices.band,
      groove: 'swing',
      swing: 0.67,
      dynamics: 0.6,
      lift: true,
      ritardando: true,
      form: 'AABA',
      style: undefined,
      sections: { A: { bars: 2, melody: '1 3 5 | 1:4', progression: 'I V' } },
    },
  );
  // the planned style, with the sketch's own touches over it: no added ornaments, and the melody's vibrato
  assert.deepEqual(spec.style, { ornaments: 0, swing: 0.5, vibrato: { rate: 6, cents: 30 } });
});

test('no genre leaves it to the feeling; Melody once is one verse', () => {
  const spec = melodySongSpec({ ...choices, genre: '', form: ONCE }, { meter: '3/4', section });
  assert.equal('genre' in spec, false);
  assert.deepEqual(spec.form, ['verse']);
  assert.deepEqual(Object.keys(spec.sections), ['verse']);
});
