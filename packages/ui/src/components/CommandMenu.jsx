// ⌘K: every command, found by typing part of its name (or another word for it), run with Enter. Disabled commands
// stay in the list, greyed, so people learn they exist. The field keeps the focus; the list is a listbox it points into.
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { overlay } from '../dialogs.ts';
import { catalog } from '../commands.ts';
import { listStep } from '../commands/index.ts';

export function CommandMenu()
{
    const open = overlay.value === 'commands';
    const [query, setQuery] = useState('');
    const [index, setIndex] = useState(0);
    const field = useRef(/** @type {HTMLInputElement|null} */ (null));
    const back = useRef(/** @type {Element|null} */ (null));
    useLayoutEffect(()=>
    {
        if (!open) return;
        back.current = document.activeElement;
        setQuery('');
        setIndex(0);
        field.current?.focus();
    }, [open]);
    if (!open) return null;
    const found = catalog.search(query);
    const at = Math.min(index, Math.max(0, found.length - 1));
    const close = ()=>
    {
        overlay.value = null;
        if (back.current instanceof HTMLElement) back.current.focus();
    };
    const runAt = (i)=>
    {
        const c = found[i];
        if (!c || !catalog.isEnabled(c)) return;
        close();
        catalog.run(c.id);
    };
    const keyDown = (e)=>
    {
        e.stopPropagation();
        const step = listStep(e, at, found.length);
        if (step !== undefined) { e.preventDefault(); setIndex(step); return; }
        if (e.isComposing) return;
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        else if (e.key === 'Enter') { e.preventDefault(); runAt(at); }
        else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); close(); }
    };
    return (
        <div class="dialog-back" onPointerDown={(e)=> e.target === e.currentTarget && close()}>
            <div class="dialog command-menu" role="dialog" aria-label="Command menu" onKeyDown={keyDown}>
                <input ref={field} value={query} placeholder="Type a command" role="combobox" aria-expanded="true"
                    aria-controls="command-list" aria-activedescendant={found[at] ? `command-${found[at].id}` : undefined}
                    onInput={(e)=> { setQuery(e.currentTarget.value); setIndex(0); }} />
                <ul id="command-list" role="listbox" aria-label="Commands">
                    {found.length === 0 && <li class="empty">No command matches “{query}”.</li>}
                    {found.map((c, i)=> (
                        <li key={c.id} id={`command-${c.id}`} role="option" aria-selected={i === at} aria-disabled={!catalog.isEnabled(c)}
                            class={`${i === at ? 'on' : ''} ${catalog.isEnabled(c) ? '' : 'off'}`}
                            onPointerMove={()=> i !== at && setIndex(i)} onClick={()=> runAt(i)}>
                            <span class="title">{c.title}</span>
                            <span class="group">{c.group}</span>
                            {c.shortcutText && <kbd>{c.shortcutText}</kbd>}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
