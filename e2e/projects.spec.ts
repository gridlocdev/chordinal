// Start-up, saving and reopening, and New (Chordinal PRD §4), in the browser build: projects in IndexedDB.
import {
  expect,
  openApp,
  savedNotes,
  saveAs,
  storedProject,
  storedSettings,
  test,
  trackHeader,
  watchErrors,
} from './fixtures.ts';

test.describe('Projects', () => {
  test('the first start opens a new project, with no errors', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    // §4.2 and §4.3: a new project at once, saying nothing: 120 bpm, 4/4, a drum track and a Grand Piano track
    await expect(page).toHaveTitle('Untitled — Chordinal');
    await expect(trackHeader(page, 'Drums')).toBeVisible();
    await expect(trackHeader(page, 'Grand Piano')).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: /^Tempo/ })).toHaveValue('120');
    await expect(page.getByRole('textbox', { name: /^Meter/ })).toHaveValue('4/4');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('start.png') });
    expect(errors).toEqual([]);
  });

  test('a saved project comes back after a reload', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await page.getByRole('spinbutton', { name: /^Tempo/ }).fill('96');
    await page.keyboard.press('Enter');
    await expect(page).toHaveTitle('• Untitled — Chordinal');

    await saveAs(page, 'Night Drive');
    await expect(page).toHaveTitle('Night Drive — Chordinal');
    // the disk, not just the screen: the browser's store has the file, and the settings name it as the last project
    const text = await storedProject(page, 'Night Drive');
    expect(text).toContain('"bpm": 96');
    expect(savedNotes(text ?? '', 'Grand Piano')).toEqual([]);
    await expect.poll(async () => (await storedSettings(page)).project).toBe('Night Drive');

    await openApp(page);
    await expect(page).toHaveTitle('Night Drive — Chordinal');
    await expect(page.getByRole('spinbutton', { name: /^Tempo/ })).toHaveValue('96');
    expect(errors).toEqual([]);
  });

  test('New asks about unsaved changes first', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await page.getByRole('spinbutton', { name: /^Tempo/ }).fill('140');
    await page.keyboard.press('Enter');
    await expect(page).toHaveTitle('• Untitled — Chordinal');

    const newButton = page.getByRole('button', { name: 'New', exact: true });
    const ask = page.getByRole('dialog', { name: 'Save changes to “Untitled”?' });
    // Cancel keeps the changes
    await newButton.click();
    await expect(ask.getByRole('button')).toHaveText(['Don’t Save', 'Cancel', 'Save']);
    await ask.getByRole('button', { name: 'Cancel' }).click();
    await expect(ask).toBeHidden();
    await expect(page.getByRole('spinbutton', { name: /^Tempo/ })).toHaveValue('140');
    // Don't Save starts the new project
    await newButton.click();
    await ask.getByRole('button', { name: 'Don’t Save' }).click();
    await expect(ask).toBeHidden();
    await expect(page).toHaveTitle('Untitled — Chordinal');
    await expect(page.getByRole('spinbutton', { name: /^Tempo/ })).toHaveValue('120');
    expect(errors).toEqual([]);
  });

  test('Save As over a name already saved asks before replacing it', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    const tempo = page.getByRole('spinbutton', { name: /^Tempo/ });
    await tempo.fill('96');
    await page.keyboard.press('Enter');
    await saveAs(page, 'Night Drive');

    // a second project under the same name
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await expect(page).toHaveTitle('Untitled — Chordinal');
    await tempo.fill('150');
    await page.keyboard.press('Enter');
    const nameAsk = page.getByRole('dialog', { name: 'Save the project as' });
    const replaceAsk = page.getByRole('dialog', { name: /already saved in this browser/ });
    const saveUnder = async (name: string) => {
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(nameAsk.getByRole('textbox')).toBeFocused();
      await page.keyboard.press('ControlOrMeta+KeyA');
      await page.keyboard.type(name);
      await page.keyboard.press('Enter');
    };

    // Cancel goes back to the name, and Escape there saves nothing: the first project is untouched
    await saveUnder('Night Drive');
    await expect(replaceAsk).toBeVisible();
    await replaceAsk.getByRole('button', { name: 'Cancel' }).click();
    await expect(nameAsk.getByRole('textbox')).toHaveValue('Night Drive');
    await expect(nameAsk.getByRole('textbox')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(nameAsk).toBeHidden();
    await expect(page).toHaveTitle('• Untitled — Chordinal');
    expect(await storedProject(page, 'Night Drive')).toContain('"bpm": 96');

    // Replace writes over it
    await saveUnder('Night Drive');
    await replaceAsk.getByRole('button', { name: 'Replace' }).click();
    await expect(page.getByRole('status')).toHaveText('Saved “Night Drive”');
    await expect.poll(() => storedProject(page, 'Night Drive')).toContain('"bpm": 150');
    expect(errors).toEqual([]);
  });
});
