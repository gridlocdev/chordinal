// Making a beat: the step grid on the drum track, then play and stop. Nothing here depends on hearing sound: the
// test server has no SoundFonts and the browser is muted. Play stays on while its SoundFont loads, so the test holds
// that download open: a 404 would turn Play off again, sooner on some machines than others.
import {
  clickAt,
  expect,
  openApp,
  playButton,
  savedNotes,
  saveAs,
  storedProject,
  test,
  trackHeader,
  watchErrors,
} from './fixtures.ts';

/** the step grid's drum names, left of the steps (GRID_GUTTER) */
const GUTTER = 110;

test.describe('Drums and patterns', () => {
  test('steps clicked in the step grid play and stop', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    // double-clicking a drum track opens the step grid on a new one-bar clip at the playhead
    await trackHeader(page, 'Drums').dblclick();
    await expect(page.getByRole('tab', { name: 'Step Grid' })).toHaveAttribute('aria-selected', 'true');
    const grid = page.getByTestId('step-grid');
    await expect(grid).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Step' })).toHaveValue('0.25');

    // a bar of 1/16 steps: the first row's beats
    const box = await grid.boundingBox();
    if (!box) throw new Error('the step grid has no size');
    const step = (box.width - GUTTER) / 16;
    for (const col of [0, 4, 8, 12]) await clickAt(page, 'step-grid', GUTTER + (col + 0.5) * step, 6);
    await expect(page).toHaveTitle('• Untitled — Chordinal');

    await page.route(/\/soundfonts\//, () => {}); // never answered: the SoundFont is still loading
    await playButton(page).click();
    await expect(playButton(page)).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(playButton(page)).toHaveAttribute('aria-pressed', 'false');
    // Space plays and stops too, once the keyboard is off the buttons (a click on the track's header)
    await trackHeader(page, 'Drums').click();
    await page.keyboard.press('Space');
    await expect(playButton(page)).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Space');
    await expect(playButton(page)).toHaveAttribute('aria-pressed', 'false');

    await saveAs(page, 'Beat');
    const notes = savedNotes((await storedProject(page, 'Beat')) ?? '', 'Drums');
    expect(notes.map(([beat]) => beat)).toEqual([0, 1, 2, 3]);
    await page.screenshot({ path: test.info().outputPath('beat.png') });
    expect(errors).toEqual([]);
  });
});
