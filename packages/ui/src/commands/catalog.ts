// The one command catalog: the keys, the menu bar, the right-click menus, ⌘K, the Keyboard Shortcuts window and
// docs/controls.md all read it, and every command runs through `run`, which checks that it's enabled and that no
// dialog is in the way, and keeps the last few for ⌘K.
import { formatShortcut, isMac, matchKind, parseShortcut, toAccelerator } from './shortcut.ts';
import type { KeyPress, Shortcut } from './shortcut.ts';

/** the menu bar's menus, in order; also the Keyboard Shortcuts window's sections */
export const GROUPS = ['File', 'Edit', 'Track', 'Transport', 'View', 'Help'] as const;
export type CommandGroup = (typeof GROUPS)[number];

/** a text field's own edits, which Edit's items do instead while one has focus */
export type TextEdit = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll';

export interface CommandSpec {
  readonly id: string;
  /** the menu label, in Title Case, with … when a dialog follows */
  readonly title: string;
  /** one sentence, shown in ⌘K and the Keyboard Shortcuts window */
  readonly description: string;
  readonly group: CommandGroup;
  /** `mod+s`, `shift+up`, `space`: see shortcut.ts */
  readonly shortcut?: string;
  /** other keys that do the same, not shown (Delete beside Backspace) */
  readonly alternates?: readonly string[];
  /** other words people type for it in ⌘K */
  readonly keywords?: string;
  readonly run: () => unknown;
  /** greyed out (and left alone by its keys) when false */
  readonly enabled?: () => boolean;
  /** a toggle: whether it's on */
  readonly checked?: () => boolean;
  /** one of a set (the editor's tabs, the theme) */
  readonly radio?: boolean;
  /** while a text field has focus, the field does this edit itself */
  readonly text?: TextEdit;
  /** while a text field has focus, its key is left to the field (Cmd+Backspace deletes to the line's start there) */
  readonly field?: boolean;
  /** a held key repeats it (transpose, nudge, a bar on) */
  readonly repeats?: boolean;
  /** left out of ⌘K (⌘K itself) */
  readonly hidden?: boolean;
  /** runs while the command menu or the Keyboard Shortcuts window is open, to swap one for the other */
  readonly global?: boolean;
}

export interface Command extends CommandSpec {
  readonly shortcutKey: Shortcut | null;
  readonly alternateKeys: readonly Shortcut[];
  /** the label of its shortcut (⌘S, or Ctrl+S), or '' */
  readonly shortcutText: string;
}

/** a command as the menus take it (packages/ui/src/platform/app-menu.ts) */
export interface CommandMenuItem {
  id: string;
  label: string;
  /** a shortcut the native menu answers itself (a Cmd one) */
  accelerator?: string;
  /** one the page answers (a plain key), only written beside the label */
  shown?: string;
  text?: TextEdit;
  field?: boolean;
  radio?: boolean;
  enabled: boolean;
  checked?: boolean;
  run: () => void;
}

/** where a key press lands: in a text field, and whether a native menu bar answers the Cmd shortcuts */
export interface KeyContext {
  readonly typing: boolean;
  readonly native: boolean;
}

/** the native menu bar answers shortcuts with Cmd (or Ctrl); the page answers the rest */
export const menuAnswers = (s: Shortcut): boolean => s.mod || s.ctrl;

const RECENT = 5;

export class CommandCatalog {
  private readonly list: Command[] = [];
  private readonly byId = new Map<string, Command>();
  private readonly recent: string[] = [];
  readonly mac: boolean;
  /** whether a command may run now: false while a dialog is open (set by the app) */
  gate: (c: Command) => boolean = () => true;

  constructor(specs: readonly CommandSpec[] = [], mac = isMac) {
    this.mac = mac;
    this.add(specs);
  }

  /** adds commands (an app adds its own beside the shared ones); an id used twice throws */
  add(specs: readonly CommandSpec[]): void {
    for (const s of specs) {
      if (this.byId.has(s.id)) throw new Error(`command ${s.id} is defined twice`);
      const key = s.shortcut ? parseShortcut(s.shortcut) : null;
      const c: Command = {
        ...s,
        shortcutKey: key,
        alternateKeys: (s.alternates ?? []).map(parseShortcut),
        shortcutText: key ? formatShortcut(key, this.mac) : '',
      };
      this.list.push(c);
      this.byId.set(c.id, c);
    }
  }

  get all(): readonly Command[] {
    return this.list;
  }

  get(id: string): Command | undefined {
    return this.byId.get(id);
  }

  isEnabled(c: Command): boolean {
    return c.enabled?.() ?? true;
  }

  /** runs a command if it's enabled and nothing is in the way: true when it ran */
  run(id: string, run?: () => unknown): boolean {
    const c = this.byId.get(id);
    if (!c || !this.isEnabled(c) || !this.gate(c)) return false;
    if (!c.hidden) {
      const at = this.recent.indexOf(id);
      if (at >= 0) this.recent.splice(at, 1);
      this.recent.unshift(id);
      this.recent.length = Math.min(this.recent.length, RECENT);
    }
    // run at once, inside the key press or click (starting audio needs that); an async command's failure is logged
    const out = (run ?? c.run)();
    if (out instanceof Promise) out.catch((e: unknown) => console.error(`command ${id} failed`, e));
    return true;
  }

  get recentIds(): readonly string[] {
    return this.recent;
  }

  /**
   * The command a key press is for, if the page should answer it: plain keys never while typing (they type), Cmd keys
   * not where the native menu bar answers them, and the Edit keys and those marked `field` are left to a text field.
   */
  forEvent(e: KeyPress, where: KeyContext): Command | undefined {
    if (e.isComposing) return undefined;
    const answers = (c: Command, k: Shortcut) =>
      menuAnswers(k) ? !where.native && !(where.typing && (c.text || c.field)) : !where.typing;
    const find = (kind: 'exact' | 'loose') =>
      this.list.find((c) =>
        [c.shortcutKey, ...c.alternateKeys].some(
          (k) => k !== null && matchKind(k, e, this.mac) === kind && answers(c, k),
        ),
      );
    return find('exact') ?? find('loose');
  }

  /**
   * ⌘K's search. Spaces don't count ("newtrack" and "new tr" both find New Track). Best first: the title starts with
   * the query, then holds it, then the group, keywords or description do (or every typed word is somewhere), then the
   * title has the query's letters in order. With nothing typed, the recent commands come first.
   */
  search(query: string): Command[] {
    const q = compact(query);
    const visible = this.list.filter((c) => !c.hidden);
    if (!q) {
      const recent = this.recent.flatMap((id) => {
        const c = this.byId.get(id);
        return c && !c.hidden ? [c] : [];
      });
      return [...recent, ...visible.filter((c) => !recent.includes(c))];
    }
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const scored: [Command, number][] = [];
    for (const c of visible) {
      const title = compact(c.title);
      const rest = `${c.group} ${c.keywords ?? ''} ${c.description}`.toLowerCase();
      const score = title.startsWith(q)
        ? 0
        : title.includes(q)
          ? 1
          : compact(rest).includes(q) || words.every((w) => `${c.title.toLowerCase()} ${rest}`.includes(w))
            ? 2
            : inOrder(q, title)
              ? 3
              : -1;
      if (score >= 0) scored.push([c, score]);
    }
    // a stable sort keeps the catalog's order between equal scores
    return scored.sort((a, b) => a[1] - b[1]).map(([c]) => c);
  }

  /** a command as a menu item; `extra` changes its label, or runs it with arguments */
  menuItem(id: string, extra: { label?: string; run?: () => unknown } = {}): CommandMenuItem {
    const c = this.byId.get(id);
    if (!c) throw new Error(`no command ${id}`);
    const k = c.shortcutKey;
    return {
      id,
      label: extra.label ?? c.title,
      ...(k && (menuAnswers(k) ? { accelerator: toAccelerator(k) } : { shown: toAccelerator(k) })),
      ...(c.text && { text: c.text }),
      ...(c.field && { field: true }),
      ...(c.radio && { radio: true }),
      enabled: this.isEnabled(c),
      ...(c.checked && { checked: c.checked() }),
      // the bar is built again a moment after a change, so a click can come after the command was disabled
      run: () => {
        this.run(id, extra.run);
      },
    };
  }
}

/** lower case with every space taken out: what ⌘K compares */
export const compact = (text: string): string => text.toLowerCase().replace(/\s+/g, '');

/** whether every letter of `needle` is in `hay`, in order, with gaps */
export function inOrder(needle: string, hay: string): boolean {
  let at = 0;
  for (const ch of needle) {
    at = hay.indexOf(ch, at) + 1;
    if (at === 0) return false;
  }
  return true;
}

/** a list picker's keys (⌘K): Down and Tab move down, Up and Shift+Tab up, stopping at the ends; else undefined */
export function listStep(e: KeyPress, index: number, count: number): number | undefined {
  if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return undefined;
  const down = e.code === 'ArrowDown' || (e.code === 'Tab' && !e.shiftKey);
  const up = e.code === 'ArrowUp' || (e.code === 'Tab' && e.shiftKey);
  if (down) return Math.min(count - 1, index + 1);
  if (up) return Math.max(0, index - 1);
  return undefined;
}
