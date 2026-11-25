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

  test('a melodic track gets a grid of notes, and keeps it as its editor', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    // a melodic track opens the piano roll at first
    await trackHeader(page, 'Grand Piano').dblclick();
    await expect(page.getByRole('tab', { name: 'Piano Roll' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'Step Grid' }).click();
    const grid = page.getByTestId('step-grid');
    await expect(grid).toBeVisible();

    // a new project has no key, so the rows are all twelve notes from C3 to C5, highest first
    const box = await grid.boundingBox();
    if (!box) throw new Error('the step grid has no size');
    // the new clip's length, from a first save, gives the steps' width (1/16 steps)
    await saveAs(page, 'Tune');
    const first = JSON.parse((await storedProject(page, 'Tune')) ?? '{}');
    const beats: number = first.tracks.find((t: { name: string }) => t.name === 'Grand Piano').clips[0].beats;
    const rowH = Math.max(12, Math.min(24, Math.floor(box.height / 25)));
    const step = (box.width - GUTTER) / (beats * 4);
    const at = async (row: number, col: number) =>
      clickAt(page, 'step-grid', GUTTER + (col + 0.5) * step, (row + 0.5) * rowH);
    await at(0, 0); // C5
    await at(12, 4); // C4
    await at(12, 8);
    await at(12, 8); // and off again
    // an octave up, the top row is C6
    await page.getByRole('button', { name: 'Octave +' }).click();
    await at(0, 12);

    // picking the step grid by hand made it the track's editor: selecting its clip again keeps the grid
    await trackHeader(page, 'Drums').dblclick();
    await expect(page.getByRole('tab', { name: 'Step Grid' })).toHaveAttribute('aria-selected', 'true');
    await trackHeader(page, 'Grand Piano').dblclick();
    await expect(page.getByRole('tab', { name: 'Step Grid' })).toHaveAttribute('aria-selected', 'true');

    // saved again under the name it has
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page).toHaveTitle('Tune — Chordinal');
    const text = (await storedProject(page, 'Tune')) ?? '';
    const notes = savedNotes(text, 'Grand Piano');
    expect(notes.map(([beat, , key]) => [beat, key])).toEqual([
      [0, 72],
      [1, 60],
      [3, 84],
    ]);
    const piano = JSON.parse(text).tracks.find((t: { name: string }) => t.name === 'Grand Piano');
    expect(piano.editor).toBe('grid');
    expect(piano.gridOctave).toBe(4);
    await page.screenshot({ path: test.info().outputPath('tune.png') });
    expect(errors).toEqual([]);
  });
});
