// Turns off the Electron features that would let another program run the app tools/install-app.sh installs as a plain
// Node.js (ELECTRON_RUN_AS_NODE, NODE_OPTIONS, --inspect). The packaged app gets these and more from electronFuses in
// apps/desktop/electron-builder.json. Cookie encryption stays off here: the installed app is signed again on every
// install, and macOS would then ask each time whether it may read its keychain item.
//
//   node tools/fuses.mjs <Chordinal.app>
import { FuseV1Options, FuseVersion, flipFuses } from '@electron/fuses';

const app = process.argv[2];
if (!app) {
  console.error('usage: node tools/fuses.mjs <Chordinal.app>');
  process.exit(1);
}
await flipFuses(app, {
  version: FuseVersion.V1,
  // the signature no longer matches the flipped binary; install-app.sh signs it again after
  resetAdHocDarwinSignature: true,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
});
