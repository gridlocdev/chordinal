// A track's MIDI effects in the mixer strip: add, change, bypass and remove, saved with the project and undoable.
import {
  clickAt,
  expect,
  openApp,
  runCommand,
  savedNotes,
  saveAs,
  storedProject,
  test,
  trackHeader,
  watchErrors,
} from './fixtures.ts';

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

  test('Apply to Notes writes a chord into the clip and takes the effect off', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await trackHeader(page, 'Grand Piano').click();
    await page.getByRole('tab', { name: 'Piano Roll' }).click();
    await clickAt(page, 'piano-roll', 52 + 20, 26 + 54); // one note (roll-view.ts: keyboard and chord strip)
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Mixer' }).click();
    const list = page.getByRole('group', { name: 'Grand Piano MIDI effects' });
    await list.getByRole('combobox', { name: 'Add a MIDI effect to Grand Piano' }).selectOption('chord');
    await list.getByRole('combobox', { name: 'Chord shape' }).selectOption('power');
    await list.getByRole('button', { name: 'Apply Chord to notes' }).click();
    await expect(list.locator('.fx-row')).toHaveCount(0);

    await saveAs(page, 'Applied');
    const text = (await storedProject(page, 'Applied')) ?? '';
    expect(savedFx(text, 'Grand Piano')).toEqual([]);
    const keys = savedNotes(text, 'Grand Piano').map(([, , key]) => key as number);
    expect(keys).toHaveLength(3);
    expect(keys.map((k) => k - keys[0]!)).toEqual([0, 7, 12]);
    expect(errors).toEqual([]);
  });
});
