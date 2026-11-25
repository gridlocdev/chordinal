import { test } from 'vitest';
import assert from 'node:assert/strict';
import { CommandCatalog, endedMode, findKey, holdKeys } from '@chordinal/ui';

type Listener = (e: Event) => void;

/** a window as far as key presses go: its capture listeners (the mode's) run before the page's own, as in a browser,
 * and an error in a listener is reported, not thrown out of the dispatch */
class FakeWindow {
  private readonly listeners: { fn: Listener; capture: boolean }[] = [];
  readonly errors: unknown[] = [];
  addEventListener(_type: string, fn: Listener, capture = false): void {
    this.listeners.push({ fn, capture });
  }
  removeEventListener(_type: string, fn: Listener, capture = false): void {
    const i = this.listeners.findIndex((l) => l.fn === fn && l.capture === capture);
    if (i >= 0) this.listeners.splice(i, 1);
  }
  dispatchEvent(e: Event): boolean {
    let stopped = false;
    const stop = e.stopImmediatePropagation.bind(e);
    e.stopImmediatePropagation = () => {
      stopped = true;
      stop();
    };
    const order = [...this.listeners.filter((l) => l.capture), ...this.listeners.filter((l) => !l.capture)];
    for (const l of order) {
      if (stopped) break;
      try {
        l.fn(e);
      } catch (err) {
        this.errors.push(err);
      }
    }
    return !e.defaultPrevented;
  }
}

/** a key press as the window gets it */
function press(target: FakeWindow, key: string, code: string) {
  const e = Object.assign(new Event('keydown', { cancelable: true }), {
    key,
    code,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
  });
  target.dispatchEvent(e);
  return e;
}

/** a window with the app's own key listener on it, which notes every key it gets */
function appWindow() {
  const win = new FakeWindow(),
    heard: string[] = [];
  win.addEventListener('keydown', (e) => heard.push((e as KeyboardEvent).key));
  return { win, heard };
}

const catalog = new CommandCatalog(
  [
    {
      id: 'play',
      group: 'Transport',
      title: 'Play or Stop',
      description: '',
      shortcut: 'space',
      run: () => {},
    },
    { id: 'save', group: 'File', title: 'Save', description: '', shortcut: 'mod+s', run: () => {} },
  ],
  true,
);

test('a key pressed in the mode shows the command it runs, or none, and runs nothing', () => {
  const e = (key: string, code: string, meta = false) => ({
    key,
    code,
    metaKey: meta,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
  });
  assert.deepEqual(
    [findKey(catalog, e(' ', 'Space')), findKey(catalog, e('s', 'KeyS', true))].map((f) => [
      f?.keys,
      f?.command?.id,
    ]),
    [
      ['Space', 'play'],
      ['⌘S', 'save'],
    ],
  );
  assert.equal(findKey(catalog, e('q', 'KeyQ'))?.command, undefined, 'Q runs no command');
  assert.equal(findKey(catalog, e('Meta', 'MetaLeft', true)), null, 'a modifier alone waits for its key');
});

test('the mode holds keys back from the app, and Escape ends it without being held', () => {
  const { win, heard } = appWindow(),
    seen: string[] = [];
  let ended = 0;
  holdKeys(
    win,
    (e) => seen.push(e.key),
    () => ended++,
  );
  const a = press(win, 'a', 'KeyA');
  assert.ok(a.defaultPrevented);
  assert.deepEqual([seen, heard], [['a'], []], 'the app gets nothing');
  const esc = press(win, 'Escape', 'Escape');
  assert.equal(ended, 1);
  assert.ok(!esc.defaultPrevented && endedMode(esc), 'Escape goes on, marked as the one that ended the mode');
  assert.deepEqual(heard, ['Escape']);
  press(win, 'b', 'KeyB');
  assert.deepEqual([seen, heard], [['a'], ['Escape', 'b']], 'after it, keys reach the app again');
});

test('the Stop button or the window closing ends the mode, once', () => {
  const { win, heard } = appWindow();
  let ended = 0;
  const end = holdKeys(
    win,
    () => {},
    () => ended++,
  );
  end();
  end();
  assert.equal(ended, 1);
  press(win, 'a', 'KeyA');
  assert.deepEqual(heard, ['a']);
});

test('a handler that throws ends the mode, and keys reach the app afterwards', () => {
  const { win, heard } = appWindow();
  let ended = 0;
  holdKeys(
    win,
    () => {
      throw new Error('broken');
    },
    () => ended++,
  );
  press(win, 'a', 'KeyA');
  assert.equal(win.errors.length, 1, 'the error is reported');
  assert.deepEqual(heard, [], 'the key that broke it is still held back');
  assert.equal(ended, 1, 'the mode ended');
  press(win, 'b', 'KeyB');
  press(win, ' ', 'Space');
  assert.deepEqual(heard, ['b', ' '], 'the next keys reach the app');
});
