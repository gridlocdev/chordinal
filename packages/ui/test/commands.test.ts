import { test } from 'vitest';
import assert from 'node:assert/strict';
import { CommandCatalog, listStep } from '../src/commands/catalog.ts';
import type { CommandSpec } from '../src/commands/catalog.ts';
import { formatShortcut, parseShortcut, toAccelerator } from '../src/commands/shortcut.ts';
import type { KeyPress } from '../src/commands/shortcut.ts';

const ran: string[] = [];
const spec = (id: string, title: string, more: Partial<CommandSpec> = {}): CommandSpec => ({
  id,
  title,
  description: '',
  group: 'Edit',
  run: () => {
    ran.push(id);
  },
  ...more,
});

const make = () =>
  new CommandCatalog(
    [
      spec('newTrack', 'New Track', {
        group: 'Track',
        shortcut: 'mod+alt+n',
        field: true,
        keywords: 'add create',
      }),
      spec('exportAudio', 'Export as Audio File…', {
        group: 'File',
        shortcut: 'mod+b',
        keywords: 'bounce render',
      }),
      spec('undo', 'Undo', { shortcut: 'mod+z', text: 'undo' }),
      spec('delete', 'Delete', { shortcut: 'backspace', alternates: ['delete'] }),
      spec('play', 'Play or Stop', { group: 'Transport', shortcut: 'space' }),
      spec('prevMarker', 'Previous Marker', { group: 'Transport', shortcut: 'alt+,' }),
      spec('zoomIn', 'Zoom In', { group: 'View', shortcut: 'mod+=', alternates: ['mod++'] }),
      spec('off', 'Never Enabled', { enabled: () => false }),
      spec('palette', 'Command Menu…', { group: 'View', shortcut: 'mod+k', hidden: true }),
    ],
    true,
  );

const key = (code: string, more: Partial<KeyPress> = {}): KeyPress => ({
  code,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...more,
});
const page = { typing: false, native: false };

test('shortcuts are written once: matched, labelled and given to Electron from the same text', () => {
  const s = parseShortcut('mod+shift+s');
  assert.equal(formatShortcut(s, true), '⇧⌘S');
  assert.equal(formatShortcut(s, false), 'Ctrl+Shift+S');
  assert.equal(toAccelerator(s), 'CmdOrCtrl+Shift+S');
  assert.equal(formatShortcut(parseShortcut('alt+,'), true), '⌥,');
  assert.equal(toAccelerator(parseShortcut('enter')), 'Return');
  assert.equal(formatShortcut(parseShortcut('esc'), false), 'Esc');
});

test('a key press finds its command, by the layout’s letter or the physical key', () => {
  const c = make();
  assert.equal(c.forEvent(key('KeyN', { metaKey: true, altKey: true, key: '˜' }), page)?.id, 'newTrack');
  assert.equal(c.forEvent(key('Space', { key: ' ' }), page)?.id, 'play');
  assert.equal(c.forEvent(key('Delete'), page)?.id, 'delete', 'an alternate key');
  assert.equal(c.forEvent(key('Comma', { altKey: true, key: '≤' }), page)?.id, 'prevMarker');
  assert.equal(
    c.forEvent(key('Equal', { metaKey: true, shiftKey: true, key: '+' }), page)?.id,
    'zoomIn',
    'Cmd + typed with Shift',
  );
  assert.equal(c.forEvent(key('KeyN', { ctrlKey: true }), page), undefined, 'Ctrl is not Cmd on a Mac');
  assert.equal(
    c.forEvent(key('KeyZ', { metaKey: true, isComposing: true }), page),
    undefined,
    'the input method’s keys',
  );
});

test('in a text field, plain keys type, and Edit’s keys and `field` ones are left to it', () => {
  const c = make();
  const typing = { typing: true, native: false };
  assert.equal(c.forEvent(key('Space', { key: ' ' }), typing), undefined);
  assert.equal(c.forEvent(key('KeyZ', { metaKey: true }), typing), undefined);
  assert.equal(c.forEvent(key('KeyN', { metaKey: true, altKey: true }), typing), undefined);
  assert.equal(c.forEvent(key('KeyB', { metaKey: true }), typing)?.id, 'exportAudio');
});

test('with a native menu bar the page leaves the Cmd keys to it', () => {
  const c = make();
  const native = { typing: false, native: true };
  assert.equal(c.forEvent(key('KeyB', { metaKey: true }), native), undefined);
  assert.equal(c.forEvent(key('Space'), native)?.id, 'play');
  const items = [c.menuItem('exportAudio'), c.menuItem('play')];
  assert.equal(items[0]?.accelerator, 'CmdOrCtrl+B');
  assert.equal(items[0]?.shown, undefined);
  assert.equal(items[1]?.shown, 'Space', 'a plain key is shown, not registered');
  assert.equal(items[1]?.accelerator, undefined);
});

test('run checks enabled and the gate, and keeps the last five for ⌘K', () => {
  const c = make();
  ran.length = 0;
  assert.equal(c.run('off'), false);
  c.gate = () => false;
  assert.equal(c.run('play'), false);
  c.gate = () => true;
  for (const id of ['play', 'undo', 'delete', 'zoomIn', 'newTrack', 'exportAudio', 'play', 'palette'])
    c.run(id);
  assert.deepEqual(ran, ['play', 'undo', 'delete', 'zoomIn', 'newTrack', 'exportAudio', 'play', 'palette']);
  assert.deepEqual(
    c.recentIds,
    ['play', 'exportAudio', 'newTrack', 'zoomIn', 'delete'],
    'hidden commands are not kept',
  );
  assert.equal(c.search('')[0]?.id, 'play', 'recent first when nothing is typed');
  ran.length = 0;
  c.menuItem('undo', { run: () => ran.push('with arguments') }).run();
  assert.deepEqual(ran, ['with arguments']);
});

test('⌘K finds a command however its name is typed', () => {
  const c = make();
  for (const q of ['newtrack', 'new tr', 'New Track', 'nwtrk', 'add'])
    assert.equal(c.search(q)[0]?.id, 'newTrack', q);
  assert.equal(c.search('bounce')[0]?.id, 'exportAudio', 'a keyword');
  assert.deepEqual(c.search('qqqq'), []);
  assert.ok(!c.search('command').some((x) => x.id === 'palette'), 'hidden from ⌘K');
  assert.ok(
    c.search('never').some((x) => x.id === 'off'),
    'disabled commands stay in the list',
  );
});

test('an id used twice throws', () => {
  const c = make();
  assert.throws(() => c.add([spec('play', 'Again')]), /defined twice/);
});

test('the list picker’s keys stop at the ends', () => {
  assert.equal(listStep(key('ArrowDown'), 0, 3), 1);
  assert.equal(listStep(key('Tab'), 2, 3), 2);
  assert.equal(listStep(key('Tab', { shiftKey: true }), 1, 3), 0);
  assert.equal(listStep(key('ArrowUp'), 0, 3), 0);
  assert.equal(listStep(key('Tab', { metaKey: true }), 0, 3), undefined);
  assert.equal(listStep(key('KeyA'), 0, 3), undefined);
});
