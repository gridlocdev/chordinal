// Builds the page (apps/web/index.html and everything it imports) into apps/web/dist/ with Vite, for the desktop
// app to serve; the desktop app's main process into
// apps/desktop/dist/, with the workspace packages it uses inlined, since a packaged app can't run TypeScript from
// node_modules; and the CLI into apps/cli/dist/ (chordinal.mjs, its render browser electron.mjs and page.js).
//   node tools/build.mjs           build once
//   node tools/build.mjs --cli     build the CLI only (`just cli`, `just compose`, `just export`)
//   node tools/build.mjs --check   bundle without writing, to find errors (`just check`)
//   node tools/build.mjs --watch   rebuild on every change; the app reloads its window when the page changes (`just run-desktop-watch`)
import * as esbuild from 'esbuild';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'apps/web');

// Vite is the web app's dependency, so it's loaded from there
const { build: viteBuild } = await import(pathToFileURL(createRequire(path.join(web, 'package.json')).resolve('vite')).href);

/** the page, through Vite (apps/web/vite.config.ts) */
const page = (extra = {}) => viteBuild({ root: web, configFile: path.join(web, 'vite.config.ts'), logLevel: 'warn', ...extra });

// the desktop app's main process: Node, with Electron and Node's own modules left to it
const desktop = path.join(root, 'apps/desktop');
const main = {
    entryPoints: { chordinal: path.join(desktop, 'src/chordinal.ts') },
    outdir: path.join(desktop, 'dist'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    external: ['electron'],
    sourcemap: 'linked',
    logLevel: 'info',
};
// its preload: a sandboxed preload is CommonJS and can't load other files
const preload = {
    ...main,
    entryPoints: { preload: path.join(desktop, 'src/preload.ts') },
    format: 'cjs',
    outExtension: { '.js': '.cjs' },
};

// the CLI: a Node script, the Electron main process it renders in, and that window's page
const cliDir = path.join(root, 'apps/cli');
const cli = {
    entryPoints: { chordinal: path.join(cliDir, 'src/chordinal.ts'), electron: path.join(cliDir, 'src/electron-main.ts') },
    outdir: path.join(cliDir, 'dist'),
    outExtension: { '.js': '.mjs' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    external: ['electron'],
    // `just cli` runs this from the caller's folder, whose own tsconfig.json mustn't apply
    absWorkingDir: root,
    tsconfig: path.join(cliDir, 'tsconfig.json'),
    logLevel: 'warning',
};
const cliPage = {
    entryPoints: { page: path.join(cliDir, 'src/page/page.ts') },
    outdir: path.join(cliDir, 'dist'),
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'chrome140',
    absWorkingDir: root,
    tsconfig: path.join(cliDir, 'tsconfig.json'),
    logLevel: 'warning',
};

if (process.argv.includes('--cli'))
{
    await esbuild.build(cli);
    await esbuild.build(cliPage);
}
else if (process.argv.includes('--watch'))
{
    await page({ build: { watch: {} } });
}
else if (process.argv.includes('--check'))
{
    await page({ build: { write: false } });
    await esbuild.build({ ...main, write: false, logLevel: 'warning' });
    await esbuild.build({ ...preload, write: false, logLevel: 'warning' });
    await esbuild.build({ ...cli, write: false });
    await esbuild.build({ ...cliPage, write: false });
}
else
{
    await page();
    await esbuild.build(main);
    await esbuild.build(preload);
    await esbuild.build(cli);
    await esbuild.build(cliPage);
}
