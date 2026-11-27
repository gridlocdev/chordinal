// A shortcut written once, as `mod+shift+s`, `alt+,` or `space`: `mod` is Cmd on macOS and Ctrl elsewhere. The same
// value matches key presses, writes the label (⌘⇧S, or Ctrl+Shift+S) and gives Electron its accelerator, so the
// three never disagree.

export interface Shortcut {
  readonly key: string;
  readonly mod: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  /** a real Ctrl: ⌃ on macOS, the same key as `mod` elsewhere */
  readonly ctrl: boolean;
}

/** the parts of a key press a shortcut is matched against */
export interface KeyPress {
  readonly key?: string;
  readonly code: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly repeat?: boolean;
  readonly isComposing?: boolean;
}

export function parseShortcut(spec: string): Shortcut {
  const lower = spec.toLowerCase();
  const plus = lower.endsWith('++') || lower === '+';
  const parts = (plus ? lower.slice(0, -1) : lower).split('+');
  const last = parts.pop() ?? '';
  return {
    key: plus ? '+' : last,
    mod: parts.includes('mod'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    ctrl: parts.includes('ctrl'),
  };
}

export const isMac: boolean =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** keys by their physical place, so the Shift and Alt layers don't change what matches (Alt+, types ≤ on a Mac) */
const CODES: Record<string, string> = {
  Semicolon: ';',
  Equal: '=',
  Minus: '-',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Quote: "'",
  Space: 'space',
  Enter: 'enter',
  NumpadEnter: 'enter',
  Escape: 'esc',
  Backspace: 'backspace',
  Delete: 'delete',
  Tab: 'tab',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Home: 'home',
  End: 'end',
  PageUp: 'pageup',
  PageDown: 'pagedown',
};

/** which key was pressed, named as `parseShortcut` names it */
export function eventKey(e: KeyPress): string {
  const key = e.key ?? '';
  // the layout's own letter or digit wins (AZERTY's Cmd+Z is the key labelled Z) ...
  if (/^[a-z0-9]$/i.test(key)) return key.toLowerCase();
  // ... else the physical key
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase();
  if (/^Digit\d$/.test(e.code)) return e.code.slice(5);
  return CODES[e.code] ?? key.toLowerCase();
}

/**
 * How `e` matches `s`: 'exact' on the key with the same Shift, 'loose' when only the character does (a "+" typed with
 * Shift matches `mod++`). A loose match never beats an exact one.
 */
export function matchKind(s: Shortcut, e: KeyPress, mac = isMac): 'exact' | 'loose' | null {
  // on macOS `mod` is Cmd and `ctrl` is ⌃; elsewhere both are the one Ctrl key
  const modifiers = mac ? e.metaKey === s.mod && e.ctrlKey === s.ctrl : e.ctrlKey === (s.mod || s.ctrl);
  if (!modifiers || e.altKey !== s.alt) return null;
  if (eventKey(e) === s.key && e.shiftKey === s.shift) return 'exact';
  return !/^[a-z0-9]$/.test(s.key) && e.key === s.key && !s.shift ? 'loose' : null;
}

/** whether a shortcut would type text in a field: a plain key, or Shift and a key */
export const typesText = (s: Shortcut): boolean => !s.mod && !s.ctrl && !s.alt;

const MAC_SYMBOLS: Record<string, string> = {
  enter: '↩',
  esc: 'Esc',
  backspace: '⌫',
  delete: '⌦',
  tab: '⇥',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  pageup: '⇞',
  pagedown: '⇟',
  home: '↖',
  end: '↘',
};

const NAMES: Record<string, string> = { esc: 'Esc', pageup: 'Page Up', pagedown: 'Page Down' };

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** ⌘⇧S on macOS, Ctrl+Shift+S elsewhere */
export function formatShortcut(s: Shortcut, mac = isMac): string {
  const key =
    s.key.length === 1
      ? s.key.toUpperCase()
      : ((mac ? MAC_SYMBOLS[s.key] : undefined) ?? NAMES[s.key] ?? cap(s.key));
  if (mac) return `${s.ctrl ? '⌃' : ''}${s.alt ? '⌥' : ''}${s.shift ? '⇧' : ''}${s.mod ? '⌘' : ''}${key}`;
  return [(s.mod || s.ctrl) && 'Ctrl', s.alt && 'Alt', s.shift && 'Shift', key].filter(Boolean).join('+');
}

/** Electron's accelerator (CmdOrCtrl+Shift+S) */
export function toAccelerator(s: Shortcut): string {
  const names: Record<string, string> = {
    enter: 'Return',
    esc: 'Escape',
    up: 'Up',
    down: 'Down',
    left: 'Left',
    right: 'Right',
    '+': 'Plus',
    pageup: 'PageUp',
    pagedown: 'PageDown',
  };
  const key = names[s.key] ?? (s.key.length === 1 ? s.key.toUpperCase() : cap(s.key));
  return [s.mod && 'CmdOrCtrl', s.ctrl && 'Ctrl', s.alt && 'Alt', s.shift && 'Shift', key]
    .filter(Boolean)
    .join('+');
}
