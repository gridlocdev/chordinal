// With no menu bar (the browser), the page answers the Cmd shortcuts itself; while a text field has focus, the ones
// marked `field` are left to the field, so Cmd+Backspace deletes text there instead of the selected track. While the
// piano roll has the focus its letters play notes, so the plain-letter commands (B, C, M, Q, R) wait until it hasn't.
// While a take records, the letters play wherever the focus is, and R still stops the take.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import type { KeyPress } from '../src/index.ts';

globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};
class HTMLElement {
  tagName: string;
  type: string;
  isContentEditable = false;
  constructor(tag: string, type: string) {
    this.tagName = tag;
    this.type = type;
  }
}
// a pretend page: only the focused element is read
const page: { activeElement: HTMLElement | null } = { activeElement: null };
Object.assign(globalThis, { HTMLElement, document: page });

const { handleKey, isMac } = await import('../src/index.ts');
// the shortcut key: Cmd on a Mac, Ctrl elsewhere (the tests run on Linux and Windows too)
const cmd = (): Partial<KeyPress> => (isMac ? { metaKey: true } : { ctrlKey: true });
const { catalog } = await import('../src/index.ts');
const { hist, selected, settings, setSettings } = await import('../src/index.ts');
const { focus, musicalTyping, takingKeys } = await import('../src/index.ts');
const { musicalKey } = await import('../src/live.ts');
const { emptyProject, addTrack, makeTrack } = await import('@chordinal/daw');
const { history } = await import('@chordinal/daw');

const key = (code: string, mods: Partial<KeyPress> = {}): KeyPress => ({
  code,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  repeat: false,
  ...mods,
});

test('Cmd+Backspace deletes the track, but not while typing in a text field', () => {
  let p = emptyProject({ title: 'Keys' });
  p = addTrack(p, { ...makeTrack(p, { name: 'Keys' }), id: 't1' });
  hist.value = history(p);
  selected.value = 't1';
  const tracks = () => hist.value.present.tracks.length;
  const before = tracks();

  page.activeElement = new HTMLElement('INPUT', 'text');
  assert.equal(handleKey(key('Backspace', cmd())), false);
  assert.equal(tracks(), before);

  page.activeElement = null;
  assert.equal(handleKey(key('Backspace', cmd())), true);
  assert.equal(tracks(), before - 1);
});

test('the shortcuts left to a text field are the editing ones; File and View shortcuts still work while typing', () => {
  const field = catalog.all.filter((c) => c.field).map((c) => c.id);
  assert.deepEqual(field.sort(), [
    'deleteTrack',
    'duplicate',
    'duplicateTrack',
    'join',
    'makePattern',
    'newTrack',
    'split',
    'trackDown',
    'trackUp',
  ]);
  for (const id of ['save', 'saveAs', 'revert', 'zoomIn', 'roll']) assert.ok(!catalog.get(id)?.field, id);
});

test('the letters play notes only while the piano roll is showing and focused, and B toggles the browser everywhere else', () => {
  page.activeElement = null;
  setSettings({ editorTab: 'roll', browserOpen: false });
  focus.value = 'roll';
  assert.equal(musicalTyping(), true);
  assert.equal(handleKey(key('KeyB')), false, 'B is left to musical typing');
  assert.equal(settings.value.browserOpen, false);

  focus.value = 'arrange';
  assert.equal(musicalTyping(), false);
  assert.equal(handleKey(key('KeyB')), true);
  assert.equal(settings.value.browserOpen, true);

  focus.value = 'roll';
  setSettings({ editorTab: 'mixer' });
  assert.equal(musicalTyping(), false, 'the roll is not showing');
  assert.equal(handleKey(key('KeyB')), true);
  assert.equal(settings.value.browserOpen, false);
});

test('while a take records, the letters play notes wherever the focus is, and R still reaches Record', () => {
  page.activeElement = null;
  setSettings({ editorTab: 'mixer', browserOpen: false });
  focus.value = 'arrange';
  takingKeys.value = true;
  try {
    assert.equal(musicalTyping(), true);
    assert.equal(handleKey(key('KeyB')), false, 'B is a note during the take');
    assert.equal(settings.value.browserOpen, false);
    const command = catalog.get('record');
    assert.ok(command);
    const record = command.run;
    let stopped = 0;
    // the command's run is read-only in its type; the test swaps it for a counter and puts it back
    Object.assign(command, {
      run: () => {
        stopped++;
      },
    });
    try {
      assert.equal(handleKey(key('KeyR')), true);
    } finally {
      Object.assign(command, { run: record });
    }
    assert.equal(stopped, 1);
  } finally {
    takingKeys.value = false;
  }
});

test('musical typing keeps every letter it holds from the menu bar, which answers plain letters itself on macOS', () => {
  page.activeElement = null;
  setSettings({ editorTab: 'roll' });
  focus.value = 'roll';
  assert.equal(musicalKey(key('KeyA')), 'note', 'A is a note, not Show Automation');
  assert.equal(musicalKey(key('Semicolon')), 'note');
  assert.equal(
    musicalKey(key('KeyA', { repeat: true })),
    'note',
    'a held key repeats; its repeats are kept too',
  );
  assert.equal(musicalKey(key('KeyZ')), 'octave');
  for (const code of ['KeyB', 'KeyC', 'KeyM', 'KeyQ', 'KeyR'])
    assert.equal(musicalKey(key(code)), 'letter', code);
  assert.equal(musicalKey(key('Space')), null, 'Space still plays the song');
  assert.equal(musicalKey(key('KeyA', cmd())), null, 'Cmd+A still selects all');

  page.activeElement = new HTMLElement('INPUT', 'text');
  assert.equal(musicalKey(key('KeyA')), null, 'a text field takes its letters');
  page.activeElement = null;

  focus.value = 'arrange';
  assert.equal(musicalKey(key('KeyA')), null, 'outside the roll, A is Show Automation');
});
