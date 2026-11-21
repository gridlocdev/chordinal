import { test } from 'vitest';
import assert from 'node:assert/strict';
import type { BrowserWindow } from 'electron';
import { screenCalls } from '../src/headless-screen.ts';

/** what a headless run keeps on globalThis (headless-screen.ts) */
const g = globalThis as typeof globalThis & {
  headlessPrompts: { kind: string; what: unknown }[];
  headlessAnswers: { saveDialog: string[]; openDialog: string[] };
};
/** no window: a headless run never uses it */
const win = null as unknown as BrowserWindow;

/** a stand-in for electron's dialog and shell that fails the test if anything reaches it */
function forbidden() {
  const no = (name: string) => () => assert.fail(`${name} was called in a headless run`);
  return {
    dialog: {
      showSaveDialog: no('showSaveDialog'),
      showOpenDialog: no('showOpenDialog'),
      showMessageBoxSync: no('showMessageBoxSync'),
    },
    shell: {
      openPath: no('openPath'),
      openExternal: no('openExternal'),
      showItemInFolder: no('showItemInFolder'),
    },
  };
}

test('a headless run shows no dialog or Finder window, and keeps what it would have shown', async () => {
  const s = screenCalls({ headless: true, ...forbidden() });
  assert.deepEqual(await s.saveDialog(win, { title: 'a' }), { canceled: true, filePath: '' });
  assert.deepEqual(await s.openDialog(win, { title: 'b' }), { canceled: true, filePaths: [] });
  assert.equal(s.askToClose(win, { message: 'Close without saving?' }), true);
  await s.openPath('/x.md');
  await s.openExternal('https://example.com');
  s.showInFolder('/y');
  assert.deepEqual(
    g.headlessPrompts.map((p) => p.kind),
    ['saveDialog', 'openDialog', 'askToClose', 'openPath', 'openExternal', 'showInFolder'],
  );
  assert.equal(g.headlessPrompts.at(-1)?.what, '/y');
});

test('a headless test can queue what a dialog answers, once', async () => {
  const s = screenCalls({ headless: true, ...forbidden() });
  g.headlessAnswers.saveDialog.push('/tmp/Song');
  g.headlessAnswers.openDialog.push('/tmp/Other/project.json');
  assert.deepEqual(await s.saveDialog(win, {}), { canceled: false, filePath: '/tmp/Song' });
  assert.deepEqual(await s.saveDialog(win, {}), { canceled: true, filePath: '' });
  assert.deepEqual(await s.openDialog(win, {}), { canceled: false, filePaths: ['/tmp/Other/project.json'] });
});
