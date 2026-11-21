// Record Melody and Whistle a Chord pick the shared recorder's take (Chordinal PRD §9.3). There is no microphone in
// Node, so each stops at "No microphone", having picked its track or stretch first.
import { test } from 'vitest';
import assert from 'node:assert/strict';

globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};

const { recordMelody, whistleChord } = await import('../src/whistle.ts');
const { hist, project, selected, chordRange, status } = await import('@chordinal/ui');
const { emptyProject, addTrack, makeTrack } = await import('@chordinal/daw');
const { history } = await import('@chordinal/daw');

function start(): string {
  let p = emptyProject();
  const t = makeTrack(p, { name: 'Lead', instrument: { bank: 0, program: 73 } });
  p = addTrack(p, t);
  hist.value = history(p);
  return t.id;
}

test('Record Melody on a track selects it and records a melody, not the chord picked on the chord track', async () => {
  const id = start();
  selected.value = null;
  chordRange.value = { beat: 0, beats: 4 };
  status.value = '';
  await recordMelody(id);
  assert.equal(selected.value, id);
  assert.equal(chordRange.value, null);
  assert.match(status.value, /^No microphone/);
  assert.equal(project.value.tracks.length, 1, 'no track added before the microphone answered');
});

test('Whistle a Chord does nothing until a stretch of the chord track is picked, and keeps that stretch', async () => {
  start();
  chordRange.value = null;
  status.value = '';
  await whistleChord();
  assert.equal(status.value, '');
  chordRange.value = { beat: 4, beats: 4 };
  await whistleChord();
  assert.deepEqual(chordRange.value, { beat: 4, beats: 4 });
  assert.match(status.value, /^No microphone/);
});
