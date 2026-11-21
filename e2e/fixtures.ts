// Shared scenario setup. Every test gets a fresh browser profile from Playwright, so its IndexedDB (the projects) and
// localStorage (the settings) start empty, and the app starts the way it does on a first run: a new project (PRD §4.2).
// Nothing a test saves leaks into the next, and nothing here touches the owner's projects or settings.
import { expect, test as base, type Page } from '@playwright/test';

export { expect };

export const test = base.extend<{ microphone: string[] }>({
  // Every ask for the microphone is refused and noted; a scenario that asked fails. No test records anything.
  microphone: [
    async ({ page }, use) => {
      const asked: string[] = [];
      await page.exposeFunction('__e2eMicrophoneAsked', (what: string) => {
        asked.push(what);
      });
      await page.addInitScript(() => {
        const refuse = (what: string) => {
          void (
            window as unknown as { __e2eMicrophoneAsked: (w: string) => Promise<void> }
          ).__e2eMicrophoneAsked(what);
          return Promise.reject(new DOMException('no microphone in the scenarios', 'NotAllowedError'));
        };
        if (navigator.mediaDevices) {
          navigator.mediaDevices.getUserMedia = () => refuse('getUserMedia');
        }
      });
      await use(asked);
      expect(asked, 'nothing asked for the microphone').toEqual([]);
    },
    { auto: true },
  ],
  page: async ({ page }, use) => {
    // A step that hangs fails within a few seconds, naming the step, rather than at the test's own timeout.
    page.setDefaultTimeout(5000);
    await use(page);
  },
});

/** The transport's Play button: pressed while the project plays. */
export const playButton = (page: Page) => page.getByRole('button', { name: 'Play', exact: true });

/**
 * Open the app the way a user does, and wait until it has drawn the open project. The page finishes loading before
 * the app has read its settings and opened a project, and a key pressed sooner goes nowhere.
 */
export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await waitForApp(page);
}

/** The app has drawn a project: the transport, and the window's title naming the project. */
export async function waitForApp(page: Page): Promise<void> {
  await playButton(page).waitFor();
  await expect(page).toHaveTitle(/— Chordinal$/);
}

/**
 * Failed requests the app expects and handles, by status, method and URL. The test server doesn't serve the
 * SoundFont libraries, so an instrument from one can't load; the app says so in the status line and plays on.
 */
const EXPECTED: readonly { status: number; method: string; url: RegExp }[] = [
  { status: 404, method: 'GET', url: /\/soundfonts\// },
];

/**
 * Collect what went wrong on the page: uncaught errors, console errors and failed requests. The browser's own
 * "Failed to load resource" line names no URL, so the request is reported instead, with its URL.
 */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
      errors.push(message.text());
    }
  });
  page.on('response', (response) => {
    const status = response.status();
    const method = response.request().method();
    const url = response.url();
    if (
      status >= 400 &&
      !EXPECTED.some((e) => e.status === status && e.method === method && e.url.test(url))
    ) {
      errors.push(`${status} ${method} ${url}`);
    }
  });
  return errors;
}

/** The ⌘K menu: a dialog named "Command menu" holding a combobox, with an option for each command. */
export const commandMenu = (page: Page) => page.getByRole('dialog', { name: 'Command menu' });

/**
 * Run a command from ⌘K by its name. Type the way a person does: wait until focus is in the field, then use the
 * keyboard. `fill()` right after a field appears can land before the component has set itself up, and be lost.
 */
export async function runCommand(page: Page, name: string): Promise<void> {
  await page.keyboard.press('ControlOrMeta+KeyK');
  const menu = commandMenu(page);
  await expect(menu.getByRole('combobox')).toBeFocused();
  await page.keyboard.type(name);
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
}

/** A track's header in the arrangement: its name, mute, solo and volume. Double-click opens the track. */
export const trackHeader = (page: Page, name: string) => page.getByRole('group', { name: `${name} track` });

/**
 * Click the middle of a cell on a canvas editor: `(x, y)` in CSS pixels from its top left. The step grid and the
 * piano roll draw on a canvas, so a cell has no element of its own; this is where a person would click.
 */
export async function clickAt(page: Page, testId: string, x: number, y: number): Promise<void> {
  await page.getByTestId(testId).click({ position: { x, y } });
}

/** A project's file as the browser build keeps it (BrowserStore, in IndexedDB), or null if it was never saved. */
export async function storedProject(page: Page, name: string): Promise<string | null> {
  return page.evaluate(
    (key) =>
      new Promise<string | null>((resolve, reject) => {
        const open = indexedDB.open('chordinal', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('projects');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result.transaction('projects', 'readonly').objectStore('projects').get(key);
          get.onerror = () => reject(get.error);
          get.onsuccess = () => {
            const record: unknown = get.result;
            open.result.close();
            resolve(
              typeof record === 'object' &&
                record !== null &&
                'text' in record &&
                typeof record.text === 'string'
                ? record.text
                : null,
            );
          };
        };
      }),
    `project:${name}`,
  );
}

/** An object's field, or undefined: for reading a saved file without trusting its shape. */
const field = (x: unknown, key: string): unknown =>
  typeof x === 'object' && x !== null && key in x ? (x as Record<string, unknown>)[key] : undefined;
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

/**
 * The notes of a track in a saved project file, as `[beat, beats, key, velocity]`: every clip's, and for a pattern
 * clip (a drum track's clips are patterns) its pattern's.
 */
export function savedNotes(text: string, track: string): unknown[][] {
  const file: unknown = JSON.parse(text);
  const found = list(field(file, 'tracks')).find((t) => field(t, 'name') === track);
  if (!found) throw new Error(`no track ${track}`);
  const patterns = list(field(file, 'patterns'));
  return list(field(found, 'clips')).flatMap((clip) => {
    const id = field(clip, 'pattern');
    const notes =
      id === undefined
        ? field(clip, 'notes')
        : field(
            patterns.find((p) => field(p, 'id') === id),
            'notes',
          );
    return list(notes).map(list);
  });
}

/** The settings as the browser build keeps them (localStorage), once the app has written them. */
export async function storedSettings(page: Page): Promise<Record<string, unknown>> {
  const text = await page.evaluate(() => localStorage.getItem('chordinal.settings'));
  const parsed: unknown = text === null ? {} : JSON.parse(text);
  return typeof parsed === 'object' && parsed !== null ? { ...parsed } : {};
}

/** Save a new project under `name`: Save, then the name question the browser build asks instead of a folder. */
export async function saveAs(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const ask = page.getByRole('dialog', { name: 'Save the project as' });
  const field = ask.getByRole('textbox');
  await expect(field).toBeFocused();
  await page.keyboard.press('ControlOrMeta+KeyA');
  await page.keyboard.type(name);
  await page.keyboard.press('Enter');
  await expect(ask).toBeHidden();
  await expect(page.getByRole('status')).toHaveText(`Saved “${name}”`);
}
