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

  test('a synth from the Synths tab plays on a track, and comes back after a reload', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await trackHeader(page, 'Grand Piano').click();
    const browser = page.locator('.browser');
    await browser.getByRole('button', { name: 'Synths', exact: true }).click();
    await browser.locator('.item', { hasText: 'Warm Pad' }).dblclick();
    await expect(trackHeader(page, 'Grand Piano').locator('.inst')).toHaveText('Warm Pad');

    await saveAs(page, 'Pads');
    // PRD §13: the synth is saved on the track's instrument, beside the General MIDI program it falls back to
    const saved = JSON.parse((await storedProject(page, 'Pads')) ?? '{}') as {
      tracks: { name: string; instrument: { program: number; synth?: { name: string; amp: object } } }[];
    };
    const piano = saved.tracks.find((t) => t.name === 'Grand Piano');
    expect(piano?.instrument.program).toBe(89);
    expect(piano?.instrument.synth?.name).toBe('Warm Pad');
    expect(piano?.instrument.synth?.amp).toBeTruthy();
    await expect.poll(async () => (await storedSettings(page)).project).toBe('Pads');

    await openApp(page);
    await expect(page).toHaveTitle('Pads — Chordinal');
    await expect(trackHeader(page, 'Grand Piano').locator('.inst')).toHaveText('Warm Pad');
    // a SoundFont preset put on the track takes the synth off it
    await trackHeader(page, 'Grand Piano').click();
    await page.locator('.browser').getByRole('button', { name: 'Instruments', exact: true }).click();
    await page.locator('.browser .item', { hasText: 'Grand Piano' }).first().dblclick();
    await expect(trackHeader(page, 'Grand Piano').locator('.inst')).not.toHaveText('Warm Pad');
    expect(errors).toEqual([]);
  });

  test("the Sound tab puts a synth on a track and sets it, and undo takes a slider's drag back in one step", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await trackHeader(page, 'Grand Piano').click();
    await page.keyboard.press('ControlOrMeta+4');
    const editor = page.locator('.editor');
    await expect(editor.getByRole('tab', { name: 'Sound' })).toHaveAttribute('aria-selected', 'true');
    await editor.getByRole('button', { name: 'Use a Synth' }).click();
    await expect(trackHeader(page, 'Grand Piano').locator('.inst')).toHaveText('Synth');

    const cutoff = editor.getByRole('slider', { name: 'Filter Cutoff' });
    await expect(cutoff).toHaveAttribute('aria-valuetext', '2.40 kHz');
    await cutoff.fill('200');
    await cutoff.fill('300');
    await expect(cutoff).not.toHaveAttribute('aria-valuetext', '2.40 kHz');
    await editor.getByRole('combobox', { name: 'Filter Type' }).selectOption('highpass');
    // glide waits for Mono
    const glide = editor.getByRole('slider', { name: 'Voice Glide' });
    await expect(glide).toBeDisabled();
    await editor.getByRole('checkbox', { name: 'Voice Mono' }).check();
    await expect(glide).toBeEnabled();
    const name = editor.getByRole('textbox', { name: 'Synth name' });
    await name.fill('Fat Bass');
    await name.press('Enter');
    await expect(trackHeader(page, 'Grand Piano').locator('.inst')).toHaveText('Fat Bass');
    await page.screenshot({ path: test.info().outputPath('sound.png') });

    await saveAs(page, 'Sound');
    const saved = JSON.parse((await storedProject(page, 'Sound')) ?? '{}') as {
      tracks: {
        name: string;
        instrument: { synth?: { mono: boolean; filter: { type: string; cutoff: number } } };
      }[];
    };
    const synth = saved.tracks.find((t) => t.name === 'Grand Piano')?.instrument.synth;
    expect(synth?.mono).toBe(true);
    expect(synth?.filter.type).toBe('highpass');
    expect(synth?.filter.cutoff).toBeLessThan(2400);

    // undo: the name, Mono, the filter type, then both moves of the cutoff at once
    await trackHeader(page, 'Grand Piano').click();
    for (let i = 0; i < 4; i++) await page.keyboard.press('ControlOrMeta+z');
    await expect(cutoff).toHaveAttribute('aria-valuetext', '2.40 kHz');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor.getByRole('button', { name: 'Use a Synth' })).toBeVisible();
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
    // Enter presses the button with the focus: Shift+Tab once is Cancel, which keeps the changes
    await newButton.click();
    await expect(ask.getByRole('button', { name: 'Save', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    await expect(ask).toBeHidden();
    await expect(page).toHaveTitle('• Untitled — Chordinal');
    // Don't Save (twice back, then Enter) starts the new project
    await newButton.click();
    await expect(ask.getByRole('button', { name: 'Save', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(ask.getByRole('button', { name: 'Don’t Save' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(ask).toBeHidden();
    await expect(page).toHaveTitle('Untitled — Chordinal');
    await expect(page.getByRole('spinbutton', { name: /^Tempo/ })).toHaveValue('120');
    expect(errors).toEqual([]);
  });

  test('undo after Save As takes back the edit, not the name', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    const tempo = page.getByRole('spinbutton', { name: /^Tempo/ });
    await tempo.fill('96');
    await page.keyboard.press('Enter');
    await saveAs(page, 'Night Drive');
    await expect(page).toHaveTitle('Night Drive — Chordinal');

    await page.locator('.arrange').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ControlOrMeta+KeyZ');
    await expect(tempo).toHaveValue('120');
    await expect(page).toHaveTitle('• Night Drive — Chordinal');
    await page.keyboard.press('ControlOrMeta+Shift+KeyZ');
    await expect(tempo).toHaveValue('96');
    await expect(page).toHaveTitle(/Night Drive — Chordinal$/);
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
