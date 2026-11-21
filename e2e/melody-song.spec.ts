// New from Melody (Chordinal PRD §9.4): the song is previewed in the window with the customizer docked beside it; a
// change composes it again; Cancel puts the project back and Replace This Project puts the song in its place.
import { expect, openApp, runCommand, test, trackHeader, watchErrors } from './fixtures.ts';
import type { Page } from '@playwright/test';

/** a generated melody in a clip on the piano track, selected */
async function melodyClip(page: Page): Promise<void> {
  await trackHeader(page, 'Grand Piano').click();
  await runCommand(page, 'Generate Part');
  const dialog = page.getByRole('dialog', { name: 'Generate part' });
  await dialog.getByRole('button', { name: 'Generate', exact: true }).click();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
}

test.describe('New from Melody', () => {
  test('previews the song beside its customizer; Cancel and Replace end it', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await melodyClip(page);

    await runCommand(page, 'New from Melody');
    const panel = page.getByRole('complementary', { name: 'Song from melody' });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('combobox', { name: 'Feeling' })).toBeFocused();
    await expect(page).toHaveTitle(/Untitled melody/);
    const tempo = panel.getByRole('spinbutton', { name: 'Tempo' });
    await expect(tempo).toHaveValue('120');

    // a genre brings its own tempo and band
    await panel.getByRole('combobox', { name: 'Genre' }).selectOption('jazz');
    await expect(tempo).not.toHaveValue('120');
    await expect(panel.getByRole('combobox', { name: 'Drums' })).not.toHaveValue('');
    await expect(trackHeader(page, 'Drums')).toBeVisible();
    await page.screenshot({ path: '.e2e-results/melody-song.png' });

    await panel.getByRole('button', { name: 'Cancel' }).click();
    await expect(panel).toBeHidden();
    await expect(page).not.toHaveTitle(/melody/);

    await runCommand(page, 'New from Melody');
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Replace This Project' }).click();
    await expect(panel).toBeHidden();
    await expect(page).toHaveTitle(/^• Untitled — Chordinal$/);
    await expect(page.getByRole('group', { name: 'Melody track', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
