// Help ▸ Keyboard Shortcuts (⌘/): every command with a shortcut, by menu, written from the catalog so it can't drift;
// and the keys that aren't commands (musical typing, the command menu's list). Press a Shortcut shows what a key
// runs instead of running it, until Escape or Stop (commands/key-finder.ts).
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { keyFinder, overlay } from '../dialogs.ts';
import { restoreFocus } from '../focus.ts';
import { catalog } from '../commands.ts';
import { GROUPS, compact, endedMode, findKey, holdKeys } from '../commands/index.ts';
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
  const finder = keyFinder.value,
    finding = open && finder !== null;
  useLayoutEffect(() => {
    if (!open) return;
    back.current = document.activeElement;
    setQuery('');
    field.current?.focus();
  }, [open]);
  // the mode's listener: put on by the button itself, not by an effect that could run after the mode had ended, and
  // taken off by Escape, Stop, an error in it, or the window closing
  const stopFinding = useRef<(() => void) | null>(null);
  const startFinding = () => {
    stopFinding.current?.();
    keyFinder.value = { found: null };
    stopFinding.current = holdKeys(
      window,
      (e) => {
        const found = findKey(catalog, e);
        if (found) keyFinder.value = { found };
      },
      () => {
        stopFinding.current = null;
        keyFinder.value = null;
      },
    );
  };
  const endFinding = () => stopFinding.current?.();
  useEffect(() => {
    if (!open) endFinding();
  }, [open]);
  useEffect(() => endFinding, []);
  // the mode's buttons swap as it starts and ends, taking the focus with them: give it to the filter, so Escape and
  // Tab still work in the window
  useLayoutEffect(() => {
    if (open && !finding && !field.current?.closest('.dialog')?.contains(document.activeElement))
      field.current?.focus();
  }, [open, finding]);
  if (!open) return null;
  const close = () => {
    endFinding();
    overlay.value = null;
    restoreFocus(back.current);
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
          if (e.key === 'Escape' && !endedMode(e)) {
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
        <div class="key-finder">
          {finder ? (
            <>
              <p role="status" aria-live="polite">
                {finder.found ? (
                  <>
                    <kbd>{finder.found.keys}</kbd>{' '}
                    {finder.found.command ? `runs ${finder.found.command.title}` : 'runs no command'}
                  </>
                ) : (
                  'Press a key or a shortcut to see what it does. Esc stops.'
                )}
              </p>
              <button onClick={endFinding}>Stop</button>
            </>
          ) : (
            <button onClick={startFinding}>Press a Shortcut</button>
          )}
        </div>
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
