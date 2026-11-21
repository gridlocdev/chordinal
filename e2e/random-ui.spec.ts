// Random use of the whole app: seeded runs of clicks on the visible controls and the canvas editors, commands from
// the ⌘K menu, keys and typing, checking after every step that the page threw nothing and that an open dialog
// still has the keyboard, and at the end that every dialog closes and the app reloads and still works.
//
//   just e2e random-ui          the default seeds (RUNS, from SEED_BASE, 3 from 1 unless set)
//   SEED=<n> just e2e random-ui  replay one seed, printing every step
//
// It never records: the Record button, R, and the recording commands are left out, and the scenarios' fixture fails
// a test that asks for the microphone. File pickers and downloads (Open, Import, Export, the library downloads) are
// left out too, and so is the clipboard, which in a browser can be the owner's real one.
import type { Locator, Page } from '@playwright/test';
import { commandMenu, expect, openApp, test, watchErrors } from './fixtures.ts';
import { createRandom, type Random } from './random.ts';

const STEPS = Number(process.env.STEPS ?? 40);
const runs = Number(process.env.RUNS ?? 3);
const base = Number(process.env.SEED_BASE ?? 1);
const seeds = process.env.SEED
  ? [Number(process.env.SEED)]
  : Array.from({ length: runs }, (_, i) => base + i);

/** the pause between steps, in ms */
const STEP_PAUSE_MS = 50;

/** ⌘K commands left out, by title: recording, file pickers, downloads, the clipboard, and leaving the page */
const SKIP_COMMANDS = [
  /record/i,
  /whistle/i,
  /^open/i,
  /^import/i,
  /^export/i,
  /^(cut|copy|paste)$/i,
  /read me/i,
  /show in finder/i,
  /^command menu/i,
];

/** controls left out, by accessible name: the Record button and the libraries' downloads */
const SKIP_CONTROLS = [/^record/i, /download/i];

/** keys worth pressing on their own: the app's shortcuts (docs/controls.md) but R, the exports, Open and the clipboard */
const KEYS = [
  'Escape',
  'Enter',
  'Tab',
  'Shift+Tab',
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Shift+ArrowUp',
  'Shift+ArrowDown',
  'Home',
  'End',
  'Backspace',
  'Delete',
  'KeyQ',
  'KeyM',
  'KeyC',
  'KeyB',
  'Comma',
  'Period',
  'Alt+Comma',
  'Alt+Period',
  'ControlOrMeta+KeyZ',
  'ControlOrMeta+Shift+KeyZ',
  'ControlOrMeta+KeyA',
  'ControlOrMeta+KeyD',
  'ControlOrMeta+KeyT',
  'ControlOrMeta+KeyJ',
  'ControlOrMeta+KeyP',
  'ControlOrMeta+KeyU',
  'ControlOrMeta+KeyS',
  'ControlOrMeta+KeyN',
  'ControlOrMeta+Alt+KeyN',
  'ControlOrMeta+Shift+KeyD',
  'ControlOrMeta+Backspace',
  'ControlOrMeta+Alt+ArrowUp',
  'ControlOrMeta+Alt+ArrowDown',
  'ControlOrMeta+Digit1',
  'ControlOrMeta+Digit2',
  'ControlOrMeta+Digit3',
  'ControlOrMeta+Equal',
  'ControlOrMeta+Minus',
  'ControlOrMeta+Digit0',
  'ControlOrMeta+KeyK',
  'ControlOrMeta+Slash',
];

/** Open ⌘K and click one of its enabled entries. Returns what was run, or why nothing was. */
async function runRandomCommand(page: Page, random: Random): Promise<string> {
  await page.keyboard.press('ControlOrMeta+KeyK');
  const menu = commandMenu(page);
  const opened = await menu
    .getByRole('combobox')
    .waitFor({ timeout: 1000 })
    .then(
      () => true,
      () => false,
    );
  // ⌘K doesn't open over another dialog: the per-step check makes sure that one kept the keyboard
  if (!opened) return 'command menu did not open';
  const options = menu.getByRole('option');
  const entries = await options.evaluateAll((items) =>
    items.map((item) => ({
      label: item.querySelector('.title')?.textContent?.trim() ?? '',
      enabled: item.getAttribute('aria-disabled') !== 'true',
    })),
  );
  const usable = entries
    .map((entry, i) => ({ ...entry, i }))
    .filter(({ label, enabled }) => enabled && !SKIP_COMMANDS.some((pattern) => pattern.test(label)));
  if (usable.length === 0) {
    await page.keyboard.press('Escape');
    return 'no command to run';
  }
  const chosen = random.pick(usable);
  const clicked = await options
    .nth(chosen.i)
    .click({ timeout: 1000 })
    .then(
      () => true,
      () => false,
    );
  if (!clicked && (await menu.count()) === 0) return `command menu was replaced before ${chosen.label}`;
  if (!clicked) throw new Error(`could not click ${chosen.label} in the command menu`);
  return `command ${chosen.label}`;
}

/** the controls a person could click now: in the open dialog if there is one, else anywhere */
async function visibleControls(page: Page): Promise<Locator[]> {
  const dialogs = page.locator('[role=dialog]');
  const scope = (await dialogs.count()) > 0 ? dialogs.last() : page.locator('body');
  const found: Locator[] = [];
  for (const role of ['button', 'tab', 'checkbox', 'combobox', 'slider', 'spinbutton', 'textbox'] as const) {
    for (const control of await scope.getByRole(role).all()) {
      if (!(await control.isVisible()) || !(await control.isEnabled())) continue;
      const name = (await control.getAttribute('aria-label')) ?? (await control.textContent()) ?? '';
      if (SKIP_CONTROLS.some((pattern) => pattern.test(name.trim()))) continue;
      found.push(control);
    }
  }
  return found;
}

/** Click a random visible control, or pick a random option of a menu. Returns what was done. */
async function clickRandomControl(page: Page, random: Random): Promise<string> {
  const controls = await visibleControls(page);
  if (controls.length === 0) return 'no control to click';
  const control = random.pick(controls);
  const what = await control.evaluate((el) => {
    const label = el.getAttribute('aria-label') ?? el.getAttribute('title') ?? el.textContent ?? '';
    return `${el.tagName.toLowerCase()} ${label.trim().slice(0, 40)}`;
  });
  if (what.startsWith('select')) {
    const values = await control
      .locator('option')
      .evaluateAll((options) =>
        options.map((option) => (option instanceof HTMLOptionElement ? option.value : '')),
      );
    const value = random.pick(values);
    await control.selectOption(value, { timeout: 1000 });
    return `choose ${value} in ${what}`;
  }
  // A control can go away while it's picked (a dialog closing); that's not a failure.
  const clicked = await control.click({ timeout: 1000 }).then(
    () => true,
    () => false,
  );
  return clicked ? `click ${what}` : `could not click ${what}`;
}

/** Click somewhere in the editor's canvas (the piano roll or the step grid), when it shows one. */
async function clickRandomCanvas(page: Page, random: Random): Promise<string> {
  for (const id of ['piano-roll', 'step-grid']) {
    const editor = page.getByTestId(id);
    if (!(await editor.isVisible())) continue;
    const box = await editor.boundingBox();
    if (!box) continue;
    const x = Math.floor(random.int(Math.max(1, Math.floor(box.width))));
    const y = Math.floor(random.int(Math.max(1, Math.floor(box.height))));
    const shift = random.int(4) === 0;
    const clicked = await editor
      .click({ position: { x, y }, modifiers: shift ? ['Shift'] : [], timeout: 1000 })
      .then(
        () => true,
        () => false,
      );
    return `${clicked ? 'click' : 'could not click'} ${id} at ${x},${y}${shift ? ' with Shift' : ''}`;
  }
  return 'no editor canvas';
}

/**
 * `text` as a person could type it where the keyboard is. Playwright types a character with no key (é, 漢字) by
 * inserting it as text, which lands in the last text field; no keyboard does that, so outside a text field only the
 * characters with keys are typed. R never is: it records.
 */
async function typeable(page: Page, text: string): Promise<string> {
  const inText = await page.evaluate(() => {
    const active = document.activeElement;
    const textInput = ['text', 'search', 'number'];
    if (active instanceof HTMLInputElement) return textInput.includes(active.type);
    return (
      active instanceof HTMLTextAreaElement || (active instanceof HTMLElement && active.isContentEditable)
    );
  });
  return inText ? text : text.replace(/[^\x20-\x7e\n\r]/g, '').replace(/r/gi, '');
}

/** Where the keyboard is, when a dialog is open and the keyboard is not in it; null otherwise. */
async function focusOutsideDialog(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('[role=dialog], [role=alertdialog]')];
    const active = document.activeElement;
    if (dialogs.length === 0 || dialogs.some((dialog) => dialog.contains(active))) return null;
    const label = active?.getAttribute('aria-label') ?? '';
    return `${active?.tagName.toLowerCase()} ${label} while ${dialogs.map((d) => d.getAttribute('aria-label')).join(', ')} is open`;
  });
}

/** After a run: Escape closes every dialog, and the app reloads and draws a project. */
async function checkSettled(page: Page): Promise<void> {
  const dialogs = page.locator('[role=dialog], [role=alertdialog]');
  for (let i = 0; i < 6 && (await dialogs.count()) > 0; i++) await page.keyboard.press('Escape');
  await expect(dialogs, 'Escape closes every dialog').toHaveCount(0);
  await openApp(page);
}

for (const runSeed of seeds) {
  test(`random use, seed ${runSeed}`, async ({ page }) => {
    const errors = watchErrors(page);
    // a reload with unsaved changes asks first (beforeunload); a person would leave
    page.on('dialog', (dialog) => void dialog.accept());
    page.on('popup', (popup) => {
      errors.push(`opened another page: ${popup.url()}`);
      void popup.close();
    });
    await openApp(page);

    const random = createRandom(runSeed);
    const log: string[] = [];
    try {
      for (let step = 0; step < STEPS; step++) {
        const roll = random.int(20);
        if (roll < 6) log.push(await clickRandomControl(page, random));
        else if (roll < 9) log.push(await clickRandomCanvas(page, random));
        else if (roll < 12) log.push(await runRandomCommand(page, random));
        else if (roll < 15) {
          const text = await typeable(page, random.text(8));
          log.push(`type ${JSON.stringify(text)}`);
          await page.keyboard.type(text);
        } else {
          const key = random.pick(KEYS);
          log.push(`key ${key}`);
          await page.keyboard.press(key);
        }
        // A person takes longer than this between steps; a dialog takes the keyboard a moment after it opens.
        await page.evaluate((ms) => new Promise((resolve) => setTimeout(resolve, ms)), STEP_PAUSE_MS);
        expect(errors, 'page errors').toEqual([]);
        expect(await focusOutsideDialog(page), 'an open dialog has the keyboard').toBeNull();
      }
      log.push('settle');
      await checkSettled(page);
      expect(errors, 'page errors').toEqual([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const steps = process.env.SEED ? log : log.slice(-20);
      throw new Error(`SEED=${runSeed} failed after:\n${steps.join('\n')}\n\n${message}`, { cause: error });
    } finally {
      if (process.env.SEED) console.log(`SEED=${runSeed}:\n${log.join('\n')}`);
    }
  });
}
