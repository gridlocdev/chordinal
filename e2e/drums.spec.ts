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

  test('dragging a step’s right edge stretches its note, and a step under it cuts it short', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await trackHeader(page, 'Drums').dblclick();
    const grid = page.getByTestId('step-grid');
    const box = await grid.boundingBox();
    if (!box) throw new Error('the step grid has no size');
    const step = (box.width - GUTTER) / 16,
      y = box.y + 6;
    const edge = (col: number) => box.x + GUTTER + col * step;
    await clickAt(page, 'step-grid', GUTTER + 0.5 * step, 6);
    await clickAt(page, 'step-grid', GUTTER + 8.5 * step, 6);
    // step 0's end dragged to 3.4 steps snaps to 3 steps
    await page.mouse.move(edge(1), y);
    await page.mouse.down();
    await page.mouse.move(edge(2.2), y);
    await page.mouse.move(edge(3.4), y);
    await page.mouse.up();
    // Shift: step 8's end goes where it's dropped, a step and a half
    await page.keyboard.down('Shift');
    await page.mouse.move(edge(9), y);
    await page.mouse.down();
    await page.mouse.move(edge(9.5), y);
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await page.screenshot({ path: test.info().outputPath('long-steps.png') });
    // step 2 is under step 0's note: turning it on cuts that note there
    await clickAt(page, 'step-grid', GUTTER + 2.5 * step, 6);

    await saveAs(page, 'Long');
    const notes = savedNotes((await storedProject(page, 'Long')) ?? '', 'Drums');
    expect(notes.map(([beat, beats]) => [beat, beats])).toEqual([
      [0, 0.5],
      [0.5, 0.25],
      [2, 0.375],
    ]);
    expect(errors).toEqual([]);
  });

  test('the Swing slider sets the clip’s swing, a drag at a time, and a double-click makes it straight', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await trackHeader(page, 'Drums').dblclick();
    const swing = page.getByRole('slider', { name: 'Swing' });
    await expect(swing).toHaveValue('0');
    const box = await swing.boundingBox();
    if (!box) throw new Error('the Swing slider has no size');
    const y = box.y + box.height / 2;
    // one drag past a third and on to two thirds: 50%, as one undo step
    await page.mouse.move(box.x + 4, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 3, y);
    await page.mouse.move(box.x + (box.width * 2) / 3, y);
    await page.mouse.up();
    const at = Number(await swing.inputValue());
    expect(at).toBeGreaterThan(40);
    expect(at).toBeLessThan(60);
    await expect(page.getByText(`${at}%`, { exact: true })).toBeVisible();
    const swingIn = async () => /"swing":\s*([\d.]+)/.exec((await storedProject(page, 'Swing')) ?? '')?.[1];
    await page.keyboard.press('ControlOrMeta+z');
    await expect(swing).toHaveValue('0');
    await saveAs(page, 'Swing');
    expect(await swingIn()).toBeUndefined();
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(swing).toHaveValue(String(at));
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page).toHaveTitle('Swing — Chordinal');
    expect(Number(await swingIn())).toBe(at / 100);
    // a double-click, the clicks that land on the slider first included, is one undo step
    await swing.dblclick();
    await expect(swing).toHaveValue('0');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(swing).toHaveValue(String(at));
    expect(errors).toEqual([]);
  });

  test('the lane under the grid paints velocity and probability, a drag at a time', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await trackHeader(page, 'Drums').dblclick();
    const grid = page.getByTestId('step-grid');
    const box = await grid.boundingBox();
    if (!box) throw new Error('the step grid has no size');
    const step = (box.width - GUTTER) / 16;
    // a kick and a snare together on step 0, a kick on step 4
    await clickAt(page, 'step-grid', GUTTER + 0.5 * step, 6);
    await clickAt(page, 'step-grid', GUTTER + 0.5 * step, 6 + 24);
    await clickAt(page, 'step-grid', GUTTER + 4.5 * step, 6);

    const lane = page.getByTestId('step-lane');
    const bars = await lane.boundingBox();
    if (!bars) throw new Error('the lane has no size');
    const col = (i: number) => bars.x + ((i + 0.5) * bars.width) / 16;
    // one drag across both steps, near the bottom: soft
    await page.mouse.move(col(0), bars.y + bars.height - 8);
    await page.mouse.down();
    await page.mouse.move(col(2), bars.y + bars.height - 8);
    await page.mouse.move(col(4), bars.y + bars.height - 8);
    await page.mouse.up();
    // one drag is one undo step: one undo gives every step back its 100
    await page.keyboard.press('ControlOrMeta+z');
    await saveAs(page, 'Lane');
    const undone = savedNotes((await storedProject(page, 'Lane')) ?? '', 'Drums');
    expect(undone.map(([, , , vel]) => vel)).toEqual([100, 100, 100]);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    // step 4's chance, halfway up
    await page.getByRole('button', { name: 'Probability' }).click();
    await expect(page.getByRole('button', { name: 'Probability' })).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.click(col(4), bars.y + bars.height / 2);
    await page.screenshot({ path: test.info().outputPath('lane.png') });

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page).toHaveTitle('Lane — Chordinal');
    const notes = savedNotes((await storedProject(page, 'Lane')) ?? '', 'Drums');
    const vels = notes.map(([, , , vel]) => vel as number);
    expect(new Set(vels).size).toBe(1);
    expect(vels[0]).toBeLessThan(20);
    const chances = notes.map((n) => (n[4] as { chance?: number } | undefined)?.chance ?? 1);
    expect(chances.slice(0, 2)).toEqual([1, 1]);
    expect(chances[2]).toBeGreaterThan(0.4);
    expect(chances[2]).toBeLessThan(0.6);
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
