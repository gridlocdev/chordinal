import { test } from 'vitest';
import assert from 'node:assert/strict';
import { compose } from '@chordinal/composer';
import { perform } from '@chordinal/composer';
import { planEarCandy } from '@chordinal/composer';
import { toProject } from '@chordinal/composer';
import { humanizeFx } from '@chordinal/composer';
import { CATALOG } from '@chordinal/composer';
import { writeProject, readProject } from '@chordinal/daw';
import { trackNotes } from '@chordinal/daw';
import { at } from './at.ts';

const near = (a: number, b: number): boolean => Math.abs(a - b) < 2e-3;

test('a song as a project holds every note of the score', () => {
  for (const { spec } of CATALOG) {
    const score = compose(spec),
      project = toProject(score);
    assert.equal(project.tracks.length, score.tracks.length, spec.id);
    project.tracks.forEach((t, i) => {
      const got = trackNotes(t),
        want = at(score.tracks, i).notes;
      assert.equal(got.length, want.length, `${spec.id} ${t.name}`);
      got.forEach((n, k) =>
        assert.ok(near(n.beat, at(want, k).beat) && n.key === at(want, k).key, `${spec.id} ${t.name} #${k}`),
      );
    });
    assert.deepEqual(
      project.markers.map((m) => m.beat),
      score.sections.map((s) => s.beat),
    );
  }
});

test('the Humanize FX plays a project, read back from its file, as the score is performed', () => {
  for (const { spec } of CATALOG.filter((c, i) => i % 3 === 0)) {
    const score = compose(spec);
    const project = readProject(writeProject(toProject(score)));
    for (const pass of [0, 1]) {
      const want = perform(score, pass, planEarCandy(score, pass));
      const got = humanizeFx.perform(project, pass);
      project.tracks.forEach((t, i) => {
        const a = got.notes.get(t.id) ?? [],
          b = at(want, i);
        assert.equal(a.length, b.length, `${spec.id} ${t.name} pass ${pass}`);
        a.forEach((n, k) => {
          const w = at(b, k);
          assert.ok(
            n.key === w.key && n.vel === w.vel && near(n.beat, w.beat) && near(n.grid, w.grid),
            `${spec.id} ${t.name} pass ${pass} #${k}: ${JSON.stringify(n)} vs ${JSON.stringify(w)}`,
          );
        });
      });
    }
  }
});

test('every project in projects/ reads, and plays through the Humanize FX', async () => {
  const fs = await import('node:fs');
  const dir = new URL('../../../projects/', import.meta.url);
  const names = fs.readdirSync(dir).filter((n) => fs.existsSync(new URL(`${n}/project.json`, dir)));
  assert.ok(names.length >= 38);
  for (const name of names) {
    const project = readProject(fs.readFileSync(new URL(`${name}/project.json`, dir), 'utf8'));
    const { notes } = humanizeFx.perform(project, 0);
    assert.ok(
      [...notes.values()].some((n) => n.length),
      name,
    );
  }
});
