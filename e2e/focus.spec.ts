// Focus (Chordinal PRD §5.11): the app draws the ring from its own state, never the browser's outline, and the keyboard
// focus follows that state through clicks, keys, commands, dialogs and undo.
import type { Page } from '@playwright/test';
import { expect, openApp, runCommand, test, watchErrors } from './fixtures.ts';

/** the selected track's header, by the app's state: its row has the class `on` */
const selectedHeader = (page: Page) => page.locator('.track.on .head');

/** how the element with the keyboard focus is drawn: its outline, and the focus colour from the theme */
const focusRing = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || el === document.body) return null;
    // a file picker's input is out of sight: its label shows the focus
    const shown =
      el.matches('label > input') && getComputedStyle(el).opacity === '0' && el.parentElement
        ? el.parentElement
        : el;
    const style = getComputedStyle(shown);
    const probe = document.createElement('div');
    probe.style.color = 'var(--focus)';
    document.body.append(probe);
    const focus = getComputedStyle(probe).color;
    probe.remove();
    return {
      what: el.outerHTML.slice(0, 120),
      was: `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).trim().split(/\s+/).join('.')}` : ''} ${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 20) ?? ''}`,
      style: style.outlineStyle,
      color: style.outlineColor,
      focus,
    };
  });

test.describe('Focus', () => {
  test('every stop on the Tab path shows the theme’s focus ring, never the browser’s outline', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await runCommand(page, 'New Track');
    const seen: string[] = [];
    const plays = () => seen.filter((s) => s.includes('aria-label="Play"')).length;
    // round the whole window and back to the transport: Tab isn't held in any part
    for (let i = 0; i < 300 && plays() < 2; i++) {
      await page.keyboard.press('Tab');
      const ring = await focusRing(page);
      if (!ring) continue;
      seen.push(ring.what);
      expect(ring.style, `${ring.what}: no browser outline`).not.toBe('auto');
      expect([ring.style, ring.color], `${ring.what}: the focus ring`).toEqual(['solid', ring.focus]);
    }
    expect(
      seen.some((s) => s.startsWith('<div class="head"')),
      'the selected track’s header is a stop',
    ).toBe(true);
    expect(plays(), 'Tab goes round the window, not stuck in a part').toBe(2);
    expect(errors).toEqual([]);
  });

  test('Next Track and Previous Track move the selection and the keyboard focus together', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await runCommand(page, 'New Track');
    await runCommand(page, 'New Track');
    const headers = page.locator('.track .head');
    await headers.first().click();
    await expect(headers.first()).toBeFocused();
    await page.keyboard.press('Alt+ArrowDown');
    await expect(page.locator('.track').nth(1)).toHaveClass(/\bon\b/);
    await expect(headers.nth(1)).toBeFocused();
    await expect(headers.nth(1)).toHaveCSS('outline-style', 'solid');
    await expect(headers.first()).toHaveCSS('outline-style', 'none');
    // from the piano roll, the keys bring the focus back to the arrangement
    await page.getByTestId('piano-roll').click({ position: { x: 200, y: 40 } });
    await expect(page.getByTestId('piano-roll')).toBeFocused();
    await expect(page.getByTestId('piano-roll')).toHaveCSS('outline-style', 'solid');
    await expect(headers.nth(1), 'one ring at a time').toHaveCSS('outline-style', 'none');
    await page.keyboard.press('Alt+ArrowUp');
    await expect(page.locator('.track').first()).toHaveClass(/\bon\b/);
    await expect(headers.first()).toBeFocused();
    await expect(page.getByTestId('piano-roll')).toHaveCSS('outline-style', 'none');
    expect(errors).toEqual([]);
  });

  test('the keyboard focus goes back to the selected track after a dialog closes and after an undo', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openApp(page);
    for (let i = 0; i < 3; i++) await runCommand(page, 'New Track');
    const count = await page.locator('.track').count();
    const second = page.locator('.track .head').nth(1);
    await second.click();
    for (const keys of ['ControlOrMeta+KeyK', 'ControlOrMeta+Slash']) {
      await page.keyboard.press(keys);
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(second, `after ${keys} closes`).toBeFocused();
    }
    // a dialog that doesn't hand the focus back itself: renaming the track
    await second.locator('.name').dblclick();
    await expect(page.getByRole('dialog')).toBeVisible();
    // Escape pressed as soon as the dialog shows is the dialog's: it takes the focus before it's painted
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(second, 'after the rename dialog closes').toBeFocused();
    // a command run from ⌘K moves the focus with the selection
    await runCommand(page, 'Next Track');
    await expect(page.locator('.track').nth(2)).toHaveClass(/\bon\b/);
    await expect(selectedHeader(page), 'the focus follows the selection').toBeFocused();
    // undo takes away the selected track: the focus lands on the track the state selects next, never the page
    await page.keyboard.press('ControlOrMeta+KeyZ');
    await expect(page.locator('.track')).toHaveCount(count - 1);
    await expect(selectedHeader(page)).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('with reduced motion, nothing transitions, and a menu opened from the keyboard takes the focus and closes on Escape', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openApp(page);
    // a very short transition still runs, and on visibility it keeps a menu that has just been shown from the focus
    const play = page.getByRole('button', { name: 'Play' });
    await expect(play).toHaveCSS('transition-property', 'none');
    await selectedHeader(page).click();
    await page.keyboard.press('ControlOrMeta+KeyK');
    const menu = page.getByRole('dialog');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('combobox').or(menu.locator('input')).first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(selectedHeader(page), 'Escape closed the menu, and the focus went back').toBeFocused();
    expect(errors).toEqual([]);
  });
});
