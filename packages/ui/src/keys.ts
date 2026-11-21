// The shortcuts the page answers: the plain keys (which must still type in a text field, and whose letters play notes
// while the piano roll has the focus), and the Cmd ones too where there's no menu bar. Which command a key is for is
// the catalog's to say (commands/catalog.ts).
import { appMenu } from './platform/app-menu.ts';
import { typing } from './platform/keys.ts';
import { catalog } from './commands.ts';
import { musicalTyping, takingKeys } from './focus.ts';
import type { KeyPress } from './commands/index.ts';

/** answers a key the menu bar doesn't: true when it did something */
export function handleKey(e: KeyPress): boolean {
  const c = catalog.forEvent(e, { typing: typing(), native: appMenu.native });
  if (!c) return false;
  const plainLetter = /^[a-z]$/.test(c.shortcutKey?.key ?? '') && !c.shortcutKey?.mod && !c.shortcutKey?.alt;
  // the piano roll's letters play notes, so a stray R or C between them doesn't record or loop; during a take, R
  // still stops it
  if (plainLetter && musicalTyping() && !(takingKeys.value && c.id === 'record')) return false;
  if (e.repeat && !c.repeats) return false;
  return catalog.run(c.id);
}
