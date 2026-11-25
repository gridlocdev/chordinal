// A track's audio effects in the mixer: add them, change a setting in the panel, bypass, reorder and remove them,
// saved with the project and undoable, and played without errors, by Play and by the keys played live.
import {
  expect,
  openApp,
  runCommand,
  saveAs,
  storedProject,
  test,
  trackHeader,
  watchErrors,
} from './fixtures.ts';

interface SavedInsert {
  id: string;
  type: string;
  bypass?: boolean;
  params: Record<string, number>;
}

/** the saved project's effects on a track */
function savedInserts(text: string, track: string): SavedInsert[] | undefined {
  const file = JSON.parse(text) as { tracks: { name: string; inserts?: SavedInsert[] }[] };
  return file.tracks.find((t) => t.name === track)?.inserts;
}

test.describe('Track effects', () => {
  test('effects added in the strip are set in their panel, saved, and undone one step at a time', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await runCommand(page, 'Mixer');
    const list = page.getByRole('group', { name: 'Grand Piano effects' });
    const add = list.getByRole('combobox', { name: 'Add an effect to Grand Piano' });
    await add.selectOption('eq');
    await expect(add).toHaveValue('');

    // adding opens its settings
    const panel = page.getByRole('region', { name: 'EQ on Grand Piano' });
    await expect(panel).toBeVisible();
    await panel.getByRole('slider', { name: 'EQ Low', exact: true }).fill('750'); // 3/4 of the way: +9 dB
    await expect(panel.getByText('9.0 dB')).toBeVisible();

    await add.selectOption('reverb');
    await expect(page.getByRole('region', { name: 'Reverb on Grand Piano' })).toBeVisible();
    await page
      .getByRole('region', { name: 'Reverb on Grand Piano' })
      .getByRole('slider', { name: 'Reverb Mix' })
      .fill('500');
    await list.getByRole('button', { name: 'Bypass Reverb' }).click();
    await expect(list.locator('.fx-row.off')).toHaveCount(1);
    await add.selectOption('gain');
    await list.getByRole('button', { name: 'Remove Gain' }).click();
    await expect(list.locator('.fx-row')).toHaveCount(2);
    await page.keyboard.press('ControlOrMeta+KeyZ'); // the Gain comes back
    await expect(list.locator('.fx-row')).toHaveCount(3);
    await page.keyboard.press('ControlOrMeta+KeyZ'); // and goes, as it was never added
    await expect(list.locator('.fx-row')).toHaveCount(2);

    // played with its effects, nothing goes wrong
    await page.keyboard.press('Space');
    await page.waitForTimeout(600);
    await page.keyboard.press('Space');

    await saveAs(page, 'With Effects');
    expect(savedInserts((await storedProject(page, 'With Effects')) ?? '', 'Grand Piano')).toEqual([
      { id: 'fx1', type: 'eq', params: { low: 9 } },
      { id: 'fx2', type: 'reverb', bypass: true, params: { mix: 0.5 } },
    ]);
    expect(errors).toEqual([]);
  });

  test("the master's effects are added in its strip or dragged from the browser, and saved with the project", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await runCommand(page, 'Mixer');
    const master = page.getByRole('group', { name: 'Master effects' });
    await master.getByRole('combobox', { name: 'Add an effect to Master' }).selectOption('limiter');
    await expect(page.getByRole('region', { name: 'Limiter on Master' })).toBeVisible();

    // the browser's Effects tab: drag one onto the master, ahead of the Limiter, and double-click one for the selected track (Drums)
    await page.locator('.browser').getByRole('button', { name: 'Effects', exact: true }).click();
    const effects = page.locator('.browser .item');
    await effects.getByText('EQ', { exact: true }).dragTo(master.locator('.fx-row').first());
    await expect(master.locator('.fx-row')).toHaveCount(2);
    await effects.getByText('Compressor', { exact: true }).dblclick();
    const drums = page.getByRole('group', { name: 'Drums effects' });
    await expect(drums.locator('.fx-row')).toHaveCount(1);

    await page.keyboard.press('Space');
    await page.waitForTimeout(600);
    await page.keyboard.press('Space');

    await saveAs(page, 'Mastered');
    const text = (await storedProject(page, 'Mastered')) ?? '';
    const file = JSON.parse(text) as { masterInserts?: SavedInsert[] };
    expect(file.masterInserts?.map((x) => x.type)).toEqual(['eq', 'limiter']);
    expect(savedInserts(text, 'Drums')?.map((x) => x.type)).toEqual(['compressor']);
    expect(errors).toEqual([]);
  });

  test("the keys played live go through the selected track's effects", async ({ page }) => {
    // the effects are Web Audio nodes with nothing on screen, so count the reverbs made
    await page.addInitScript(() => {
      const w = window as unknown as { reverbs: number; ConvolverNode: typeof ConvolverNode };
      w.reverbs = 0;
      const Base = w.ConvolverNode;
      w.ConvolverNode = class extends Base {
        constructor(...args: ConstructorParameters<typeof ConvolverNode>) {
          super(...args);
          w.reverbs++;
        }
      };
    });
    const reverbs = () => page.evaluate(() => (window as unknown as { reverbs: number }).reverbs);
    const errors = watchErrors(page);
    await openApp(page);
    await trackHeader(page, 'Grand Piano').click();
    const before = await reverbs();
    await runCommand(page, 'Mixer');
    await page.getByRole('combobox', { name: 'Add an effect to Grand Piano' }).selectOption('reverb');
    await expect.poll(reverbs, { message: 'the live keys get a reverb of their own' }).toBe(before + 1);

    await page.getByRole('tab', { name: 'Piano Roll' }).click();
    const roll = page.getByTestId('piano-roll');
    const box = await roll.boundingBox();
    if (!box) throw new Error('no piano roll');
    await page.mouse.click(box.x + 10, box.y + box.height / 2);
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(200);
    await page.keyboard.up('KeyA');

    // a setting's change glides, and doesn't build the reverb again
    await runCommand(page, 'Mixer');
    await page
      .getByRole('region', { name: 'Reverb on Grand Piano' })
      .getByRole('slider', { name: 'Reverb Mix' })
      .fill('800');
    await page
      .getByRole('group', { name: 'Grand Piano effects' })
      .getByRole('button', { name: 'Remove Reverb' })
      .click();
    await page.keyboard.press('ControlOrMeta+KeyZ'); // back again: built once more
    await expect.poll(reverbs).toBe(before + 2);
    expect(errors).toEqual([]);
  });
});
