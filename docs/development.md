# Development

Chordinal is an Electron app. Its interface is [Preact](https://preactjs.com) with [signals](https://preactjs.com/guide/v10/signals/), built by [Vite](https://vite.dev) into `apps/web/dist/`; esbuild bundles the desktop main process. Everything under the interface (the melody transcription, the SoundFont 2 parser and the Web Audio sampler, all written from scratch) is TypeScript or JavaScript ES modules that also run as they are in Node, for the tools and tests. The rules in `AGENTS.md` at the repository root apply to everyone working on it, and the code layout and its layer rules are in [architecture.md](architecture.md).

## Getting set up

You need Node.js, Python 3 and [just](https://github.com/casey/just).

```bash
just setup              # pnpm install: the pinned Preact, signals, Vite, esbuild, Electron and dev tools
just soundfonts         # download GeneralUser GS, FluidR3_GM and MuseScore_General into soundfonts/
just build              # bundle apps/web/src/main.tsx into apps/web/dist/
just run-desktop        # build, then run Chordinal in its own window
just run-desktop-watch  # rebuild on every change and reload the window
just install-desktop    # install it as an app: ~/Applications/Chordinal.app on macOS
```

`just build`, `just run-desktop`, `just run-desktop-watch` and `just install-desktop` install the dependencies first if anything is missing. `dist/` is ignored by git.

## Checking your work

Run both after every change:

```bash
just check   # syntax-check every module, build the bundle without writing it, then the layer rules
just test    # node --test: the tests in test/ for lib/ and *-data.js files
```

### In a browser

`just preview-web` builds the page and serves it with the SoundFont libraries in `soundfonts/` at http://127.0.0.1:8020/ (or the next free port). Without the desktop app the page keeps its projects and settings in the browser (IndexedDB and localStorage).

### Browser scenarios

`just e2e` builds the page and runs the scenarios in `e2e/` against the browser build (`apps/web/dist`), served on 127.0.0.1:8823, in headless, muted Chromium from Playwright. They cover start-up, a drum beat in the step grid with play and stop, notes in the piano roll with undo and redo, saving and reopening a project, New with unsaved changes, the ⌘K menu, the shortcuts window and the theme. Pass a file name or Playwright options to run fewer: `just e2e drums`.

`random-ui.spec.ts` clicks and presses keys at random on the visible controls and fails on any page error or lost focus. It prints the seed of a failing run; replay it with `SEED=4 just e2e random-ui`. `RUNS` (default 3) and `STEPS` (default 40) set how much it does. It never records, opens file pickers or downloads.

Each test starts from a fresh browser profile, so projects (IndexedDB) and settings (localStorage) start empty. The SoundFont libraries aren't served, so instruments from them don't load; the scenarios don't listen to the sound. The microphone is refused, and a test that asks for it fails. Results, traces of failed tests and screenshots go to `.e2e-results/`, which git ignores.

`just drive` runs steps against the same build for a quick look without writing a test, for example `just drive cmd:Mixer shot:mixer` or `just drive --dark aria`. The steps are listed at the top of `e2e/drive.ts`.

The whole run takes about 25 seconds, so `just check` runs it too.

## The command line

`apps/cli` is Chordinal's command line, `chordinal`, on the same engine as the app. `just cli <command> …` builds it (`node tools/build.mjs --cli`, into `apps/cli/dist/`) and runs it from the folder you're in; `just export` is a shortcut for one of its commands. `just cli help` lists the commands, and `just cli <command> --help` explains one. `export` and `render` play projects in a hidden, muted Electron window (no Dock icon), which the CLI ends when it's done; they take `--library <id>` for another SoundFont library: generaluser (the default), fluidr3 or musescore.

`export` makes a `.mid` and a `.wav` of project folders, as the app's Export as MIDI and Export as Audio File make them (the whole song, the mix, a 3 s tail, not normalized), about ten seconds a song. `just export` exports the project folders you name to `export/` (not committed):

```bash
just export songs/first-light songs/lanterns  # these projects
just export songs/first-light --mp3           # and an MP3 (320 kbps; needs ffmpeg)
just export songs/first-light --library fluidr3   # on another SoundFont library
just cli export path/to/project --out out     # any project folder, into out/
```

`render` renders a game's soundtrack. It takes a soundtrack file, JSON whose `tracks` lists `{ id, project, loop?, trim? }` (`project` is a project folder, relative to the file; `loop: [first, end]` names the markers the loop runs between, and the marker at `end` must have the same `meta.type` as the one at `first`; `trim` starts the file at the loop; any other field is copied to the data file as it is), and a folder for the mp3s. Each project is rendered at 44100 Hz, cut 0.05 s before its first beat (and just after its loop's end, crossfaded at the seam), brought to −20 dB RMS (peaks at most −1 dB) and encoded by ffmpeg (160 kbps, or `--bitrate`). Each mp3 is then decoded again to check it lines up with the render. With `--data <file>` it writes the tracks' timing for the game (file, tempo, offset, loop points or end, bar lines, length, rate), keeping the entries of tracks not rendered this time; name tracks after the folder to render only those:

```bash
just -f path/to/chordinal/justfile cli render music/soundtrack.json music --data src/audio/tracks-data.js
just -f path/to/chordinal/justfile cli render music/soundtrack.json music title --data src/audio/tracks-data.js   # one track
```

Songs are composed in Chordinal Melody Composer, a separate repository next to this one, which writes them as project folders and calls this `render` for the games.

### Transcribing a recorded melody

The pitch tracker follows one clear line in a high register (about 300 to 4,000 Hz): a high voice singing or humming, or any other clear tone. A low voice sits under that range, so try it an octave higher.

**In the app.** Select a track (or none, and a Melody track is added) and press **●** (or `R`). After a bar of count-in, at the project's tempo and meter where the playhead is, sing the melody. The click is a low tick under the pitch tracker's range, but use headphones anyway. Nothing else plays while you record, so the band can't leak into the take. The playhead follows the take, and notes are written into the arrangement and the piano roll about a beat behind it (keys you play show up as you play them). When you stop, the whole take is read again on the click's grid and put in a new clip from the bar you started in, and the playhead goes back to the start of that clip.

Then the chords: drag over the chord track above the tracks (bars, or beats with Shift held), press `R` (or **Transport ▸ Record a Chord**) and sound the chord's notes one at a time as an arpeggio, in any order and octave, in your own time. Press `R` again and the chord is named in the project's key from the notes you held longest, and replaces the chords there. Fix notes in the piano roll like any others.

In a saved project each take's audio is kept as `<project folder>/takes/take-n.wav` (ignored by git), listed in the browser's Takes tab: click one, or drag it onto a track, to read it again. Audio files dropped on a track are read the same way, at the project's tempo.

**From the command line.**

`just transcribe <file or folder> --tempo <bpm>` (`tools/transcribe.mjs`, needs ffmpeg for anything but `.wav`) turns a recorded melody into scale-degree notation (`parseMelody` in `packages/lib` reads it back). `--tempo` is the speed you recorded at, roughly: the tool fits the beat grid within ±10% of it, and since the notation counts beats you can record slower than the song plays. It snaps notes to 8ths or triplets, beat by beat (a triplet is written `5:1/3`), keeps staccato notes however short, guesses the key (or takes `--key Eb --mode major`), writes `~` on notes with vibrato, and flags notes more than 30 cents off. `--meter 3/4` places the bar lines; `--json out.json` keeps the notes. Keep takes in `scratch/`: git ignores that folder, so they stay on your machine.

```bash
just transcribe scratch/lantern-hook.m4a --tempo 60 --meter 3/4
```

**Chords.** With `--chords` the take is read as arpeggios: sound each chord's notes, in any order and octave, and the tool finds the chords and where they change (on beats; bar lines and half bars are likelier), and prints a `progression:` with each chord's runners-up. Only the chord is kept, not its voicing. Start an arpeggio on the chord's third or seventh for an inversion (3-5-8 is `I/3`); starting on the fifth is just the chord. A 7th chord needs its 7th recorded in its own bar. Between relative keys (G major and E minor) it keeps the one whose chords fit best, which usually means the one the take starts and ends on.

```bash
just transcribe scratch/lantern-chords.m4a --tempo 60 --meter 3/4 --chords
```

Tips: start each note with a consonant (a soft "t" or "d") when repeating a pitch, so it is heard as a new note, and leave a second of silence before the first note.

### Studying NES soundtracks

`just nsf <file.nsf> [songs…]` (`tools/nsf-report.mjs`) plays an NSF file's music driver in a
6502 emulator and reports what each song does: each channel's range and duty, the row length, how
the lead moves (interval sizes, turns, leaps), note lengths, vibrato, slides, arpeggios, echo
channels, drum hits and the loop. `--json out.json` saves the notes too. Keep the files in
`reference/`, which git ignores; they are for learning techniques, not for copying tunes into the
song lists. It reads the 2A03 and the VRC6 expansion; other expansion chips are ignored.

```bash
just nsf reference/Shovel_Knight_Music.nsf 1 4
```

For music that isn't an NSF (an OGG or MP3 soundtrack), `just audio <files…>`
(`tools/audio-report.mjs`, needs ffmpeg) follows the loudest high pitched line and reports the same
lead statistics, plus the tempo and how much of the lead stays on seven pitch classes. It is a
guess from the mixed sound: checked against Mega Man 2 rendered from its NSF it picks the right
note 67–85% of the time. It counts too few repeated notes and too many leaps, and it can't see
fast arpeggios. Busy mixes with pads, reverb or a loud bass confuse it more. Compare its numbers
with each other rather than with `just nsf`'s.

```bash
just audio reference/vvvvvv/ogg/*.ogg
```

### The desktop app

`just run-desktop` builds the page and the main process, then runs Chordinal from the checkout in Electron. On macOS it opens `build/dev/Chordinal.app`, a renamed copy of Electron made by `tools/install-app.sh --dev` (and remade when Electron, the icon or that script changes), so the menu bar, the Dock and the microphone prompt say Chordinal. The main process (`apps/desktop/src/chordinal.ts` and what it imports) is bundled by `tools/build.mjs` into `apps/desktop/dist/chordinal.js`, and its preload into `dist/preload.cjs`: a packaged app can't run TypeScript from `node_modules`, and a sandboxed preload can't load other files. Every IPC handler goes through `apps/desktop/src/ipc.ts`, which refuses a message from any frame that isn't the app's own page on `app://game/`. `just install-desktop` (`tools/install-app.sh`) makes it an app you open from the Dock: on macOS a copy of the Electron in `node_modules`, renamed to Chordinal with its own bundle id and icon, whose only code is a stub that loads `apps/desktop/dist/chordinal.js` from the checkout, so it always runs what's checked out (as last built), with its `soundfonts/`. On Linux it adds a launcher to `~/.local/share/applications`. Run it again after moving the checkout or updating Electron. To share it, make release builds (below).

`apps/desktop/src/shell.ts` serves the repository on a private `app://game/` origin and lets that origin (and nothing else) use the microphone. The settings (library, panel sizes, browser tab, last project, grid, theme) go to `save.json` in Electron's user data folder (`Chordinal`) through `apps/desktop/src/preload.ts`, beside Open Recent. Projects are folders anywhere on disk, saved in `Documents/Chordinal/` unless you pick somewhere else. On macOS `just run-desktop` starts Electron with `open`, so the microphone prompt is for the app and not for the terminal. If you refused it, turn on Electron (or Chordinal, for the installed app) under System Settings → Privacy & Security → Microphone.

The icon is drawn by hand in `apps/desktop/assets/icon.svg`, a tile on Apple's icon grid with a white glyph. `just icons` (`tools/make-icons.sh`, needs Inkscape) renders it into `apps/desktop/assets/icon/`: `icon.icns` for the macOS app, which `just install-desktop` and the release builds put in the bundle, `icon.ico` and `icon.png` for Windows and Linux (the window's icon). The rendered files are committed, so only a change to the SVG needs Inkscape.

Two flags help while working on it:

- `--dev` (what `just run-desktop-watch` passes) reloads the window whenever `dist/` changes.
- `--headless` shows no window and mutes the audio, asks for no microphone, and keeps its settings
  in a temporary folder. Use it for scripted UI tests (for example with Playwright's `_electron`),
  so they don't play sound or change your settings.

  Menus in a headless run: click a menu-bar item with
  `app.evaluate(({ Menu }, id) => Menu.getApplicationMenu().getMenuItemById(id).click(), 'undo')`
  (ids are the keys of `COMMANDS` in `packages/ui/src/commands.ts`; Cmd shortcuts belong to the menu bar,
  so a scripted `Meta+Z` does nothing). A right-click menu isn't shown; it is kept as
  `globalThis.contextMenu` in the main process, whose `items` a test can read and click.

  Nothing else reaches the screen in a headless run either: closing or reloading with unsaved changes closes without asking (Chordinal asks in its own window, which a test answers by clicking), the file dialogs answer as if cancelled unless a test queued an answer in `globalThis.headlessAnswers` (`{ saveDialog: [path], openDialog: [path] }`) in the main process, and opening a doc, a link or the Finder does nothing. Each of these is kept in `globalThis.headlessPrompts` in the main process for a test to read (`apps/desktop/src/headless-screen.ts`, tested in `test/electron/`). A test that launches the app kills it when done.

  Exports in a headless run: swap the save dialog for a stub in the main process, with
  `ipcMain.removeHandler('file:save')` and a new `ipcMain.handle('file:save', …)` that keeps the
  bytes, then run `exportAudio`, press Export in the dialog and read the WAV it was given. Stems go
  through `file:chooseFolder` and `file:writeInFolder`; stub those the same way. The audio export
  renders offline, so it works with the audio muted.

### Release builds

`just package-desktop` builds the installable app for this OS with electron-builder, from `apps/desktop/electron-builder.json`, into `release/chordinal/`. On macOS it is a `.dmg` and a `.zip` for Apple silicon and for Intel, ad-hoc signed and not notarized; on Windows an NSIS installer; on Linux a `.flatpak` bundle. The Flatpak needs `flatpak` and `flatpak-builder` and the Flathub remote (`flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo`), from which it installs the freedesktop runtime and the Electron base app it's built on (version `flatpak.runtimeVersion`). It may use Wayland or X11, the GPU, the network (downloads), PulseAudio or PipeWire (sound and the microphone), and the home folder, since projects can be anywhere. Its settings and downloaded libraries go in `~/.var/app/<app id>/`. It carries `dist/`, `src/`, `electron/`, the docs and the tools its main process uses, unpacked (no asar), plus, as a resource, `soundfonts/GeneralUser-GS/` (downloaded first if it's missing). `test/tools/packaging.test.js` follows the app's imports from its entry and page and fails when a file it loads isn't in the config's `files`.

A release build takes its SoundFonts from the app's resources, then from `soundfonts/` in Electron's user data folder, where the Instruments tab's **Download** puts FluidR3_GM and MuseScore_General (`apps/desktop/src/soundfont-download.ts`: the same sources as `tools/fetch-soundfonts.sh`, read as they stream in, into a temporary folder renamed when done; `app.isPackaged` in `apps/desktop/src/shell.ts`).

A headless run uses a temporary user data and Documents folder, so a test of a release build can launch `release/chordinal/mac-arm64/Chordinal.app/Contents/MacOS/Chordinal --headless` with Playwright's `_electron.launch({ executablePath })`. `npx electron-builder --mac dir --arm64 --config apps/desktop/electron-builder.json` builds only the `.app`, which is quicker for that.

To publish a release, set `version` in `package.json`, commit, and push a tag `v<version>`. `.github/workflows/release.yml` tests and builds the app on macOS, Windows and Linux and attaches the builds to one draft release on GitHub; check it and publish it there.

## Adding a command

Add it to `COMMANDS` in `packages/ui/src/commands.ts` with a label, an `accelerator` (a Cmd shortcut the menu bar answers) or `shown` (a plain key the page answers, which still types in a text field; never one of the musical-typing letters `A`–`L`, `;`, `'`, `W E T Y U O P`, `Z`, `X`; a letter waits while the piano roll has the focus, since its letters play notes there), and `enabled`/`checked` if it has them. Mark it `field: true` if it changes the project and its Cmd shortcut should go to a text field that has focus instead (Cmd+Backspace deletes text there, not the track). Then put `item('id')` in the shared menus in `packages/ui/src/menu-bar.ts` (or the File menu in `apps/web/src/menu-bar.ts`) and in any right-click menu in `packages/ui/src/context-menus.ts` it belongs in.

## SoundFont libraries

| Library | Folder | Size | License |
|---|---|---|---|
| GeneralUser GS 2.0.3 | `soundfonts/GeneralUser-GS/` | 32 MB | GeneralUser GS License v2.0: free for commercial music and software |
| FluidR3_GM | `soundfonts/FluidR3_GM/` | 148 MB | MIT |
| MuseScore_General 0.2 | `soundfonts/MuseScore_General/` | 216 MB | MIT; keep its credits in any derivative |

`soundfonts/` is ignored by git; `just soundfonts` runs `tools/fetch-soundfonts.sh`, which
downloads every library (or the ones named, like `just soundfonts generaluser`) that isn't on disk
yet, with its license file next to its `.sf2`. The deploy runs the same script, and so does
`just package-desktop`, for GeneralUser GS only. A release build downloads the other two itself
(`apps/desktop/src/soundfont-download.ts`). The libraries and their folders are listed in
`packages/audio/src/soundfont-libraries-data.ts`.

### Adding or replacing a library

1. Put the `.sf2` and its license file in `soundfonts/<folder>/`, and add the download to
   `tools/fetch-soundfonts.sh`, so `just soundfonts` and the deploy fetch it too, and to `DOWNLOADS`
   in `apps/desktop/src/soundfont-download.ts`, so a release build can download it.
2. Add the library to `LIBRARY_SOURCES` in `packages/audio/src/soundfont-libraries-data.ts`.
3. Run `just catalog` to regenerate `packages/audio/src/soundfont-catalog-data.ts`, the list of every
   file and preset that lets the instrument menu load without the files.
4. Run `just check` and `just test`.

### Chip instruments

The chip instruments aren't a file. `packages/lib/src/chip-synth.ts` builds them in memory the first time
one is played: pulse waves at the NES's 12.5%, 25% and 50% widths, a pulse-width sweep, triangle,
saw and sine, each stored with only the harmonics its notes can play cleanly, and drum kits made
from NES-style LFSR noise and falling tones. They come with every library, listed under
"Chip · built in" (melodic on bank 64, kits on bank 192). A song uses them with `sound: 'chip'`.
The Chiptune genre sets that.

To change how they sound, edit `packages/audio/src/chip-instruments-data.ts`; the fields are documented
at the top of `chip-synth.ts`:

- `wave`: the shape. `steps` quantises it, like the NES triangle's 16 levels. `dpcm` plays the
  cycle through the NES sample channel's delta coding (a counter stepping 2 a clock), for the
  gritty DPCM Bass; fewer clocks a cycle is grittier.
- `soft`: how far the upper harmonics are rolled off. 0 is the raw chip; 0.3–0.6 is the modern sound.
- `layers`: detuned, panned or octave copies, for width.
- `env`: attack, decay, sustain and release.
- `filter`: a low-pass, optionally swept for a pluck.
- `velocityTone: false`: soft notes are quieter but not darker.
- A kit drum's `dpcm` is the sample-channel rate its hit is delta-coded at. The DPCM Kit (kit
  program 2) has its kick, snare, clap and toms on the sample channel and its hats on the noise
  channel, as the later NES soundtracks did.

Keep each program in its General MIDI family (80–87 leads, 38–39 bass, 88–95 pads), so
Humanize's vibrato, slide and scoop rules still pick it up. `CHIP_ROLES` is the instrument each part
falls back to when the band names one the chip bank doesn't have.

## Adding to the interface

The interface lives in `packages/ui/src/`: the state as signals in `store.ts`, what the controls do in
`document.ts` (open, save, New and `edit`), `player.ts`, `recording.ts` and `live.ts`, and the
views in `components/`. A view reads signals and calls actions; it doesn't touch the audio engine
itself. Every change to the project goes through `edit(p => …)` with one of the pure
edits in `packages/daw/src/` (`project.ts`, `timeline.ts`, `note-edits.ts`), so it can be undone; add a new edit there, with a test. DAW logic that isn't about
songs goes in `packages/daw/`; music logic goes in `packages/sketch/` or `packages/perform/`, which know nothing of the interface,
and content goes in a `*-data.js` file with a test. Show a control only when there is code behind
it. The full rules are in [architecture.md](architecture.md#rules).
