// The window: the command menu, the Keyboard Shortcuts window, the theme, the status bar and wide parts scrolling
// sideways (Chordinal PRD §5.4–§5.9),
// and the browser's section dropdown (§7.3).
import {
  commandMenu,
  expect,
  openApp,
  runCommand,
  storedSettings,
  test,
  trackHeader,
  watchErrors,
} from './fixtures.ts';

test.describe('The window', () => {
  test('a mixer too wide for the editor scrolls inside it, and the window stays its own width', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openApp(page);
    for (let i = 0; i < 12; i++) await runCommand(page, 'New Track');
    await runCommand(page, 'Mixer');
    const widths = (selector: string) =>
      page.locator(selector).evaluate((e) => ({ shown: e.clientWidth, all: e.scrollWidth }));
    const app = await widths('.app');
    expect(app.all, 'nothing runs past the window').toBe(app.shown);
    const mixer = await widths('.mixer');
    expect(mixer.all, 'the strips run past the editor, to be scrolled to').toBeGreaterThan(mixer.shown);
    await expect(page.locator('.transport').getByRole('button', { name: 'Save as' })).toBeInViewport();
    // the last strip can be scrolled into view
    await page.locator('.mixer').evaluate((e) => e.scrollTo({ left: e.scrollWidth }));
    await expect(page.locator('.strip.master')).toBeInViewport();
    expect(errors).toEqual([]);
  });

  test('⌘K runs a command and Escape closes it', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await expect(page.getByRole('tab', { name: 'Piano Roll' })).toHaveAttribute('aria-selected', 'true');
    await runCommand(page, 'Mixer');
    await expect(page.getByRole('tab', { name: 'Mixer' })).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('ControlOrMeta+KeyK');
    await expect(commandMenu(page).getByRole('combobox')).toBeFocused();
    await expect(commandMenu(page).getByRole('option').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(commandMenu(page)).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('the command picked with ↑ and ↓ stays in view as the list scrolls', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await page.keyboard.press('ControlOrMeta+KeyK');
    const list = commandMenu(page).getByRole('listbox');
    const picked = list.getByRole('option', { selected: true });
    await expect(picked).toBeVisible();
    const inList = async () => {
      const [l, o] = [(await list.boundingBox())!, (await picked.boundingBox())!];
      return o.y >= l.y - 1 && o.y + o.height <= l.y + l.height + 1;
    };
    for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowDown');
    expect(await list.evaluate((e) => e.scrollTop), 'the list scrolled down').toBeGreaterThan(0);
    expect(await inList(), 'the 31st command is in view').toBe(true);
    for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowUp');
    expect(await inList(), 'back at the first, it is in view again').toBe(true);
    expect(await list.evaluate((e) => e.scrollTop)).toBe(0);
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });

  test('⌘/ lists the shortcuts and Escape closes it', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await page.keyboard.press('ControlOrMeta+Slash');
    const shortcuts = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(shortcuts).toContainText('Play or Stop');
    await expect(shortcuts).toContainText('Command Menu');
    await page.keyboard.press('Escape');
    await expect(shortcuts).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('the theme picked survives a reload', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    const html = page.locator('html');
    // the browser asks for light, and the setting starts at System
    await expect(html).toHaveAttribute('data-theme', 'light');

    await runCommand(page, 'Dark');
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect.poll(async () => (await storedSettings(page)).theme).toBe('dark');
    await openApp(page);
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({ path: test.info().outputPath('dark.png') });

    await runCommand(page, 'Light');
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect.poll(async () => (await storedSettings(page)).theme).toBe('light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await openApp(page);
    await expect(html).toHaveAttribute('data-theme', 'light');
    expect(errors).toEqual([]);
  });

  // found by random use (seed 1): opened from ⌘K, the dialog left the keyboard on the window behind it
  test('a dialog opened from ⌘K takes the keyboard', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await runCommand(page, 'Meter');
    const dialog = page.getByRole('dialog', { name: /^Meter/ });
    await expect(dialog.getByRole('textbox')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('the status bar says what the letter keys play, and Z and X move them and the piano roll', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openApp(page);
    const bar = page.locator('footer.status-bar');
    const keys = bar.getByText(/^Keys /);
    await expect(keys).toHaveText(/^Keys C4–F5/);
    await expect(keys).toHaveClass(/idle/);

    await trackHeader(page, 'Grand Piano').click();
    await page.getByRole('tab', { name: 'Piano Roll' }).click();
    const roll = page.getByTestId('piano-roll');
    const box = await roll.boundingBox();
    if (!box) throw new Error('no piano roll');
    // the roll's keyboard: a press gives the roll the focus without drawing a note
    await page.mouse.click(box.x + 10, box.y + box.height / 2);
    await expect(keys).not.toHaveClass(/idle/);
    await expect(page).toHaveTitle('Untitled — Chordinal');

    const before = await roll.screenshot();
    await page.keyboard.press('KeyX');
    await page.keyboard.press('KeyX');
    await expect(keys).toHaveText(/^Keys C6–F7/);
    await expect
      .poll(async () => (await roll.screenshot()).equals(before), { message: 'the roll scrolls up to them' })
      .toBe(false);
    await page.screenshot({ path: test.info().outputPath('status-bar.png') });
    await page.keyboard.press('KeyZ');
    await expect(keys).toHaveText(/^Keys C5–F6/);
    expect(errors).toEqual([]);
  });

  test("the browser's dropdown jumps to a section and follows the scroll", async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    const browser = page.locator('.browser');
    await browser.getByRole('button', { name: 'Instruments', exact: true }).click();
    const jump = browser.getByRole('combobox', { name: 'Go to section' });
    const sections = await jump.locator('option').allTextContents();
    expect(sections.length).toBeGreaterThan(1);
    await expect(jump).toHaveValue('0');

    const last = sections.length - 1;
    await jump.selectOption(String(last));
    const list = browser.locator('.list');
    const head = list.locator('.group', { hasText: sections[last] });
    await expect(head).toBeInViewport();
    const [listTop, headTop] = await Promise.all([list.boundingBox(), head.boundingBox()]);
    expect(Math.abs((headTop?.y ?? 0) - (listTop?.y ?? 0))).toBeLessThan(2);

    await list.evaluate((el) => el.scrollTo(0, 0));
    await expect(jump).toHaveValue('0');

    await browser.getByRole('button', { name: 'Kits', exact: true }).click();
    await expect(jump).toBeHidden();
    await browser.getByRole('button', { name: 'Projects', exact: true }).click();
    await expect(jump.locator('option')).toHaveText(['Recent', 'Documents/Chordinal']);
    expect(errors).toEqual([]);
  });
});
