// Drawing a track's automation lanes (its mixer's and its effects'), with undo.
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

/** the saved project's volume keyframes on a track */
function volumeFrames(text: string, track: string): { beat: number; value: number }[] {
  const file = JSON.parse(text) as {
    tracks: { name: string; automation?: { volume?: { beat: number; value: number }[] } }[];
  };
  return file.tracks.find((t) => t.name === track)?.automation?.volume ?? [];
}

test.describe('Automation', () => {
  test('points drawn in a volume lane are saved, and undo takes the last one away', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await trackHeader(page, 'Grand Piano').click();
    await page.keyboard.press('a');
    const picker = page.getByRole('combobox', { name: 'Grand Piano automation' });
    await expect(picker).toHaveValue('volume');
    const lane = page.locator('.auto-row .lane').first();
    const box = await lane.boundingBox();
    if (!box) throw new Error('no lane');
    // high near the start, low a few bars on, then one more that undo takes away
    const far = Math.min(box.width - 10, 400);
    await lane.click({ position: { x: 20, y: 8 } });
    await lane.click({ position: { x: far, y: box.height - 8 } });
    await lane.click({ position: { x: far / 2, y: box.height / 2 } });
    await page.keyboard.press('ControlOrMeta+KeyZ');

    await saveAs(page, 'Fade');
    const frames = volumeFrames((await storedProject(page, 'Fade')) ?? '', 'Grand Piano');
    expect(frames).toHaveLength(2);
    expect(frames[0]!.beat).toBeLessThan(frames[1]!.beat);
    expect(frames[0]!.value).toBeGreaterThan(frames[1]!.value);

    await page.keyboard.press('a');
    await expect(picker).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("an effect's settings are lanes too, and one drawn there is saved under the effect", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await runCommand(page, 'Mixer');
    await page.getByRole('combobox', { name: 'Add an effect to Grand Piano' }).selectOption('filter');
    await runCommand(page, 'Mixer');
    await trackHeader(page, 'Grand Piano').click();
    await page.keyboard.press('a');
    const picker = page.getByRole('combobox', { name: 'Grand Piano automation' });
    await picker.selectOption({ label: 'Filter Cutoff' });
    await expect(picker).toHaveValue('fx1.cutoff');
    const lane = page.locator('.auto-row .lane').first();
    await lane.click({ position: { x: 20, y: 8 } });

    await saveAs(page, 'Sweep');
    const file = JSON.parse((await storedProject(page, 'Sweep')) ?? '') as {
      tracks: { name: string; automation: Record<string, { value: number }[]> }[];
    };
    const frames = file.tracks.find((t) => t.name === 'Grand Piano')!.automation['fx1.cutoff'] ?? [];
    expect(frames).toHaveLength(1);
    expect(frames[0]!.value).toBeGreaterThan(10000); // near the top of the lane: near 20 kHz
    expect(errors).toEqual([]);
  });
});
