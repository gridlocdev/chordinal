// The browser build keeps its settings in localStorage when there is no desktop app.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { browserStorage, SETTINGS_KEY } from '../src/platform/storage.ts';

function fakeLocal() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
  };
}

test('settings written to localStorage load back; nothing kept loads as no settings', async () => {
  const local = fakeLocal();
  const s = browserStorage(local);
  assert.deepEqual(await s.load(), {});
  await s.write({ theme: 'dark', zoom: 2 });
  assert.equal(local.items.get(SETTINGS_KEY), '{"theme":"dark","zoom":2}');
  assert.deepEqual(await browserStorage(local).load(), { theme: 'dark', zoom: 2 });
});
