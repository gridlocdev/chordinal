// Opening a project and saving it unchanged writes the same file (audit: reading put key, markers, loop, groove and
// chords first, so the next save moved them and every project showed a diff).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readProject, writeProject, type Project } from '@chordinal/daw';
import { emptyProject } from '@chordinal/daw';

test('a project read and written again is the same text', () => {
  const text = writeProject(emptyProject({ title: 'Round Trip' }));
  assert.equal(writeProject(readProject(text)), text);
  const song = fs.readFileSync(
    new URL('../../../test/fixtures/projects/first-light/project.json', import.meta.url),
    'utf8',
  );
  assert.equal(writeProject(readProject(song)), song);
});

test('the settings are written in one order, whatever order they were in', () => {
  const p = emptyProject({ title: 'Order' });
  // the project's keys reversed, and one more
  const shuffled: Project & { extra: number } = {
    tracks: p.tracks,
    chords: p.chords,
    groove: p.groove,
    loop: p.loop,
    markers: p.markers,
    key: p.key,
    meters: p.meters,
    tempoMap: p.tempoMap,
    length: p.length,
    title: p.title,
    extra: 1,
  };
  assert.deepEqual(Object.keys(shuffled), [...Object.keys(p).reverse(), 'extra']);
  assert.deepEqual(Object.keys(JSON.parse(writeProject(shuffled))), [
    'format',
    'version',
    'title',
    'length',
    'tempoMap',
    'meters',
    'key',
    'markers',
    'loop',
    'groove',
    'chords',
    'extra',
    'tracks',
  ]);
});
