// Sets the Electron fuses on the app tools/install-app.sh installs. That app is a renamed copy of the Electron in
// node_modules, not electron-builder's package, so the electronFuses in apps/desktop/electron-builder.json never reach
// it and it needs this step of its own. Turns off running it as a plain Node.js (ELECTRON_RUN_AS_NODE, NODE_OPTIONS,
// --inspect) and the extra privileges for file:// pages (the app's page is on app://). Cookie encryption stays off: on
// macOS it adds a Keychain item and can ask for access.
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
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
});
