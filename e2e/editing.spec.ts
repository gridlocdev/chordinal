// Editing notes in the piano roll, with undo and redo.
import {
  clickAt,
  expect,
  openApp,
  savedNotes,
  saveAs,
  storedProject,
  test,
  trackHeader,
  watchErrors,
} from './fixtures.ts';

/** the piano roll's keyboard at the left, and the chord names above the lanes (roll-view.ts) */
const GUTTER = 52;
const STRIP = 26;

test.describe('Editing', () => {
  test('notes added in the piano roll come back after undo and redo', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await trackHeader(page, 'Grand Piano').click();
    await page.getByRole('tab', { name: 'Piano Roll' }).click();
    const roll = page.getByTestId('piano-roll');
    await expect(roll).toBeVisible();

    // three notes, a beat apart (the view shows 40 px a beat), on different keys
    for (const [i, y] of [STRIP + 30, STRIP + 54, STRIP + 78].entries()) {
      await clickAt(page, 'piano-roll', GUTTER + 20 + i * 40, y);
    }
    // nothing picked, so the notes look the same however they came back
    await page.mouse.move(0, 0);
    await page.keyboard.press('Escape');
    const added = await roll.screenshot();

    for (let i = 0; i < 3; i++) await page.keyboard.press('ControlOrMeta+KeyZ');
    await expect(page).toHaveTitle('Untitled — Chordinal');
    expect((await roll.screenshot()).equals(added), 'undo takes the notes away').toBe(false);

    for (let i = 0; i < 3; i++) await page.keyboard.press('ControlOrMeta+Shift+KeyZ');
    await expect(page).toHaveTitle('• Untitled — Chordinal');
    await page.keyboard.press('Escape');
    await expect
      .poll(async () => (await roll.screenshot()).equals(added), { message: 'redo brings them back' })
      .toBe(true);

    await saveAs(page, 'Notes');
    const notes = savedNotes((await storedProject(page, 'Notes')) ?? '', 'Grand Piano');
    expect(notes).toHaveLength(3);
    expect(new Set(notes.map(([, , key]) => key)).size).toBe(3);
    expect(errors).toEqual([]);
  });

  test("a key pressed on the roll's keyboard or typed lights its row while it sounds", async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await trackHeader(page, 'Grand Piano').click();
    await page.getByRole('tab', { name: 'Piano Roll' }).click();
    const roll = page.getByTestId('piano-roll');
    await expect(roll).toBeVisible();
    const box = await roll.boundingBox();
    if (!box) throw new Error('no piano roll');
    // a pixel of the row out to the right, away from any note
    const y = STRIP + 100;
    const row = async () =>
      (
        await page.screenshot({ clip: { x: box.x + box.width - 40, y: box.y + y, width: 4, height: 2 } })
      ).toString('base64');
    const before = await row();

    await page.mouse.move(box.x + 10, box.y + y);
    await page.mouse.down();
    await expect.poll(row, { message: 'the row lights while the key is held' }).not.toBe(before);
    await page.screenshot({ path: test.info().outputPath('held-key.png') });
    await page.mouse.up();
    await expect.poll(row, { message: 'and goes back when it is let go' }).toBe(before);

    // the press gave the roll the focus, so the letter keys play it: A is C in the current octave
    const unlit = await roll.screenshot();
    await page.keyboard.down('KeyA');
    await expect
      .poll(async () => (await roll.screenshot()).equals(unlit), { message: 'a typed key lights its row' })
      .toBe(false);
    await page.screenshot({ path: test.info().outputPath('typed-key.png') });
    await page.keyboard.up('KeyA');
    await expect
      .poll(async () => (await roll.screenshot()).equals(unlit), { message: 'and lets it go with the key' })
      .toBe(true);

    await expect(page).toHaveTitle('Untitled — Chordinal');
    expect(errors).toEqual([]);
  });
  test('letters typed into the piano roll are kept from the shortcuts and the menu bar until the arrangement is clicked', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await trackHeader(page, 'Grand Piano').click();
    await page.getByRole('tab', { name: 'Piano Roll' }).click();
    await clickAt(page, 'piano-roll', 10, STRIP + 100); // a key on the roll's keyboard: the roll has the focus
    // a listener added after the app's: a key the page left unhandled would go on to the desktop app's menu bar, which
    // answers its plain-letter shortcuts itself on macOS (A is Show Automation, M mutes, B shows the browser)
    await page.evaluate(() => {
      const w = window as unknown as { unhandled: string[] };
      w.unhandled = [];
      addEventListener('keydown', (e) => {
        if (!e.defaultPrevented) w.unhandled.push(e.code + (e.repeat ? ' (repeat)' : ''));
      });
    });
    await page.keyboard.down('KeyA');
    await page.keyboard.down('KeyA'); // held: the key repeats
    await page.keyboard.up('KeyA');
    for (const code of ['KeyM', 'KeyB', 'KeyZ', 'Quote']) await page.keyboard.press(code);
    expect(await page.evaluate(() => (window as unknown as { unhandled: string[] }).unhandled)).toEqual([]);
    await expect(page.getByRole('combobox', { name: 'Grand Piano automation' })).toHaveCount(0);
    await expect(trackHeader(page, 'Grand Piano').locator('.mute.on')).toHaveCount(0);

    // a click on a track's header gives the keys back to the shortcuts: A shows its automation
    await trackHeader(page, 'Grand Piano').click();
    await page.keyboard.press('KeyA');
    await expect(page.getByRole('combobox', { name: 'Grand Piano automation' })).toHaveCount(1);
    expect(errors).toEqual([]);
  });
});
