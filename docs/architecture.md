# Architecture

A desktop app (Electron), whose page also runs in a plain browser, with a DAW-style UI in [Preact](https://preactjs.com) and [signals](https://preactjs.com/guide/v10/signals). Vite builds `apps/web/index.html` and everything `apps/web/src/main.tsx` imports into `apps/web/dist/` (`chordinal.js`, `chordinal.css`, `just build`); esbuild bundles the desktop main process and preload into `apps/desktop/dist/`. The code is a pnpm workspace: engine packages in `packages/`, the page in `apps/web/` and the Electron shell in `apps/desktop/` (see [Layout](#layout)). `apps/web/src/` holds the app's shell, layout, File menu and files, its browser (`apps/web/src/components/`, with what it and the track headers do in `apps/web/src/rack.ts`), Generate Part… (`apps/web/src/generate.ts`), and Record Melody and Record a Chord (`apps/web/src/whistle.ts`, over the shared recorder in `packages/ui/src/recording.ts`); the views and actions are in `packages/ui/src/`. Everything below `packages/ui/src/` is plain ES modules with no DOM in the music logic, so the tools in `tools/` and the tests in `test/` run it in Node as it is.

## This app

A small DAW (projects of tracks and clips of notes, played with sampled instruments from three openly licensed General MIDI SoundFont libraries in `soundfonts/`) with two things on top: a rule-based composer that writes a new project from a feeling, a genre or a song spec, and recording a melody from the microphone into notes on any track. The DAW (`packages/daw/`) knows nothing of either. The composing method is in [composing.md](composing.md).

Chordinal's window has a transport bar at the top, a browser on the left (instruments, kits, projects, the open project's takes), the arrangement in the middle (a ruler with the markers, the chord track, a row per track whose header carries its mute, solo and volume) and an editor at the bottom (the piano roll for the selected track, the step grid or the mixer). Every colour is a token in `packages/ui/src/ui.css`, set for a dark and a light theme; `packages/ui/src/theme.ts` picks one from the Theme setting and reads them back for the canvases.

| File | Does |
|---|---|
| `packages/lib/src/sf2.ts` | parses a `.sf2` ArrayBuffer into presets → regions (key/velocity range, sample, merged generators) |
| `packages/lib/src/sf2-voice.ts` | region + key + velocity → pitch, gain, pan, loop points, filter, volume envelope |
| `packages/lib/src/notes.ts` | MIDI note names and black/white keys |
| `packages/lib/src/music-theory.ts` | keys, modes, scale degrees, Roman-numeral chords (secondary, slash and extended), accidentals that follow a chord, a stable hash for tie-breaks |
| `packages/lib/src/voicing.ts` | chord voicings: least-motion voice leading, shells, drop 2 |
| `packages/lib/src/chip-synth.ts` | chip instruments made in code: band-limited pulse, PWM, triangle, saw and sine cycles per key zone, drum hits from LFSR noise and falling tones, and the NES sample channel's delta coding for both, as an in-memory font in `parseSf2`'s shape |
| `packages/lib/src/impulse.ts` | a seeded synthetic reverb impulse response |
| `packages/lib/src/midi-file.ts` | Standard MIDI Files: writes one from a score, with tempo and meter changes (`just compose … --midi`), and reads one (format 0 or 1) back into tracks of notes |
| `packages/lib/src/tempo-map.ts` | a song's tempo over time (steady or ramping segments) and conversion between beats and seconds |
| `packages/lib/src/pitch-track.ts` | a single line's pitch and level (300 to 4,000 Hz), 100 frames a second (YIN), vibrato kept in the frames |
| `packages/lib/src/transcribe.ts` | pitch frames → notes in 8ths and triplets, chosen beat by beat: tuning offset, note starts (silences, dips, pitch changes, glides left out), the beat grid near a rough tempo (or on a click's, `clickGrid`), vibrato per note, key guess, and the composer's degree notation with `~` for vibrato; `freeNotes` reads notes recorded with no beat; `readLive` reads a take as it is recorded, a little more each time, once the click grid is fixed |
| `packages/lib/src/chord-guess.ts` | an arpeggio take → a progression: chords in the key scored against the notes, the changes found with them by dynamic programming over beats, slash basses from the arpeggio's first note, runners-up, and the key settled by which reading fits best; with `melody` it harmonises a tune instead (triads, changes on bar lines and half bars); `nameChord` names one chord recorded freely |
| `packages/lib/src/wav.ts` | 16-bit WAV files, mono or more channels: recorded takes and audio exports |
| `packages/lib/src/motif.ts` | a motif's developments: sequence, inversion, retrograde, augmentation, diminution, fragmentation |
| `packages/playback/src/audio-engine.ts` | the AudioContext, master volume and mastering chain (air, glue compressor, limiter), resumed on the first gesture; the output's level; `render`, which swaps in an offline context to render faster than real time |
| `packages/playback/src/ticker.ts` | a Worker-driven interval for audio scheduling, so a background tab doesn't starve a song |
| `packages/playback/src/mic.ts`, `mic-worklet.js` | the microphone, raw (no echo cancelling, noise suppression or gain riding), in blocks stamped with the app's AudioContext time, so a take lines up with a click on the same context; audio files decoded to mono |
| `packages/ui/src/platform/midi.ts` | Web MIDI input as note/cc messages |
| `packages/ui/src/platform/keys.ts` | musical typing: computer keys → semitones and octave steps, and whether focus is in a text field |
| `packages/ui/src/platform/storage.ts` | the settings, through the desktop bridge's `storage` |
| `packages/ui/src/platform/app-menu.ts` | the native menu bar and right-click menus, built by the desktop app from plain items; each item's action stays in the page, which gets back the id of the item picked; also opening a doc, showing a file in the Finder and saving a file where the user picks |
| `packages/ui/src/platform/project-folders.ts` | Chordinal's projects: `projectStore()` (the desktop's folders, or the browser's IndexedDB), plus Open Recent and the Open and Save dialogs; and the window's close question (`docWindow`) |
| `packages/ui/src/platform/native-bridge.ts` | the desktop app's one bridge, `window.chordinalNative` (settings, SoundFonts, menus and file dialogs, project folders, the window), as a typed interface the preload checks itself against; `nativeBridge()` is undefined in a browser |
| `packages/ui/src/store/project-store.ts` | the one way the UI reaches projects: `ProjectStore` (read gives the text and a version; write takes the version it expects and throws `ConflictError` if the project changed since), and the takes |
| `packages/ui/src/store/{memory,browser,native}-store.ts` | the stores: in memory (tests, the page on its own), the browser's IndexedDB (`idb-keyval.ts`), and the desktop's folders over the preload bridge |
| `packages/ui/src/store/save-session.ts` | the save session as a statechart: new, saved, saving and conflict, and which version a save must pass |
| `packages/ui/src/store/classify-file.ts` | what an opened file is: a project, one from a newer Chordinal, something else, or a damaged project |
| `packages/ui/src/platform/soundfonts.ts` | which SoundFont libraries are installed, and downloading one, through the desktop app |
| `packages/playback/src/soundfont.ts` | downloads and caches `.sf2` files; `createInstrument(font, preset, destination)` plays notes as Web Audio voices, with optional delayed vibrato and legato glides |
| `packages/playback/src/pitch-moves.ts` | a voice's pitch moves on its detune: delayed vibrato, scoops, tracker arpeggios, falls |
| `packages/playback/src/mixer.ts` | a project's mixer: channel strips (layer gain, the user's gain, low cut, tone filter, fader, pan with optional auto-pan) and shared reverb and tempo-synced, slowly modulated delay buses |
| `packages/audio/src/soundfont-libraries-data.ts` | the libraries: id, name, folder and license |
| `packages/audio/src/soundfont-catalog-data.ts` | generated list of every library's files and presets, so the menu doesn't need the files up front (`just catalog`) |
| `packages/audio/src/chip-instruments-data.ts` | the chip instruments and kits (waves, layers, envelopes, filters), their banks, and the one each part falls back to; `soundfont.ts` builds them for the url `chip:` and every library lists them |
| `packages/audio/src/soundfont-library.ts` | the library in use, switched in the browser's Instruments tab; projects load their instruments from it |
| `packages/daw/src/project.ts` | the project model (see [the format](#project-files)) and its edits as pure functions returning a new project: tracks, clips, patterns, the mixer |
| `packages/daw/src/timeline.ts` | the timeline's edits: the base tempo and meter, tempo and meter changes, the loop, markers, and inserting and deleting time across everything at once |
| `packages/daw/src/note-edits.ts` | edits to a list of notes: quantize, humanize, scale, reverse |
| `packages/daw/src/history.ts` | the undo history: a list of earlier projects (`packages/ui/src/document.ts` merges consecutive edits of the same kind, a fader drag, into one step) |
| `packages/daw/src/project-format.ts` | `project.json`: writing it with one compact line per note, reading it with a format and version check and a check that every track, clip, note, tempo and meter can be played, in a fixed key order so a save changes only what changed |
| `packages/daw/src/project-midi.ts` | a project as a Standard MIDI File: a track each, drums on channel 10; and a MIDI file as a new project, or as tracks added to one |
| `packages/daw/src/steps.ts`, `packages/daw/src/gm-drums-data.ts` | the step grid's model: step sizes, which notes are on a step or off the grid, turning steps on and off and accenting them, a drum track's rows; the General MIDI drum names |
| `packages/daw/src/meter.ts` | bars from meter changes: bar lines, the bar a beat is in, beats per bar |
| `packages/daw/src/automation.ts` | automation lanes: the value at a beat from keyframes |
| `packages/daw/src/fx.ts` | MIDI FX: a registry of types (the app registers them) and `performProject(project, pass)`, which runs each track's notes through its FX for one pass round the loop, returning the notes and any events (a tape stop, a send swell) |
| `packages/playback/src/instruments.ts` | the SoundFont preset each track plays, from the library in use, loaded once and shared |
| `packages/playback/src/player.ts` | `playProject(project, instruments, { from, mix, click, ticker })`: a channel strip per track with a level meter, its notes through the MIDI FX and its automation and ducking, scheduled ahead on the audio clock through the tempo map, from any beat, round the loop with a new pass each time, with an optional metronome on each beat unit of the meter (an eighth in 6/8 and 7/8), the bars accented; the handle seeks, takes new faders and pans, reads the meters, and stops. `ticker` is what calls the scheduler: a timer live, the render's pauses offline |
| `packages/daw/src/play-parts.ts` | the pieces `playProject` schedules from: each loop pass's note events, the notes a start mid-way restarts, the beats a track ducks on, an automation lane on an audio param, a metronome click |
| `packages/composer/src/` | song spec → score, top down: the song plan (`plan.ts`: form, keys, meters, energy curve, cadences, tempo map, loop), chords per section (`harmony.ts`: cadences, harmonic rhythm, passing dim7s, harmony voices, call and response), the motif and melody (`melody.ts`; repeats in `melody-repeats.ts`, hand-written degree notation in `notation.ts`, `ornaments.ts`), the parts in any meter (`parts.ts`, `meter-patterns.ts`, `meter.ts`), arrangement and rhythm passes (`arrange.ts`, `syncopation.ts`), a chip song's techniques (`chip.ts`), all driven by `compose.ts`. The knowledge tables: `composer-data.ts`, `patterns-data.ts`, `song-craft-data.ts` (styles, variation, curve, tempo, motifs), `genre-data.ts` (genre profiles: defaults, progressions, extensions, voicing, cadences, scales, blue notes, phrase repeats), `performance-data.ts`, `ear-candy-data.ts`. Written songs: `songs-data.ts`, `genre-songs-data.ts` (one per genre, with a story), `game-songs-data.ts` (loops, a meter-changing boss, a leitmotif in two moods), `chip-songs-data.ts` and `classical-songs-data.ts`; `catalog.ts` lists them and the feelings for File → New. One part over a stretch of bars, for Chordinal's Generate Part…, comes from `part.ts` (`composePart`: a one-section song in the project's tempo, meter and key, over its chords spelt back as Roman numerals, keeping the one part). The score becomes a project in `to-project.ts` (a clip per section, markers, the chord track, the mix plan from `mix-plan.ts` as channel strips, automation and ducking). The performance (`perform.ts`: ghost notes, scoops, slides, vibrato, swing, timing; `ear-candy.ts`) runs at play time as the **Humanize** MIDI FX (`humanize-fx.ts`), which rebuilds the score's shape from a project's tracks, markers and groove |
| `packages/sketch/src/`, `packages/playback/src/recorder.ts` | recording → notes: recording a take over a click and count-in, read live a beat behind the playhead (`recorder.ts`, in playback since it needs the audio engine); reading a take, the chords recorded over stretches and the ones guessed for the rest (`takes.ts`); a melody and its chords as a section and a spec for New from melody (`sketch-spec.ts`); recording settings and the band it's composed for (`sketchpad-data.ts`) |
| `packages/ui/src/store.ts` | the app's state as signals: settings (saved), the open project, its name, history and whether it's saved, the selection (track, clip, notes, a stretch of the chord track), the transport |
| `packages/ui/src/document.ts` | the open project as a document: open, save, save as, New (empty, or from the composer), and `edit(fn, mergeKey)`, through which every edit goes so undo can take it back |
| `packages/ui/src/place.ts` | where the open project is kept, set at start-up (`apps/web/src/files.ts`): its folders on disk; how messages name it, how Save As asks, and the question before unsaved changes go |
| `packages/ui/src/player.ts` | plays the open project from the playhead, follows it (and the mixer's meters), stops, seeks, keeps the mixer's settings on the playing channels, and restarts after an edit that changes what's heard |
| `packages/ui/src/midi-import.ts` | File → Import MIDI File (a new project) and MIDI files dropped on a track (tracks added at that bar) |
| `packages/ui/src/bounce.ts` | Export as Audio File: the project, or a range of it, played once through an offline render and saved as a stereo WAV, or one WAV per track (stems) into a folder, optionally normalized |
| `packages/ui/src/components/ExportDialog.tsx` | the Export dialog: range, mix or stems, normalize, tail |
| `packages/ui/src/recording.ts` | recording → MIDI: recording a take into a new clip on the selected track (or a chord onto the chord track), dropped audio files and kept takes read the same way, keeping takes beside the project, and New from melody |
| `packages/ui/src/live.ts` | musical typing (while the piano roll has the focus, `focus.ts`) and MIDI input playing the selected track's instrument |
| `packages/ui/src/libraries.ts` | the SoundFont library in use (an installed one while the picked one isn't) and downloading the others from the Instruments tab |
| `packages/ui/src/commands/{shortcut,catalog}.ts` | the command catalog: `CommandCatalog` holds every command once (title, group, description, shortcut, when it can run), matches key presses (Cmd keys are the native menu bar's on the desktop, plain keys the page's, and text fields keep their own editing keys), keeps the recent commands for ⌘K, searches them, and turns one into a menu item; `parseShortcut` and `formatShortcut` read and print the `mod+shift+s` notation |
| `packages/ui/src/commands.ts` | the app's commands in that catalog, and the gate that holds them while a dialog is open; `menu-bar.ts` builds the Edit, Track, Transport and View menus from them and keeps the bar current, `keys.ts` hands key presses to the catalog |
| `packages/ui/src/components/{CommandMenu,ShortcutsDialog}.tsx` | ⌘K, which finds and runs any command by name, and the Keyboard Shortcuts window (⌘/), both built from the catalog; `docs/controls.md` is checked against it by `apps/web/test/controls.test.ts` |
| `packages/ui/src/timeline.ts` | tempo and meter: the whole song's, changes from a bar on, and the flags the ruler shows for them with their menu |
| `packages/ui/src/context-menus.ts` | the right-click menus, one per thing clicked, which select it first and are built from the commands and the actions below |
| `packages/ui/src/tracks.ts`, `packages/ui/src/notes.ts`, `packages/ui/src/clipboard.ts` | the actions on tracks and clips, on the piano roll's picked notes, and cut, copy, paste and duplicate for either |
| `packages/ui/src/steps.ts` | the step grid's actions (paint, accent, step size, rows, hearing a drum) and switching the editor between the piano roll and the step grid as clips are picked |
| `packages/ui/src/focus.ts`, `packages/ui/src/ask.ts` | which pane the editing keys act on; an in-app question for a name, a yes, or a choice such as Save, Don't Save or Cancel (Electron has no `prompt`) |
| `packages/ui/src/components/` | the views: `Transport`, `LibraryPicker`, `Arrange` (`Ruler`, `ChordLane`, a `TrackRow` per track with a `Knob`, sharing `arrange-view.ts`), `Editor` (`PianoRoll`, `Mixer` or `StepGrid`, whose geometry is in `grid-view.ts`), `Ask`; `canvas.ts` is a canvas that redraws when the signals it reads change, the piano roll's parts are `roll-view.ts` (what's shown, its geometry), `roll-draw.ts` (drawing), `roll-input.ts` (the pointer), `RollToolbar` and `RollPlayhead` |
| `packages/ui/src/ui.css` | the look: colour tokens and the panel grid |
| `apps/cli/src/compose-command.ts` | `chordinal compose`: composes a song in Node, prints the plan and melody, writes a `.mid` or a project folder (`just compose`) |
| `tools/make-projects.mjs` | writes the written songs as project files in `projects/` (`just projects`) |
| `tools/build.mjs` | builds the page with Vite (`apps/web/vite.config.ts`) and the desktop main process and preload with esbuild (`just build`, `--watch` for `just run-desktop-watch`, `--check` for `just check`) |
| `tools/install-app.sh` | installs Chordinal as a desktop app that runs this checkout (`just install-desktop`): a renamed Electron in `~/Applications` on macOS, with the app's icon; a launcher on Linux |
| `apps/desktop/assets/icon.svg`, `tools/make-icons.sh` | the app's icon source, and the script (`just icons`) that renders it into `apps/desktop/assets/icon/` |
| `apps/desktop/electron-builder.json` | the electron-builder config (`just package-desktop`): its entry, app id, name, icon, files and bundled resources |
| `apps/desktop/src/project-folders.ts` | Chordinal's project folders in its main process: reaching only folders the user picked in this run or has in Open Recent (the last ten, kept in its user data folder), and writing `project.json` through a temporary file, refused with `CONFLICT` when the file changed since the version the page read |
| `apps/desktop/src/write-atomic.ts` | writes a file to a temporary file beside it, then swaps it in, so a crash never leaves half a file |
| `apps/desktop/src/shell.ts`, `apps/desktop/src/preload.ts`, `apps/desktop/src/soundfont-download.ts` | the window and what it serves: the page built in `apps/web/dist/` (a release build: its resources) on `app://game/`, allows the microphone for that origin only, checks and downloads SoundFont libraries, and keeps the settings in a file in the app's user data folder through the bridge's `storage` (the preload exposes the one `chordinalNative` bridge). `--dev` reloads the window when `apps/web/dist/` changes; `--headless` runs it hidden and muted, with its own settings (in `--profile=<folder>` if given), for automated tests |
| `apps/desktop/src/ipc.ts` | the main process's IPC: every handler runs only for a message from the app's own page on `app://game/` |
| `apps/desktop/src/chordinal.ts` | Chordinal (`just run-desktop`): its project folders, Open Recent and the Open and Save dialogs (`Documents/Chordinal/` by default), and closing: with unsaved changes, the page asks its own question in the window and then closes it. A folder handed over at launch (command line or macOS open-file) opens instead of the last project |
| `apps/desktop/src/menus.ts` | the native menus from the page's items: the menu bar with macOS's app and Window menus round it, and right-click menus; Edit items act on a text field while one has focus, and items marked `field` leave their shortcut to it. Headless, a right-click menu is kept as `globalThis.contextMenu` for a test to click |
| `tools/whistle.mjs` | transcribes a recorded melody into a section's `melody:` line, or with `--chords` an arpeggio take into its `progression:` (`just whistle`) |
| `tools/nsf-report.mjs`, `tools/nsf/` | studies NES music: plays an NSF's 6502 driver (`cpu6502.js`, `nsf.js`), turns its 2A03/VRC6 register writes into notes, drum hits and loops (`decode.js`), and reports how each song's lead moves, its rows, echoes, vibrato and drums (`just nsf`) |
| `tools/audio-report.mjs`, `tools/audio/`, `tools/music-stats.js` | the same lead statistics from recorded music: follows the lead's pitch in the mixed audio (`lead.js`) and reuses `decode.js`'s note finding; `music-stats.js` holds the interval, turn and leap measures both reports share (`just audio`) |
| `apps/cli/src/export-command.ts`, `render-command.ts` | `chordinal export`: project folders as MIDI (in Node) and WAV, optionally MP3 through ffmpeg (`just export`); `chordinal render`: a game's songs file as loudness-matched, loop-cut mp3s and its tracks-data file. Both render in `apps/cli/src/page/` (`audioEngine.render` and `playProject`, as Export as Audio File does) in a hidden Electron window (`electron-main.ts`) that `browser.ts` serves and sends jobs; the cutting, seam, loudness and decode check are in `soundtrack.ts` |
| `tools/ab-server.mjs`, `tools/ab/` | A/B listening: renders each song with an older commit and with this checkout, offline in the browser, side by side (`just ab`) |

The synth covers the parts of SF2 that matter for these files: key/velocity splits, preset+instrument generator merging, root key and tuning, loop modes, sample address offsets, a low-pass filter swept by the modulation envelope (`modEnvToFilterFc`), modulators driven by the note's velocity or key (a font's own velocity→cutoff one replaces the default, which lowers the cutoff for soft notes), pan, the DAHDSR volume envelope, and exclusive classes (drum kits). Modulators on CCs, pressure or the pitch wheel, the modulation envelope's pitch amount, LFOs, reverb and chorus sends are not implemented. Many GeneralUser GS presets (distortion guitar, French horn, clarinet) start their filter at a few hundred Hz and open it with the modulation envelope, so they need both.

### SoundFont libraries

The libraries live in `soundfonts/<folder>/`, ignored by git and downloaded by `just soundfonts`; `packages/audio/src/soundfont-libraries-data.ts` lists them. The instrument menu is built from `soundfont-catalog-data.ts`, generated from the files by `just catalog`, so no `.sf2` (32–216 MB each) is fetched until one of its instruments is picked. `soundfont.ts` then downloads it once and keeps it in memory. Run from the checkout, the app serves `soundfonts/` as it is; a release build serves its bundled GeneralUser GS and the libraries downloaded into its user data folder under the same urls, and `packages/ui/src/libraries.ts` falls back to an installed library while the picked one isn't (`packages/ui/src/platform/soundfonts.ts` asks the desktop app which are there and downloads the others). `soundfont-library.ts` holds the library in use: switching it reloads the instrument musical typing plays, and the project (restarted if it's playing) loads its instruments from the new library. How to add one is in [development.md](development.md#soundfont-libraries).

### Project files

A project is a folder anywhere on disk (`Documents/Chordinal/<title>/` by default; the written songs are in the checkout's `projects/<name>/`), holding `project.json` and, once recorded into, `takes/` (the takes' WAVs are ignored by git). The file:

```
{ format: 'music-generator-project', version: 1 | 2, title, length (beats),
  tempoMap: [{ beat, bpm, to? }], meters: [{ beat, sig }], key: { tonic, mode } | null,
  markers: [{ beat, name, meta? }], loop: { from, to } | null, groove: {…}, chords: [{ beat, beats, name, tones }],
  tracks: [{ id, name, color, instrument: { bank, program },
             mixer: { volumeDb, pan, mute, solo, lowCut, sends, autoPan, duck },
             fx: [{ type, …params }], automation: { tone?, reverb?, delay? },
             stepRows?: [key, …],
             clips: [{ id, start, beats, mute?, step?, notes: [[beat, beats, key, vel, marks?], …] }
                     | { id, start, pattern, mute? }] }],
  patterns?: [{ id, name, beats, step?, notes }] }
```

A project with no pattern clips is written as version 1, without `patterns`; one with pattern clips is version 2, and each pattern clip names its pattern instead of holding notes. The reader takes both. In memory every pattern clip carries its pattern's notes, length and step, and `project.patterns` holds only ids and names, so playback and export read `clip.notes` as before; `updateClip` copies an edit to the notes, length or step to the pattern's other clips.

A beat is a quarter note; a note's beat is from its clip's start. `marker.meta`, `groove`, the FX params and a note's marks are opaque to the DAW: the Humanize FX reads them (a section's type and energy, swing, a track's role, a note's ornament). The reader takes version 1 only.

## Layout

A pnpm workspace. Each package is `@chordinal/<name>`, imported by that name through its `src/index.ts`, never by a path inside it. Each `index.ts` names what it exports (no `export *`).

| Package | Holds | May import |
|---|---|---|
| `packages/lib` | pure helpers: SoundFont parsing, music theory, pitch tracking, transcription, files | nothing |
| `packages/audio` | the SoundFont libraries and their catalog, the chip instruments' data, the library in use | lib |
| `packages/daw` | projects, their file, edits and undo, the parts playback schedules, the MIDI FX hook | lib |
| `packages/composer` | composing projects and the Humanize FX | lib, audio, daw |
| `packages/sketch` | recording → notes: reading takes, the melody as a song spec | lib, daw |
| `packages/playback` | everything on Web Audio: the AudioContext, instruments, the mixer, the player, the mic and the recorder | lib, audio, daw, sketch |
| `packages/ui` | the Preact UI: state, actions, commands and views, and the platform hooks (MIDI, keys, storage, menus, project folders) | all of the above |
| `apps/web` | the page: start-up, layout, File menu, files, the browser, Generate Part, recording | all of the above |
| `apps/desktop` | the Electron shell: the window, menus, project folders, settings, SoundFont downloads | audio (the library list) |
| `apps/cli` | the `chordinal` command line: compose, export and render, in Node; its render page in a hidden Electron window | lib, audio, daw, composer and Node; its page (`src/page/`) also playback, but not Node |

`lib`, `audio`, `daw`, `composer` and `sketch` are the engine: no DOM, no Node and no Preact. `composer` and `sketch` don't import each other. `eslint.config.js` and `test/architecture.test.ts` enforce all of this.

## Rules

- Imports only point down the table. For upward needs, pass a callback or a parameter.
- Content (songs, tables, tuning) goes in `*-data.ts` files that import nothing (types aside).
- State the UI shows lives in signals in `packages/ui/src/store.ts` (the recording in progress in `packages/ui/src/recording.ts`). Components read it and call actions; they don't keep copies.
- Files are named for what they do. No `utils.ts`, `helpers.ts`, `misc.ts`.
- The engine is covered by tests in each package's `test/`; the engine's edits and the save session also by seeded random-operation tests that check the project's invariants (`checkInvariants` in `packages/daw/src/invariants.ts`) after every step.

## Checking

```sh
just check    # prettier, eslint (the layer rules), tsc, the bundle, then the tests
just test     # node --test and vitest
```

`test/architecture.test.ts` checks what ESLint can't: the layers in each `package.json`, the pure engine, that only `native-bridge.ts` names the desktop bridge, that projects are reached only through the store, one place for key listeners, that every command id is in the catalog, named exports, and no `any`, `@ts-ignore`, `@ts-expect-error` or `eslint-disable` outside `test/architecture-exceptions.json`. Each failure says how to fix it.

A random-operation test prints the seed of a failing run. Replay it with `SEED=<n> npx vitest run <file>`, try more seeds with `RUNS=<n>`, and start elsewhere with `SEED_BASE=<n>`.

Setting up, the other `just` recipes and the tools are in [development.md](development.md).
