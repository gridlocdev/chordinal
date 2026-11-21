// The status bar's notices and what it says about the letter keys, and the piano roll following their octave.
import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { NOTICE_MS, notify, showKeys, startNotices, status, statusTone, typedRange } from '@chordinal/ui';

test('a notice of what happened goes after a while; one under way and an error stay', () => {
  vi.useFakeTimers();
  const stop = startNotices();
  try {
    notify('Saved Demo');
    vi.advanceTimersByTime(NOTICE_MS - 1);
    assert.equal(status.value, 'Saved Demo');
    vi.advanceTimersByTime(1);
    assert.equal(status.value, '', 'gone after NOTICE_MS');

    notify('Bouncing…', 'busy');
    vi.advanceTimersByTime(NOTICE_MS * 3);
    assert.equal(status.value, 'Bouncing…', 'under way: stays');

    notify("Couldn't save Demo: disk full", 'error');
    vi.advanceTimersByTime(NOTICE_MS * 3);
    assert.equal(statusTone.value, 'error');
    assert.match(status.value, /Couldn't save/, 'an error stays until dismissed');

    notify('First');
    vi.advanceTimersByTime(NOTICE_MS - 100);
    notify('Second');
    vi.advanceTimersByTime(200);
    assert.equal(
      status.value,
      'Second',
      "a newer notice gets its own time, not what's left of the old one's",
    );
  } finally {
    stop();
    notify('');
    vi.useRealTimers();
  }
});

test('the letter keys play from C to F an octave up, octave 4 being middle C', () => {
  assert.deepEqual(typedRange(4), { lo: 60, hi: 77 });
  assert.deepEqual(typedRange(5), { lo: 72, hi: 89 });
});

test('the piano roll moves only as far as it must to show the keys played', () => {
  const v = { from: 0, ppb: 40, low: 54 };
  assert.equal(showKeys(v, 60, 77, 30), v, 'already in view: unchanged');
  assert.equal(showKeys(v, 72, 89, 30).low, 60, 'up: the highest key at the top');
  assert.equal(showKeys(v, 36, 53, 30).low, 36, 'down: the lowest key at the bottom');
  assert.equal(showKeys(v, 72, 89, 10).low, 72, 'too few lanes for them all: the lowest key at the bottom');
});
