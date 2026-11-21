// Nothing plays while an export runs, from its start (loading the instruments) to its end (audit: Play pressed while
// an export loaded its instruments started live playback, which then ran on through the render).
import { test } from 'vitest';
import assert from 'node:assert/strict';

globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};

const { play } = await import('../src/index.ts');
const { busy } = await import('../src/index.ts');
const { exporting, playing, status } = await import('../src/index.ts');

test('Play during an export says to wait and plays nothing; the menus and keys wait too', async () => {
  exporting.value = true;
  try {
    await play();
    assert.equal(playing.value, false);
    assert.match(status.value, /Wait for the export/);
    assert.equal(busy(), true);
  } finally {
    exporting.value = false;
  }
  assert.equal(busy(), false);
});

test('an export marks itself from its start to its end, even when it fails', async () => {
  const { bounce } = await import('../src/index.ts');
  const seen: boolean[] = [];
  const stopWatch = exporting.subscribe((v) => seen.push(v));
  await bounce(); // no instruments can load here, so it fails and says so
  stopWatch();
  assert.deepEqual(seen, [false, true, false]);
  assert.match(status.value, /Couldn't export|No track|Exported/);
});
