// The window: the command menu, the Keyboard Shortcuts window and the theme (Chordinal PRD §5.4, §5.5).
import { commandMenu, expect, openApp, runCommand, storedSettings, test, watchErrors } from './fixtures.ts';

test.describe('The window', () => {
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
  test('Generate Part… takes the keyboard when it opens', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await runCommand(page, 'Generate Part');
    const dialog = page.getByRole('dialog', { name: 'Generate part' });
    await expect(dialog.getByRole('combobox').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(errors).toEqual([]);
  });
});
