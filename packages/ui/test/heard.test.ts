import { test } from 'vitest';
import assert from 'node:assert/strict';
import { heardDifferently } from '../src/index.ts';
import { emptyProject, makeTrack, addTrack, updateTrack } from '@chordinal/daw';
import { setMeterAt } from '@chordinal/daw';
import type { Mixer, Project } from '@chordinal/daw';

/** a project with one track, and that track's id */
function oneTrack(): [Project, string] {
  let p = emptyProject({ bars: 4 });
  p = addTrack(p, makeTrack(p, { name: 'Keys' }));
  const t = p.tracks[0];
  assert.ok(t);
  return [p, t.id];
}

test('an edit while playing restarts playback when it changes what is heard (meter, key, chords, length, title)', () => {
  const [p, id] = oneTrack();
  const cases: [string, Project][] = [
    ['meter', setMeterAt(p, 4, '3/4')],
    ['key', { ...p, key: { tonic: 2, mode: 'minor' } }],
    ['chords', { ...p, chords: [{ beat: 0, beats: 4, name: 'C', tones: [0, 4, 7] }] }],
    ['length', { ...p, length: p.length + 4 }],
    ['title', { ...p, title: 'Other' }],
  ];
  for (const [what, q] of cases) assert.equal(heardDifferently(p, q), true, what);
  const louder = updateTrack(p, id, (t) => ({ ...t, mixer: { ...t.mixer, volumeDb: -3 } }));
  assert.equal(heardDifferently(p, louder), false, 'a fader plays on without a restart');
});

test('moving a send or the low cut while playing glides there without a restart; auto-pan still restarts', () => {
  const [p, id] = oneTrack();
  const mixer = (patch: Partial<Mixer>) =>
    updateTrack(p, id, (t) => ({ ...t, mixer: { ...t.mixer, ...patch } }));
  assert.equal(heardDifferently(p, mixer({ sends: { reverb: 0.5, delay: 0.2 } })), false, 'sends');
  assert.equal(heardDifferently(p, mixer({ lowCut: 200 })), false, 'low cut');
  assert.equal(heardDifferently(p, mixer({ autoPan: { rate: 1, depth: 0.5 } })), true, 'auto-pan');
});

test("the mix handed to the player carries each track's sends and low cut", async () => {
  const { mix, hist } = await import('../src/index.ts');
  const { setMixer } = await import('@chordinal/daw');
  const { history } = await import('@chordinal/daw');
  const [one, id] = oneTrack();
  const p = setMixer(one, id, { sends: { reverb: 0.4, delay: 0.1 }, lowCut: 120 });
  hist.value = history(p);
  assert.deepEqual(
    { ...mix.value[0], gain: undefined },
    { gain: undefined, pan: 0, reverb: 0.4, delay: 0.1, lowCut: 120 },
  );
});
