// Help ▸ Keyboard Shortcuts (⌘/): every command with a shortcut, by menu, written from the catalog so it can't drift;
// and the keys that aren't commands (musical typing, the command menu's list).
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { overlay } from '../dialogs.ts';
import { catalog } from '../commands.ts';
import { GROUPS, compact } from '../commands/index.ts';
import type { Command } from '../commands/catalog.ts';

/** keys that aren't commands: what they do, and the keys */
const OTHER_KEYS: [what: string, keys: string][] = [
  [
    'Play the selected track’s instrument (click the piano roll first)',
    'A S D F G H J K L ; ’ and W E T Y U O P',
  ],
  ['An octave down or up while playing it', 'Z X'],
  ['Move through the command menu’s list', '↑ ↓ Tab'],
];

export function ShortcutsDialog() {
  const open = overlay.value === 'shortcuts';
  const [query, setQuery] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const back = useRef<Element | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    back.current = document.activeElement;
    setQuery('');
    field.current?.focus();
  }, [open]);
  if (!open) return null;
  const close = () => {
    overlay.value = null;
    if (back.current instanceof HTMLElement) back.current.focus();
  };
  const q = compact(query);
  const shows = (c: Command) =>
    !q || compact(`${c.title} ${c.description} ${c.keywords ?? ''} ${c.shortcutText}`).includes(q);
  return (
    <div class="dialog-back" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div
        class="dialog shortcuts"
        role="dialog"
        aria-label="Keyboard shortcuts"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            close();
          }
        }}
      >
        <h2>Keyboard Shortcuts</h2>
        <input
          ref={field}
          value={query}
          placeholder="Filter"
          aria-label="Filter the shortcuts"
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
        <div class="list">
          {GROUPS.map((g) => {
            const rows = catalog.all.filter((c) => c.group === g && c.shortcutKey && shows(c));
            return (
              rows.length > 0 && (
                <section key={g}>
                  <h3>{g}</h3>
                  <dl>
                    {rows.map((c) => [
                      <dt key={`${c.id}-t`} title={c.description}>
                        {c.title}
                      </dt>,
                      <dd key={`${c.id}-k`}>
                        <kbd>{c.shortcutText}</kbd>
                      </dd>,
                    ])}
                  </dl>
                </section>
              )
            );
          })}
          {!q && (
            <section>
              <h3>Other keys</h3>
              <dl>
                {OTHER_KEYS.map(([what, keys]) => [
                  <dt key={`${what}-t`}>{what}</dt>,
                  <dd key={`${what}-k`}>
                    <kbd>{keys}</kbd>
                  </dd>,
                ])}
              </dl>
            </section>
          )}
        </div>
        <div class="actions">
          <button class="primary" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
