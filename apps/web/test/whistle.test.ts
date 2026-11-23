// Record Melody picks the track for the shared recorder's take (Chordinal PRD §9.3). There is no microphone in Node,
// so it stops at "No microphone", having picked its track first.
import { test } from 'vitest';
import assert from 'node:assert/strict';

globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};

const { recordMelody } = await import('../src/whistle.ts');
const { hist, project, selected, status } = await import('@chordinal/ui');
const { emptyProject, addTrack, makeTrack } = await import('@chordinal/daw');
const { history } = await import('@chordinal/daw');

function start(): string {
  let p = emptyProject();
  const t = makeTrack(p, { name: 'Lead', instrument: { bank: 0, program: 73 } });
  p = addTrack(p, t);
  hist.value = history(p);
  return t.id;
}

test('Record Melody on a track selects it and records a melody', async () => {
  const id = start();
  selected.value = null;
  status.value = '';
  await recordMelody(id);
  assert.equal(selected.value, id);
  assert.match(status.value, /^No microphone/);
  assert.equal(project.value.tracks.length, 1, 'no track added before the microphone answered');
});
