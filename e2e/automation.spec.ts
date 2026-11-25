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
import type { Page } from '@playwright/test';

/** the saved project's volume keyframes on a track */
function volumeFrames(text: string, track: string): { beat: number; value: number }[] {
  const file = JSON.parse(text) as {
    tracks: { name: string; automation?: { volume?: { beat: number; value: number }[] } }[];
  };
  return file.tracks.find((t) => t.name === track)?.automation?.volume ?? [];
}

/** Save As for a project already named, which Save keeps under its name */
async function saveAsAgain(page: Page, name: string): Promise<void> {
  await runCommand(page, 'Save As…');
  const ask = page.getByRole('dialog', { name: 'Save the project as' });
  await expect(ask.getByRole('textbox')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+KeyA');
  await page.keyboard.type(name);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText(`Saved “${name}”`);
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

  test('a box picks points, a drag moves them together, and Delete removes them', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await trackHeader(page, 'Grand Piano').click();
    await page.keyboard.press('a');
    const lane = page.locator('.auto-row .lane').first();
    const box = await lane.boundingBox();
    if (!box) throw new Error('no lane');
    const far = Math.min(box.width - 20, 400);
    const mid = box.height / 2;
    for (const x of [20, far / 2, far]) await lane.click({ position: { x, y: mid } });
    await saveAs(page, 'Points');
    const before = volumeFrames((await storedProject(page, 'Points')) ?? '', 'Grand Piano');
    expect(before).toHaveLength(3);

    // Shift-drag a box round the last two, then drag one of them up: both rise, the first stays
    await page.keyboard.down('Shift');
    await page.mouse.move(box.x + far / 2 - 15, box.y + 3);
    await page.mouse.down();
    await page.mouse.move(box.x + far + 15, box.y + box.height - 3, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await page.mouse.move(box.x + far, box.y + mid);
    await page.mouse.down();
    await page.mouse.move(box.x + far, box.y + mid - 15, { steps: 4 });
    await page.mouse.up();
    await saveAsAgain(page, 'Points Up');
    const up = volumeFrames((await storedProject(page, 'Points Up')) ?? '', 'Grand Piano');
    expect(up.map((f) => f.beat)).toEqual(before.map((f) => f.beat));
    expect(up[0]!.value).toBe(before[0]!.value);
    expect(up[1]!.value).toBeGreaterThan(before[1]!.value);
    expect(up[2]!.value).toBeGreaterThan(before[2]!.value);

    await page.keyboard.press('Backspace');
    await saveAsAgain(page, 'Points Gone');
    expect(volumeFrames((await storedProject(page, 'Points Gone')) ?? '', 'Grand Piano')).toEqual([up[0]]);
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
