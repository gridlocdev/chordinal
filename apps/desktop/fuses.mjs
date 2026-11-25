// Turns off the Electron features Chordinal doesn't use, so no other program can run the app's binary as a plain
// Node.js (ELECTRON_RUN_AS_NODE, NODE_OPTIONS, --inspect). The fuses are flipped in the binary itself, before it's
// signed: electron-builder runs this as its afterPack hook, and tools/install-app.sh runs it on the app it installs.
// OnlyLoadAppFromAsar stays off, since the app isn't packed in an asar.
//
//   node apps/desktop/fuses.mjs <Chordinal.app, or the app's executable>
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FuseV1Options, FuseVersion, flipFuses } from '@electron/fuses';

/** @param {string} app the .app on macOS, the executable elsewhere */
export async function flipChordinalFuses(app) {
  await flipFuses(app, {
    version: FuseVersion.V1,
    // the signature no longer matches the flipped binary; electron-builder and install-app.sh sign it again after
    resetAdHocDarwinSignature: app.endsWith('.app'),
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
  });
}

/**
 * electron-builder's afterPack hook
 * @param {{ appOutDir: string, electronPlatformName: string, packager: { appInfo: { productFilename: string }, executableName: string } }} context
 */
export default async function afterPack(context) {
  const { appOutDir, electronPlatformName: platform, packager } = context;
  const name = packager.appInfo.productFilename;
  const app =
    platform === 'darwin' || platform === 'mas'
      ? path.join(appOutDir, `${name}.app`)
      : platform === 'win32'
        ? path.join(appOutDir, `${name}.exe`)
        : path.join(appOutDir, packager.executableName);
  await flipChordinalFuses(app);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = process.argv[2];
  if (!app) {
    console.error('usage: node apps/desktop/fuses.mjs <app>');
    process.exit(1);
  }
  await flipChordinalFuses(app);
}
