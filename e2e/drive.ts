// Drive the app from the command line for a quick look, instead of writing a one-off browser script. Serves the
// browser build, opens one headless, muted browser on a fresh profile, runs the steps and prints what happened.
//
//   just drive [--dark] <step>…
//
//   cmd:<command name>   run a command from the ⌘K menu       key:<chord>     press keys (ControlOrMeta+KeyS: key codes, not letters)
//   type:<text>          type text                           click:<text>    click the first element showing it
//   wait:<text>          wait until the text shows           shot:<name>     screenshot to .e2e-results/drive/
//   aria                 print the page's accessibility tree (cheap to read, names every control)
//   eval:<expression>    print the value of a JavaScript expression in the page
//
// Errors (uncaught, console, failed requests) are printed at the end. The profile is thrown away afterwards, so
// nothing is kept and nothing of the owner's is read.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { openApp, runCommand, watchErrors } from './fixtures.ts';
import { LAUNCH } from './playwright.config.ts';
import { BASE_URL, ROOT, serve } from './server.ts';

const SHOTS = path.join(ROOT, '.e2e-results/drive');

const args = process.argv.slice(2);
const dark = args.includes('--dark');
const steps = args.filter((arg) => arg !== '--dark');
if (steps.length === 0) {
  console.error(
    'usage: just drive [--dark] cmd:<name> key:<chord> type:<text> click:<text> shot:<name> aria …',
  );
  process.exit(2);
}

mkdirSync(SHOTS, { recursive: true });
const server = serve();
const browser = await chromium.launch(LAUNCH);
// Stop the browser and the server however this ends: Ctrl+C, a kill, or output piped into `head` that closes early.
const stop = async (code: number) => {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  server.close();
  process.exit(code);
};
process.on('SIGINT', () => void stop(130));
process.on('SIGTERM', () => void stop(143));
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') void stop(0);
});

let failed = false;
try {
  const page = await browser.newPage({
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 800 },
    colorScheme: dark ? 'dark' : 'light',
    reducedMotion: 'reduce',
  });
  page.setDefaultTimeout(5000);
  const errors = watchErrors(page);
  await openApp(page);

  for (const step of steps) {
    const colon = step.indexOf(':');
    const kind = colon === -1 ? step : step.slice(0, colon);
    const value = colon === -1 ? '' : step.slice(colon + 1);
    console.log(`> ${step}`);
    switch (kind) {
      case 'cmd':
        await runCommand(page, value);
        break;
      case 'key':
        await page.keyboard.press(value);
        break;
      case 'type':
        await page.keyboard.type(value);
        break;
      case 'click':
        await page.getByText(value).first().click();
        break;
      case 'wait':
        await page.getByText(value).first().waitFor();
        break;
      case 'shot': {
        const file = path.join(SHOTS, `${value || 'shot'}.png`);
        await page.screenshot({ path: file });
        console.log(`  ${file}`);
        break;
      }
      case 'aria':
        console.log(await page.locator('body').ariaSnapshot());
        break;
      case 'eval':
        console.log(`  ${JSON.stringify(await page.evaluate(value))}`);
        break;
      default:
        throw new Error(`unknown step "${kind}"`);
    }
  }
  console.log(errors.length > 0 ? `errors:\n${errors.join('\n')}` : 'no errors');
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : error);
} finally {
  await stop(failed ? 1 : 0);
}
