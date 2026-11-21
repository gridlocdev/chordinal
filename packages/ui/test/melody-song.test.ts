// New from Melody's customizer (PRD §9.4): the song is previewed in the window while the project waits; each change
// composes it again; Cancel puts the project back, Replace This Project is one undo step, Save and Create New saves the
// project first. Nothing is saved while the song is in the window.
import { test, beforeEach } from 'vitest';
import assert from 'node:assert/strict';
import { emptyProject, makeTrack, addTrack, addClip, writeProject } from '@chordinal/daw';
import { bpmAt } from '@chordinal/lib';
import { EMOTIONS } from '@chordinal/composer';
import { setPlace, openProject, save, undo } from '../src/index.ts';
import { hist, project, projectName, saved, selectedClip, dirty, songPreview } from '../src/store.ts';
import {
  newFromMelody,
  customize,
  customizer,
  cancelMelodySong,
  replaceWithMelodySong,
  saveAndCreateMelodySong,
} from '../src/melody-song.ts';

globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};

const disk = new Map<string, string>();
setPlace({
  files: {
    read: async (name) => {
      const text = disk.get(name);
      if (text === undefined) throw new Error('not found');
      return { text, version: text };
    },
    write: async (name, text) => {
      disk.set(name, text);
      return text;
    },
    takes: async () => [],
    readTake: async () => new ArrayBuffer(0),
    writeTake: async () => {},
  },
  where: (name) => `“${name}”`,
  chooseName: async (title) => ({ name: 'new', title }),
});

/** a saved project, “Tune”, at 100 bpm, with a two-bar melody in clip c1 on track t1, selected, and an unsaved edit */
async function setUp(): Promise<void> {
  cancelMelodySong();
  saved.value = project.value; // the last test's changes go without a question
  let p = emptyProject({ title: 'Tune', bpm: 100, bars: 8 });
  p = addTrack(p, { ...makeTrack(p, { name: 'Keys' }), id: 't1' });
  const notes = [60, 62, 64, 65, 67, 65, 64, 62].map((key, i) => ({ beat: i, beats: 1, key, vel: 100 }));
  p = addClip(p, 't1', { id: 'c1', start: 0, beats: 8, notes });
  disk.clear();
  disk.set('tune', writeProject(p));
  assert.equal(await openProject('tune'), true);
  selectedClip.value = { track: 't1', clip: 'c1' };
}

const tempo = () => Math.round(bpmAt(project.value.tempoMap, 0));

beforeEach(setUp);

test('the song is previewed in the window at the project’s tempo, and Cancel puts the project back as it was', () => {
  const before = hist.value;
  newFromMelody();
  assert.ok(customizer.value);
  assert.ok(songPreview.value);
  assert.equal(project.value.title, 'Tune melody');
  assert.equal(tempo(), 100);
  assert.ok(project.value.tracks.length > 1);
  cancelMelodySong();
  assert.equal(customizer.value, null);
  assert.equal(songPreview.value, null);
  assert.equal(hist.value, before);
  assert.equal(projectName.value, 'tune');
  assert.equal(dirty.value, false);
});

test('each change composes the song again; a new feeling brings its own tempo and band, and keeps the key', () => {
  newFromMelody();
  customize({ tempo: 132 });
  assert.equal(tempo(), 132);
  const key = customizer.value?.choices.key;
  customize({ feeling: 'heroic' });
  const c = customizer.value?.choices;
  assert.equal(c?.key, key);
  assert.notEqual(c?.tempo, 132);
  assert.equal(c?.form, EMOTIONS.heroic?.form);
  assert.equal(tempo(), c?.tempo);
  // a form without a chorus puts the melody in its A sections
  customize({ form: 'AABA' });
  assert.equal(customizer.value?.choices.melodyIn, 'A');
  // a choice the composer can't use is shown, and the song stays as it was
  const song = project.value;
  customize({ feeling: 'nonesuch' });
  assert.match(customizer.value?.error ?? '', /unknown emotion/);
  assert.equal(project.value, song);
  customize({ feeling: 'heroic' });
  assert.equal(customizer.value?.error, '');
  // a part left out isn't in the song
  customize({ band: { ...customizer.value!.choices.band, drums: null } });
  assert.ok(!project.value.tracks.some((t) => t.name === 'Drums'));
});

test('Replace This Project keeps its title and folder, and is one undo step', () => {
  const before = project.value;
  newFromMelody();
  customize({ tempo: 90 });
  replaceWithMelodySong();
  assert.equal(customizer.value, null);
  assert.equal(project.value.title, 'Tune');
  assert.equal(projectName.value, 'tune');
  assert.equal(tempo(), 90);
  assert.equal(dirty.value, true);
  undo();
  assert.equal(project.value, before);
});

test('nothing is saved while the song is in the window', async () => {
  const text = disk.get('tune');
  newFromMelody();
  assert.equal(await save(), false);
  assert.equal(disk.get('tune'), text);
  assert.ok(customizer.value);
});

test('Save and Create New saves the project first, then opens the song as a new project', async () => {
  newFromMelody();
  customize({ tempo: 120 });
  await saveAndCreateMelodySong();
  assert.equal(customizer.value, null);
  assert.equal(projectName.value, '');
  assert.equal(project.value.title, 'Tune melody');
  assert.equal(tempo(), 120);
  assert.match(disk.get('tune') ?? '', /"title": "Tune"/);
});

test('opening another project while the song is previewed puts the project back first', async () => {
  disk.set('other', writeProject(emptyProject({ title: 'Other' })));
  newFromMelody();
  assert.equal(await openProject('other'), true);
  assert.equal(customizer.value, null);
  assert.equal(project.value.title, 'Other');
});
