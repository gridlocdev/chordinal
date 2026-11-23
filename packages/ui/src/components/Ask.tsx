// The question the app is asking, if any: a line of text, yes or no, or a choice, with Enter and Escape. Enter presses
// the button with the focus, which starts on the main answer.
import { useEffect, useRef } from 'preact/hooks';
import { asking, answer, OTHER } from '../ask.ts';

export function Ask() {
  const a = asking.value;
  const input = useRef<HTMLInputElement>(null);
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (a) (input.current ?? ok.current)?.focus();
    input.current?.select();
  }, [a]);
  if (!a) return null;
  const done = () => answer(a.value === null ? '' : input.current?.value.trim() || null);
  return (
    <div class="dialog-back" onPointerDown={(e) => e.target === e.currentTarget && answer(null)}>
      <div
        class="dialog ask"
        role="dialog"
        aria-label={a.text}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') answer(null);
          // Enter on a button presses that button (Tab or Shift+Tab may have moved to Don't Save or Cancel);
          // elsewhere, in the text field, it's the main answer
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.target instanceof HTMLButtonElement) e.target.click();
            else done();
          }
        }}
      >
        <p>{a.text}</p>
        {a.value !== null && <input ref={input} value={a.value} />}
        <div class="actions">
          {a.other && (
            <button class="other" onClick={() => answer(OTHER)}>
              {a.other}
            </button>
          )}
          <button onClick={() => answer(null)}>Cancel</button>
          <button ref={ok} class="primary" onClick={done}>
            {a.yes}
          </button>
        </div>
      </div>
    </div>
  );
}
