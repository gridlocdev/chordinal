# Chordinal: a DAW for making music by hand (PRD)

Chordinal is the desktop app in this repo, built for making music by hand: pick sounds, click in beats, draw notes, arrange parts, mix. It runs on the repo's engine (projects, player, instruments, mixer, piano roll, step grid, patterns) and offers the composer as one optional action, **Generate Part…**. The repo used to ship a second app, Music Generator, a generator window that handed its songs to Chordinal; it was dropped, and the composer lives on in Generate Part, the CLI and the games' API. Code that implements a section cites it (`Chordinal PRD §4.2`).

The patterns and step grid spec (`prd.md`, §3 to §7) stays in force. Chordinal uses it as written.

## §1 Goals

1. Start on an empty project or the last one, never on a list of generated songs. The main path is clicking things in by hand.
2. Work the way FL Studio and GarageBand users already work: a channel rack of instruments, a step grid for beats, a piano roll for melodies, a song built from patterns, and a mixer.
3. Generating is optional: a part generated into a track, edited by hand afterwards like any other clip.
4. One engine, one project format, one place to fix bugs. The app shell sits on shared modules (`packages/ui/`) that hold no app-only code.

## §2 Non-goals

- FL-style multi-track patterns. Parts are per-track clips, reused through linked patterns (`prd.md` §3).
- Floating or detachable windows. Views are docked in one window.
- Third-party plugins (VST, AU), notation, time-stretching audio.
- Any change to the composer API that games use (§12).

## §3 One app, one repo

1. Chordinal is the repo's one Electron entry, page bundle, menu bar, settings file and package: `apps/web/src/main.jsx`, built by `just build`, run by `just chordinal`.
2. Shared code:
   - `packages/ui/` holds the views and actions: the arrangement, piano roll, step grid, mixer, transport, browser parts, store, document, commands, clipboard and context menus.
   - `apps/web/` holds only the app's shell, layout, menus and app-only commands.
   - The layer rules put `ui` between the engine packages and `apps/web`.
3. electron-builder packages it from one config, with its own app id, icon and release flow.
4. It reads and writes `project.json` (versions 1 and 2), so projects saved before Music Generator was dropped still open.

## §4 Starting up and files

1. On start-up, Chordinal reopens the project that was open when it last quit.
2. On the first run, or if that project is gone, it opens a new project (§4.3) and says nothing.
3. **New** (`Cmd N`) opens a new project at once, with no dialog: 120 bpm, 4/4, 8 bars, a drum track (Standard kit) and a Grand Piano track. If the open project has unsaved changes, it asks first: "Save changes to <name>?", with Save, Don't Save and Cancel.
4. **Open…** (`Cmd O`) picks a project folder or its `project.json`, anywhere on disk.
5. **Open Recent** lists the last 10 projects opened or saved, newest first, plus **Clear Menu**.
   - A recent project that no longer exists is greyed out.
   - Choosing a missing project shows a notice, "<name> was moved or deleted", and removes it from the list.
6. **Save** (`Cmd S`) and **Save As…** (`Shift Cmd S`):
   - The first save of a new project asks for a name and a location. The default location is `Documents/Chordinal/`.
   - A project is a folder holding `project.json`. Saving is atomic: a temporary file, then a swap.
7. Closing the window or quitting with unsaved changes asks the same question as New.
8. The window title shows the project's name and a dot while it has unsaved changes.

## §5 The window

1. One window, docked, laid out like this:
   - Across the top: the browser's toggle, the project's title (a dot while there are changes to save) and what's loading on the left; the transport buttons and a display (bar and beat, tempo, meter, key, section) in the middle; New, Save, Save as and the master volume on the right.
   - Left: the browser (§7).
   - Centre: the arrangement (ruler, markers, chord track, and a row per track whose header is the track's channel, §6).
   - Bottom: the editor, with tabs Piano Roll, Mixer and Step Grid (`Cmd 1`, `Cmd 2`, `Cmd 3`). The tabs and the open view's toolbar share one bar.
2. The browser's width and the editor's height are draggable. Both are saved in Chordinal's settings. `B` hides and shows the browser.
3. Tab switching follows `prd.md` §4.2.
4. The look has a dark and a light theme. **View ▸ Theme** picks System (follows the OS), Light or Dark; the choice is saved in the settings. Motion stops when the OS asks for reduced motion, and the focused control has a visible ring.

## §6 The track headers

1. Each track's row in the arrangement starts with its header: the track's colour, name and instrument name, mute and solo buttons, and a volume knob. Double-clicking the knob resets it to 0 dB. The tracks are listed once, here; there is no separate rack.
2. Clicking a header selects the track. Double-clicking opens its editor: the step grid for drums, the piano roll otherwise. If the track has no clip at the playhead, it first makes one, a 1-bar pattern on drum tracks. Double-clicking the name renames the track.
3. Dropping an instrument from the browser on a track sets its instrument. Dropping it below the tracks adds a track with it.
4. Below the tracks, **+ Track** (`Alt Cmd N`) adds an instrument track and **+ Drums** adds a drum track with the Standard kit.
5. Right-clicking a header shows the track menu, Delete Track among it.
6. Headers can be dragged into a new order, which reorders the tracks; dropped below the tracks, a header moves its track last.

## §7 The browser

1. The browser has tabs:
   - **Instruments**: the SoundFont libraries and the chip instruments, grouped by General MIDI family.
   - **Kits**: the drum kits.
   - **Projects**: the recent projects and the folder `Documents/Chordinal/`.
   - **Takes**: the open project's whistled takes (§9.3), to read onto a track again.
2. Clicking an instrument plays a short preview on middle C. Clicking a kit plays a kick, a snare and a closed hat.
3. Later work adds the Synths, Effects and Samples tabs (§11).

## §8 Generate Part…

1. **Track ▸ Generate Part…** (and the track header's right-click menu) opens a dialog. Choose:
   - **Part**: drums, bass, chords, pad, arpeggio, melody or countermelody. The default comes from the track: drums on a drum track, melody otherwise.
   - **Style**: the composer's feelings and genres.
   - **Seed**: shown, with **Roll** to pick another.
   - **Range**: the selection, the loop, or the whole project, defaulting to the first that exists.
2. Generate Part uses the project's tempo, meter and key. If the project has no key, the dialog shows a key picker (default C major). If the project has a chord track over the range, the part follows those chords. If not, the composer writes chords for the range, and for parts that need them it fills the chord track too, in the same undo step.
3. The result is one new clip on the selected track over the range: a pattern clip on a drum track, an ordinary clip otherwise. Clips already there are kept, and the new clip is laid over them. With no track selected, it adds a track with the part's usual instrument.
4. Generating is one undo step. **Generate Again** (same dialog, `Cmd G` while it's open) rolls a new seed and replaces the last generated clip, if it hasn't been edited since.
5. If the composer can't write the part for the meter (for example a style that doesn't support 7/8), the dialog says "<Style> can't write <part> in <meter>." and adds nothing.
6. This uses the composer through a new function beside `compose` and `toProject`. Their signatures and output don't change.

## §9 Whistling and the tools

1. Music Generator, the second app this section once described, was dropped. Its New dialog lives on as Generate Part (§8) and `just compose`.
2. Its songs are the projects in `projects/`, opened in Chordinal with **Open…**.
3. Whistling is a Chordinal feature: **Record Melody** on a track, and the chord track's whistle-a-chord.
4. `just compose`, `just projects`, `just export`, `just whistle` and the other tools keep working as they do now.

## §10 Patterns and the step grid

1. As `prd.md` §3 and §4, unchanged: per-track clips, linked pattern clips, and a drum step grid.
2. A track header's double-click (§6.2) is the FL-style way in. The arrangement's double-click on a drum lane (`prd.md` §3.4) still works.

## §11 Later work, in order

Each gets its own interview and PRD section before it's built.

1. **Synths and insert effects**, built together:
   - Each mixer channel gets an insert chain: EQ (3 bands), compressor, distortion, chorus, delay and reverb, reordered by drag and bypassed per effect.
   - A subtractive synth: two oscillators, noise, a filter with its own envelope, an amp envelope, an LFO and glide, with presets.
   - Synths and effects are saved in the project. The browser gains Synths and Effects tabs.
2. **Melodic step grid and per-step settings**: rows from the project's key over an octave range, a velocity lane, per-step length, probability and swing, and a strip of steps per drum row inline in the arrangement.
3. **Audio tracks and samples**:
   - Record from a microphone, or drop audio files onto audio tracks, kept in the project folder.
   - Drum rows can play a one-shot sample (drop a `.wav` on a row) instead of a kit sound.
   - The browser gains a Samples tab.
4. **Pattern browser**: a list of the project's patterns, dragged onto lanes.

## §12 What must not change

1. The games' API, exactly as `prd.md` §8: `compose`, `toProject`, `playProject`, `loadInstruments`, `registerFx`, the Humanize FX and `beatToSeconds`. Their signatures and output stay as they are.
2. Every project in `projects/` opens and plays the same in Chordinal.
3. A project saved by an older build still opens: the format id and versions 1 and 2 stay readable.

## Decisions

1. The track headers show no inline steps in 1.0. Double-clicking a header opens the step grid (§6.2). Inline steps come with the melodic grid (§11.2).
2. Music Generator is dropped; the composer stays as Generate Part, the CLI and the games' API (§9.1).
3. Whistling lives in Chordinal (§9.3).

The slices are in [2-chordinal.md](2-chordinal.md).
