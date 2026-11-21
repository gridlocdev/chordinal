// Builds the page (apps/web/src/main.jsx, everything it imports and the stylesheet) into apps/web/dist/, with its
// index.html and the microphone's worklet, for the desktop app to serve; and the desktop app's main process into
// apps/desktop/dist/, with the workspace packages it uses inlined, since a packaged app can't run TypeScript from
// node_modules.
//   node tools/build.mjs           build once
//   node tools/build.mjs --check   bundle without writing, to find errors (`just check`)
//   node tools/build.mjs --watch   rebuild on every change; the app reloads its window when the page changes (`just dev`)
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'apps/web');
const out = path.join(web, 'dist');
const require = createRequire(path.join(web, 'package.json'));

/** copies the page and the worklet next to the bundle */
const copyStatic = {
    name: 'copy-static',
    setup(build)
    {
        build.onEnd(({ errors })=>
        {
            if (errors.length || build.initialOptions.write === false) return;
            fs.copyFileSync(path.join(web, 'index.html'), path.join(out, 'index.html'));
            fs.copyFileSync(require.resolve('@chordinal/playback/mic-worklet.js'), path.join(out, 'mic-worklet.js'));
        });
    },
};

const options = {
    entryPoints: { chordinal: path.join(web, 'src/main.jsx') },
    outdir: out,
    bundle: true,
    format: 'esm',
    target: 'chrome140',
    jsx: 'automatic',
    jsxImportSource: 'preact',
    sourcemap: 'linked',
    logLevel: 'info',
    plugins: [copyStatic],
};

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
    const ctx = await esbuild.context(options);
    await ctx.watch();
}
else if (process.argv.includes('--check'))
{
    await esbuild.build({ ...options, write: false, logLevel: 'warning' });
    await esbuild.build({ ...main, write: false, logLevel: 'warning' });
    await esbuild.build({ ...preload, write: false, logLevel: 'warning' });
}
else
{
    await esbuild.build(options);
    await esbuild.build(main);
    await esbuild.build(preload);
}
