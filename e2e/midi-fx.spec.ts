// A track's MIDI effects in the mixer strip: add, change, bypass and remove, saved with the project and undoable.
import { expect, openApp, runCommand, saveAs, storedProject, test, watchErrors } from './fixtures.ts';

/** the saved project's FX on a track */
function savedFx(text: string, track: string): Record<string, unknown>[] {
  const file = JSON.parse(text) as { tracks: { name: string; fx?: Record<string, unknown>[] }[] };
  return file.tracks.find((t) => t.name === track)?.fx ?? [];
}

test.describe('MIDI effects', () => {
  test('effects added in the strip are saved, and undo takes the last change back', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await runCommand(page, 'Mixer');
    const list = page.getByRole('group', { name: 'Grand Piano MIDI effects' });
    const add = list.getByRole('combobox', { name: 'Add a MIDI effect to Grand Piano' });
    await add.selectOption('chord');
    await add.selectOption('scale');
    await expect(add).toHaveValue('');
    const shape = list.getByRole('combobox', { name: 'Chord shape' });
    await shape.selectOption('minor');
    await list.getByRole('button', { name: 'Bypass Scale' }).click();
    await expect(list.locator('.fx-row.off')).toHaveCount(1);
    await list.getByRole('button', { name: 'Remove Scale' }).click();
    await page.keyboard.press('ControlOrMeta+KeyZ'); // the Scale comes back, still bypassed

    await saveAs(page, 'Minor Chords');
    expect(savedFx((await storedProject(page, 'Minor Chords')) ?? '', 'Grand Piano')).toEqual([
      { type: 'chord', shape: 'minor' },
      { type: 'scale', bypass: true },
    ]);
    expect(errors).toEqual([]);
  });

  test('an arpeggiator set up in the strip is saved with its rate, direction, octaves and gate', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await runCommand(page, 'Mixer');
    const list = page.getByRole('group', { name: 'Grand Piano MIDI effects' });
    await list.getByRole('combobox', { name: 'Add a MIDI effect to Grand Piano' }).selectOption('arp');
    await list.getByRole('combobox', { name: 'Arpeggiator rate' }).selectOption('1/8t');
    await list.getByRole('combobox', { name: 'Arpeggiator direction' }).selectOption('updown');
    await list.getByRole('combobox', { name: 'Arpeggiator octaves' }).selectOption('2');
    await list.getByRole('combobox', { name: 'Arpeggiator gate' }).selectOption('0.5');
    await page.screenshot({ path: test.info().outputPath('arp.png') });

    await saveAs(page, 'Arp');
    expect(savedFx((await storedProject(page, 'Arp')) ?? '', 'Grand Piano')).toEqual([
      { type: 'arp', rate: '1/8t', direction: 'updown', octaves: 2, gate: 0.5 },
    ]);
    expect(errors).toEqual([]);
  });
});
