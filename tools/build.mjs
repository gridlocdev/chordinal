// Builds the page (apps/web/index.html and everything it imports) into apps/web/dist/ with Vite, for the desktop
// app to serve; and the desktop app's main process into
// apps/desktop/dist/, with the workspace packages it uses inlined, since a packaged app can't run TypeScript from
// node_modules.
//   node tools/build.mjs           build once
//   node tools/build.mjs --check   bundle without writing, to find errors (`just check`)
//   node tools/build.mjs --watch   rebuild on every change; the app reloads its window when the page changes (`just dev`)
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

if (process.argv.includes('--watch'))
{
    await page({ build: { watch: {} } });
}
else if (process.argv.includes('--check'))
{
    await page({ build: { write: false } });
    await esbuild.build({ ...main, write: false, logLevel: 'warning' });
    await esbuild.build({ ...preload, write: false, logLevel: 'warning' });
}
else
{
    await page();
    await esbuild.build(main);
    await esbuild.build(preload);
}
