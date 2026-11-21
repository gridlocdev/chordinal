// Browser scenarios: the browser build (apps/web/dist) served on 127.0.0.1, driven in headless, muted Chromium. Each
// test starts from a fresh browser profile, so projects (IndexedDB) and settings (localStorage) start empty.
// Run with `just e2e` (builds the page first).
import { defineConfig, devices } from '@playwright/test';
import { BASE_URL, ROOT, SERVER_COMMAND } from './server.ts';

/** Headless and silent: no window, no sound, and audio may start without a click. */
export const LAUNCH = {
  headless: true,
  args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'],
};

export default defineConfig({
  testDir: '.',
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  outputDir: '../.e2e-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL,
    headless: true,
    launchOptions: LAUNCH,
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `node ${SERVER_COMMAND.join(' ')}`,
    cwd: ROOT,
    url: BASE_URL,
    reuseExistingServer: false,
  },
});
