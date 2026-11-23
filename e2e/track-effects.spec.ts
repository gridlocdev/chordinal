// A track's audio effects in the mixer: add them, change a setting in the panel, bypass, reorder and remove them,
// saved with the project and undoable, and played without errors.
import { expect, openApp, runCommand, saveAs, storedProject, test, watchErrors } from './fixtures.ts';

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
});
