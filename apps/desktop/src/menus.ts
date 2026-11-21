// The native menus: the page hands over its menu bar and right-click menus as plain items (packages/ui/src/platform/app-menu.ts)
// and gets back the id of the item picked. The bar gets the app menu and Window menu macOS expects around it. While a
// text field has focus, Edit items marked `text` do the field's own edit (undo, copy, paste…) instead, and items marked
// `field` drop their shortcut, so the key reaches the field (the bar is built again as focus moves in and out).
//
// Headless (for automated tests) a right-click menu isn't shown: it's kept as globalThis.contextMenu, for the test to
// click an item of.
import { Menu } from 'electron';
import type { MenuItemConstructorOptions, WebContents } from 'electron';
import type { Ipc } from './ipc.ts';

const MAC = process.platform === 'darwin';
type TextEdit = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll';
const TEXT: ReadonlySet<string> = new Set<TextEdit>(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']);
const isTextEdit = (s: string | undefined): s is TextEdit => s !== undefined && TEXT.has(s);

/** a menu item as the page hands it over */
export interface PageMenuItem {
  type?: 'separator';
  role?: MenuItemConstructorOptions['role'];
  id?: string;
  label?: string;
  enabled?: boolean;
  checked?: boolean;
  radio?: boolean;
  accelerator?: string;
  /** a shortcut shown but not registered (the page handles the key) */
  shown?: string;
  /** drops its shortcut while a text field has focus */
  field?: boolean;
  /** the text field's own edit, done instead while typing (or always, with `native`) */
  text?: string;
  native?: boolean;
  submenu?: PageMenuItem[];
}

export function installMenus(ipc: Ipc, { headless }: { headless: boolean }): void {
  let typing = false;
  /** the last bar handed over, and the page it came from, to build again when typing starts or stops */
  let last: [PageMenuItem[], WebContents] | null = null;

  const build = (items: PageMenuItem[], contents: WebContents): MenuItemConstructorOptions[] =>
    items.map((x): MenuItemConstructorOptions => {
      if (x.type === 'separator') return { type: 'separator' };
      if (x.role) return { role: x.role, ...(x.label && { label: x.label }) };
      const checkable = x.checked !== undefined;
      return {
        id: x.id,
        label: x.label,
        enabled: x.enabled ?? true,
        ...(checkable && { type: x.radio ? 'radio' : 'checkbox', checked: x.checked }),
        ...(x.accelerator && {
          accelerator: x.accelerator,
          ...(typing && x.field && { registerAccelerator: false }),
        }),
        ...(x.shown && { accelerator: x.shown, registerAccelerator: false }),
        ...(x.submenu && { submenu: build(x.submenu, contents) }),
        click: () => {
          if (isTextEdit(x.text) && (typing || x.native)) contents[x.text]();
          else contents.send('menu:pick', x.id);
        },
      };
    });

  const setBar = () => {
    if (!last) return;
    const [menus, sender] = last;
    const template = build(menus, sender);
    if (MAC) template.unshift({ role: 'appMenu' });
    const help = template.findIndex((m) => m.label === 'Help');
    template.splice(help < 0 ? template.length : help, 0, { role: 'windowMenu' });
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  };

  ipc.on('menu:typing', (_e, on: unknown) => {
    if (typing === !!on) return;
    typing = !!on;
    setBar();
  });

  ipc.on('menu:bar', (e, menus: PageMenuItem[]) => {
    last = [menus, e.sender];
    setBar();
  });

  ipc.on('menu:popup', (e, items: PageMenuItem[]) => {
    const menu = Menu.buildFromTemplate(build(items, e.sender));
    if (headless) (globalThis as typeof globalThis & { contextMenu?: Menu }).contextMenu = menu;
    else menu.popup();
  });
}
