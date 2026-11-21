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
});
