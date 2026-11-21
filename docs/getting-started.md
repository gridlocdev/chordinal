# Getting started

Chordinal is a ready-to-run download for each platform. Every download includes everything it needs, including the GeneralUser GS sound library, so you don't have to install Node.js or anything else first.

Downloads are on the project's GitHub [Releases](https://github.com/gridlocdev/chordinal/releases) page. Pick the file for your system:

| System | File | How to start it |
|---|---|---|
| macOS, Apple silicon | `<App>-<version>-mac-arm64.dmg` | Open it and drag the app into **Applications** |
| macOS, Intel | `<App>-<version>-mac-x64.dmg` | Open it and drag the app into **Applications** |
| Windows 10/11 (x64) | `<App>-<version>-win-x64.exe` | Run the installer, then open the app from the Start menu |
| Linux (x64), any distribution with Flatpak | `<App>-<version>-linux-x86_64.flatpak` | `flatpak install --user <file>.flatpak`, then open it from your apps menu |

A `.zip` of the Mac app is there too, for when you'd rather not use the disk image.

On Linux you need Flatpak itself first: most distributions have it, and [flatpak.org/setup](https://flatpak.org/setup/) shows how to add it to the rest. The Flatpaks aren't on Flathub, so they don't update themselves: download newer ones and install them the same way. Chordinal can use the microphone, the network and your home folder, since its projects can be anywhere.

## First launch warnings

The builds aren't signed with a paid developer certificate yet, so your system may warn you the first time you open it:

- **macOS** won't open the app the first time and says Apple can't check it for malicious software. You only need to get past this once:
  - **macOS 15 (Sequoia) or later:** after the warning, open **System Settings → Privacy & Security**, scroll down to the message about the app, click **Open Anyway** and confirm with your password or Touch ID.
  - **macOS 12 to 14:** right-click (or Control-click) the app, choose **Open**, then **Open** again.
  - **Any version**, in Terminal: `xattr -dr com.apple.quarantine "/Applications/Chordinal.app"`, then open the app normally. This also fixes a message saying the app is damaged.
- **Windows** SmartScreen may say "Windows protected your PC". Choose **More info**, then **Run anyway**.

## The microphone

The first time you record into Chordinal, macOS asks whether Chordinal may use the microphone. If you said no, turn it on under **System Settings → Privacy & Security → Microphone**. On Windows, check **Settings → Privacy & security → Microphone**, and in the Flatpak, check its permissions in Flatseal.

## Where your files go

- **Projects** are folders wherever you save them, in `Documents/Chordinal/` unless you pick somewhere else. Each holds a `project.json` and, in `takes/`, the recorded takes.
- **Sound libraries:** GeneralUser GS comes with the app. FluidR3_GM (148 MB) and MuseScore_General (216 MB) download when you press **Download** in Chordinal's **Instruments** tab.

## Run it from source

If you'd rather build from source, you need Node.js and [just](https://github.com/casey/just). From the project folder:

```bash
just soundfonts  # download the three libraries, about 400 MB
just install-desktop  # install it as an app: ~/Applications/Chordinal.app on macOS
just run-desktop      # or just open it in its own window, without installing
just package-desktop  # make the downloads above for this system, in release/
```

The app made by `just install-desktop` runs the project folder itself, so it uses its sound libraries and picks up your changes the next time they open (run `just build` first). More detail is in the [development guide](development.md).
