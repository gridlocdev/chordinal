// Keeps docs/controls.md in step with the command catalog: every shortcut a command has is in the doc, in both the
// macOS and the Windows and Linux columns, and the doc lists no chord the catalog doesn't have.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};

const { catalog, CommandCatalog, formatShortcut } = await import('@chordinal/ui');
await import('../src/menu-bar.ts');

const doc = readFileSync(new URL('../../../docs/controls.md', import.meta.url), 'utf8');

/** the `code` spans in a cell */
const chords = (cell: string) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? '');

/** each table row with a macOS and a Windows and Linux column: the `code` spans in each */
const rows = doc
  .split('\n')
  .filter((line) => line.startsWith('|') && !/^\|\s*-/.test(line))
  .map((line) =>
    line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim()),
  )
  .filter((cells) => cells.length >= 3)
  .map(([label = '', mac = '', other = '']) => ({ label, mac: chords(mac), other: chords(other) }));

for (const mac of [true, false]) {
  const name = mac ? 'macOS' : 'Windows and Linux',
    column = mac ? 'mac' : 'other';
  // the same commands, labelled for that system
  const commands = new CommandCatalog(catalog.all, mac).all;

  test(`docs/controls.md lists every shortcut (${name})`, () => {
    const documented = new Set(rows.flatMap((r) => r[column]));
    const missing = commands
      .filter((c) => c.shortcutKey && !documented.has(c.shortcutText))
      .map((c) => `${c.id} ${c.shortcutText}`);
    assert.deepEqual(missing, []);
  });

  test(`docs/controls.md lists no shortcut the commands don't have (${name})`, () => {
    const known = new Set(
      commands.flatMap((c) => [c.shortcutText, ...c.alternateKeys.map((k) => formatShortcut(k, mac))]),
    );
    const stale = rows
      .flatMap((r) => r[column].map((chord) => ({ chord, label: r.label })))
      .filter(({ chord }) => !known.has(chord))
      .map(({ chord, label }) => `${label}: ${chord}`);
    assert.deepEqual(stale, []);
  });
}

test('every command has a description, and the titles are unique within their menu', () => {
  assert.deepEqual(
    catalog.all.filter((c) => !c.description).map((c) => c.id),
    [],
  );
  const seen = new Set<string>();
  for (const c of catalog.all) {
    const k = `${c.group}/${c.title}`;
    // the theme items are one set under View ▸ Theme
    if (!c.id.startsWith('theme')) assert.ok(!seen.has(k), `${k} twice`);
    seen.add(k);
  }
});
